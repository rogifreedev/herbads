import "server-only";
import { randomUUID } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { getBatchLaunchJob, mapLaunchJob, type BatchLaunchJobRow } from "@/lib/batch-launch";
import { downloadBatchMedia } from "@/lib/batch-launch-drive";
import { buildCreativePayload } from "@/lib/batch-launch-plan";
import { MetaLaunchError, metaLaunchRequest } from "@/lib/meta/batch-launch";
import { BATCH_CACHE_TAGS, revalidateCacheTags } from "@/lib/cache-tags";

function createdId(result: { id?: string }) {
  if (!result.id || !/^\d+$/.test(result.id))
    throw new MetaLaunchError("Meta hat keine eindeutige Objekt-ID zurueckgegeben.", true);
  return result.id;
}

export async function processBatchLaunch(clientId: string, jobId: string, queueToken: string) {
  const db = createSupabaseServiceRoleClient();
  const token = randomUUID();
  const current = await getBatchLaunchJob(clientId, jobId);
  if (["completed", "review", "paused", "cancelled", "failed"].includes(current.status)) return mapLaunchJob(current);
  const { data: claimed, error: claimError } = await db
    .rpc("claim_batch_upload_step", {
      p_client_id: clientId,
      p_job_id: jobId,
      p_queue_token: queueToken,
      p_token: token
    })
    .maybeSingle();
  if (claimError) throw new Error(claimError.message);
  if (!claimed) return mapLaunchJob(await getBatchLaunchJob(clientId, jobId));
  const job = claimed as BatchLaunchJobRow;
  const { state, payload } = job;
  const { input, files, metaAccountId } = payload;

  async function persist(release = false) {
    const { error, data } = await db.rpc("persist_batch_upload_step", {
      p_client_id: clientId,
      p_job_id: job.id,
      p_token: token,
      p_state: state,
      p_status: job.status,
      p_error: job.error,
      p_release: release
    });
    if (error || !data) throw new Error("Upload-Fortschritt konnte nicht gespeichert werden.");
  }

  async function createObject(operation: string, path: string, values: Record<string, unknown>) {
    state.inFlight = operation;
    await persist();
    const result = await metaLaunchRequest<{ id: string }>(path, values);
    return createdId(result);
  }

  try {
    // A previous worker may have died after Meta created an object but before its ID was saved.
    if (state.inFlight) {
      job.status = "review";
      job.error =
        "Ein Erstellungsschritt wurde unterbrochen. Bitte die bereits pausiert erstellten Objekte in Meta pruefen; es werden keine Duplikate automatisch angelegt.";
    } else if (!state.adsetId) {
      state.step = "adset";
      state.adsetId = await createObject("adset", `${metaAccountId}/adsets`, payload.adsetPayload);
      delete state.inFlight;
    } else {
      const nextFile = files.find((file) => {
        const media = state.media[file.id];
        return file.kind === "image" ? !media?.imageHash : !media?.ready;
      });
      if (nextFile) {
        state.step = "upload";
        const media = (state.media[nextFile.id] ??= {});
        if (nextFile.kind === "image") {
          const bytes = await downloadBatchMedia(nextFile);
          const result = await metaLaunchRequest<{ images?: Record<string, { hash?: string }> }>(
            `${metaAccountId}/adimages`,
            { bytes: bytes.toString("base64"), name: nextFile.name }
          );
          const hash = Object.values(result.images ?? {})[0]?.hash;
          if (!hash) throw new Error("Meta hat keinen Bild-Hash geliefert.");
          media.imageHash = hash;
        } else if (!media.videoId) {
          const result = await metaLaunchRequest<{
            video_id: string;
            upload_session_id: string;
            start_offset: string;
            end_offset: string;
          }>(`${metaAccountId}/advideos`, { upload_phase: "start", file_size: nextFile.size }, true);
          if (!result.video_id || !result.upload_session_id)
            throw new Error("Meta konnte den Video-Upload nicht starten.");
          media.videoId = result.video_id;
          media.uploadSessionId = result.upload_session_id;
          media.startOffset = Number(result.start_offset);
          media.endOffset = Number(result.end_offset);
        } else if (media.startOffset !== media.endOffset) {
          const bytes = await downloadBatchMedia(nextFile, media.startOffset!, media.endOffset!);
          const form = new FormData();
          form.set("upload_phase", "transfer");
          form.set("upload_session_id", media.uploadSessionId!);
          form.set("start_offset", String(media.startOffset));
          form.set("video_file_chunk", new Blob([new Uint8Array(bytes)], { type: nextFile.mimeType }), nextFile.name);
          try {
            const result = await metaLaunchRequest<{ start_offset: string; end_offset: string }>(
              `${metaAccountId}/advideos`,
              form,
              true
            );
            media.startOffset = Number(result.start_offset);
            media.endOffset = Number(result.end_offset);
          } catch (error) {
            const offsets =
              error instanceof MetaLaunchError && error.details?.error_subcode === 1363037
                ? (error.details.error_data as { start_offset?: string; end_offset?: string } | undefined)
                : undefined;
            if (!offsets?.start_offset || !offsets.end_offset) throw error;
            media.startOffset = Number(offsets.start_offset);
            media.endOffset = Number(offsets.end_offset);
          }
        } else if (!media.finished) {
          const result = await metaLaunchRequest<{ success: boolean }>(
            `${metaAccountId}/advideos`,
            { upload_phase: "finish", upload_session_id: media.uploadSessionId, title: nextFile.name },
            true
          );
          if (!result.success) throw new Error("Meta konnte den Video-Upload nicht abschliessen.");
          media.finished = true;
          media.finishedAt = new Date().toISOString();
        } else {
          state.step = "processing";
          const result = await metaLaunchRequest<{
            status?: { video_status?: string };
            picture?: string;
            thumbnails?: { data: { uri: string; is_preferred?: boolean }[] };
          }>(`${media.videoId}?fields=status,picture,thumbnails{uri,is_preferred}`);
          if (result.status?.video_status === "error")
            throw new Error(`Meta konnte das Video ${nextFile.name} nicht verarbeiten.`);
          if (result.status?.video_status === "ready") {
            media.thumbnailUrl =
              result.thumbnails?.data.find((thumb) => thumb.is_preferred)?.uri ??
              result.thumbnails?.data[0]?.uri ??
              result.picture;
            media.ready = Boolean(media.thumbnailUrl);
          }
          if (!media.ready && media.finishedAt && Date.now() - Date.parse(media.finishedAt) > 30 * 60000)
            throw new Error(`Video ${nextFile.name} ist bei Meta noch nicht bereit. Bitte spaeter fortsetzen.`);
        }
      } else {
        const group = input.groups.find((item) => !state.ads[item.id]?.adId);
        if (group) {
          const ad = (state.ads[group.id] ??= {});
          if (!ad.creativeId) {
            state.step = "creative";
            ad.creativeId = await createObject(
              `creative:${group.id}`,
              `${metaAccountId}/adcreatives`,
              buildCreativePayload(group, files, state.media, input.copy)
            );
          } else {
            state.step = "ad";
            ad.adId = await createObject(`ad:${group.id}`, `${metaAccountId}/ads`, {
              name: group.name,
              adset_id: state.adsetId,
              creative: { creative_id: ad.creativeId },
              status: "PAUSED"
            });
          }
          delete state.inFlight;
        } else if (input.activate && !state.activated) {
          state.step = "activate";
          const nextAd = input.groups.map((item) => state.ads[item.id]).find((ad) => !ad.activated);
          if (nextAd) {
            // Ads can be enabled safely while their new parent adset remains paused.
            const result = await metaLaunchRequest<{ success: boolean }>(nextAd.adId!, { status: "ACTIVE" });
            if (!result.success) throw new Error("Meta hat die Anzeigen-Aktivierung nicht bestaetigt.");
            nextAd.activated = true;
          } else {
            const campaign = await metaLaunchRequest<{
              status: string;
              daily_budget?: string;
              lifetime_budget?: string;
            }>(`${input.campaignId}?fields=status,daily_budget,lifetime_budget`);
            if (campaign.status !== "ACTIVE")
              throw new Error(
                "Die Zielkampagne ist nicht aktiv. Aktivierung angehalten; die Kampagne wird nicht automatisch aktiviert. Bitte den Status in Meta pruefen."
              );
            if (
              Number(campaign.daily_budget ?? 0) !== payload.campaign.dailyBudget ||
              Number(campaign.lifetime_budget ?? 0) !== payload.campaign.lifetimeBudget
            )
              throw new Error(
                "Das Kampagnenbudget wurde waehrend des Uploads geaendert. Aktivierung angehalten; bitte das Budget in Meta pruefen."
              );
            // Persist before the spend-enabling write; status updates on this known ID are safe to retry.
            state.activationStarted = true;
            await persist();
            const result = await metaLaunchRequest<{ success: boolean }>(state.adsetId, { status: "ACTIVE" });
            if (!result.success)
              throw new Error("Meta hat die Adset-Aktivierung nicht bestaetigt. Bitte den Status in Meta pruefen.");
            state.activated = true;
          }
        } else {
          state.step = "saving";
          if (await storeCreatedBatch(job)) {
            state.step = "done";
            job.status = "completed";
            revalidateCacheTags(...BATCH_CACHE_TAGS);
          }
        }
      }
    }
  } catch (error) {
    const ambiguous = Boolean(state.inFlight) && (!(error instanceof MetaLaunchError) || error.uncertain);
    job.status = ambiguous ? "review" : "failed";
    job.error = error instanceof Error ? error.message : "Batch-Erstellung fehlgeschlagen.";
    if (!ambiguous) delete state.inFlight;
  }
  await persist(true);
  return mapLaunchJob(await getBatchLaunchJob(clientId, jobId));
}

