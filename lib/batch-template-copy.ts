import "server-only";
import { launchAccount } from "@/lib/batch-launch";
import { templateCopySources } from "@/lib/batch-launch-copy";
import { metaLaunchList, metaLaunchRequest } from "@/lib/meta/batch-launch";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

export async function getBatchTemplateCopy(clientId: string, accountId: string, templateId: string) {
  if (!/^\d{1,40}$/.test(templateId)) throw new Error("Ungueltiges Vorlagen-Adset.");
  const account = await launchAccount(clientId, accountId);
  if (process.env.META_SYSTEM_USER_ACCESS_TOKEN?.trim()) {
    const source = await metaLaunchRequest<{ account_id: string }>(`${templateId}?fields=account_id`);
    if (String(source.account_id) !== account.meta_account_id.replace(/^act_/, ""))
      throw new Error("Vorlage gehoert nicht zum Werbekonto.");
    const ads = await metaLaunchList<{
      id: string;
      name: string;
      status: string;
      effective_status: string;
      creative?: unknown;
    }>(
      `${templateId}/ads?fields=id,name,status,effective_status,creative{id,body,title,object_story_spec,asset_feed_spec,object_url,call_to_action_type,url_tags,effective_object_story_id}&limit=100`
    );
    return {
      sources: templateCopySources(
        ads.map((ad) => ({ ...ad, status: ad.effective_status || ad.status, creative: ad.creative }))
      )
    };
  }
  const db = createSupabaseServiceRoleClient();
  const { data: template, error } = await db
    .from("meta_ad_sets")
    .select("id")
    .eq("ad_account_id", accountId)
    .eq("meta_adset_id", templateId)
    .maybeSingle();
  if (error || !template) throw new Error("Vorlage gehoert nicht zum Werbekonto.");
  const { data: ads, error: adsError } = await db
    .from("meta_ads")
    .select("meta_ad_id,name,status,effective_status,creative:creatives(raw)")
    .eq("ad_account_id", accountId)
    .eq("adset_id", template.id)
    .in("status", ["ACTIVE", "PAUSED"])
    .order("meta_ad_id")
    .limit(1000);
  if (adsError) throw new Error(adsError.message);
  return {
    sources: templateCopySources(
      (ads ?? []).map((ad) => {
        const creative = Array.isArray(ad.creative) ? ad.creative[0] : ad.creative;
        return { id: ad.meta_ad_id, name: ad.name, status: ad.effective_status || ad.status, creative: creative?.raw };
      })
    )
  };
}