async function storeCreatedBatch(job: BatchLaunchJobRow) {
  const db = createSupabaseServiceRoleClient();
  const { payload, state, client_id: clientId, ad_account_id: accountId } = job;
  const { input, campaign } = payload;
  const status = state.activated ? "ACTIVE" : "PAUSED";
  const campaignResult = await db
    .from("meta_campaigns")
    .upsert(
      {
        client_id: clientId,
        ad_account_id: accountId,
        meta_campaign_id: campaign.id,
        name: campaign.name,
        objective: campaign.objective,
        status: campaign.status
      },
      { onConflict: "ad_account_id,meta_campaign_id" }
    )
    .select("id")
    .single();
  if (campaignResult.error) throw new Error(campaignResult.error.message);
  const campaignId = campaignResult.data.id;
  const adsetResult = await db
    .from("meta_ad_sets")
    .upsert(
      {
        client_id: clientId,
        ad_account_id: accountId,
        campaign_id: campaignId,
        meta_adset_id: state.adsetId,
        name: input.name,
        status,
        effective_status: status,
        optimization_goal: payload.adsetPayload.optimization_goal,
        billing_event: payload.adsetPayload.billing_event,
        raw: { ...payload.adsetPayload, id: state.adsetId, status }
      },
      { onConflict: "ad_account_id,meta_adset_id" }
    )
    .select("id")
    .single();
  if (adsetResult.error) throw new Error(adsetResult.error.message);
  // Bound the final database writes as well; replays are idempotent upserts.
  state.savedAdIds ??= [];
  for (const group of input.groups.filter((item) => !state.savedAdIds!.includes(item.id)).slice(0, 5)) {
    const external = state.ads[group.id];
    const file = payload.files.find((item) => item.id === (group.feedFileId ?? group.storyFileId))!;
    const media = state.media[file.id];
    const creativeResult = await db
      .from("creatives")
      .upsert(
        {
          client_id: clientId,
          ad_account_id: accountId,
          meta_creative_id: external.creativeId,
          name: group.name,
          creative_type: file.kind,
          title: input.copy.headline,
          body: group.primaryText?.trim() || input.copy.primaryText,
          call_to_action_type: input.copy.callToAction,
          landing_url: input.copy.landingUrl,
          thumbnail_url: media.thumbnailUrl ?? file.thumbnailUrl,
          video_id: media.videoId ?? null,
          raw: buildCreativePayload(group, payload.files, state.media, input.copy)
        },
        { onConflict: "ad_account_id,meta_creative_id" }
      )
      .select("id")
      .single();
    if (creativeResult.error) throw new Error(creativeResult.error.message);
    const { error } = await db.from("meta_ads").upsert(
      {
        client_id: clientId,
        ad_account_id: accountId,
        campaign_id: campaignId,
        adset_id: adsetResult.data.id,
        creative_id: creativeResult.data.id,
        meta_ad_id: external.adId,
        meta_creative_id: external.creativeId,
        name: group.name,
        status,
        effective_status: status
      },
      { onConflict: "ad_account_id,meta_ad_id" }
    );
    if (error) throw new Error(error.message);
    state.savedAdIds.push(group.id);
  }
  if (state.savedAdIds.length < input.groups.length) return false;
  const { error } = await db
    .from("batch_folder_checks")
    .update({
      status: state.activated ? "live" : "found",
      match_type: "adset",
      match_id: adsetResult.data.id,
      match_name: input.name,
      match_status: status,
      match_effective_status: status,
      match_href: `/clients/${clientId}/adsets/${adsetResult.data.id}`,
      checked_at: new Date().toISOString()
    })
    .eq("client_id", clientId)
    .eq("drive_folder_id", input.folderId);
  if (error) throw new Error(error.message);
  return true;
}
