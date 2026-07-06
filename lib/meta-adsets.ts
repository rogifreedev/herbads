import "server-only";

import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";

type MetaAdSetRow = {
  id: string;
  campaign_id: string | null;
  meta_adset_id: string;
  name: string | null;
  optimization_goal: string | null;
  billing_event: string | null;
  status: string | null;
  effective_status: string | null;
  created_at: string;
  updated_at: string;
};

type CampaignRow = {
  id: string;
  meta_campaign_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
};

type AdRow = {
  id: string;
  creative_id: string | null;
  meta_ad_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  created_at: string;
  updated_at: string;
};

type CreativeRow = {
  id: string;
  meta_creative_id: string;
  creative_type: string | null;
  name: string | null;
  title: string | null;
  body: string | null;
  image_url: string | null;
  thumbnail_url: string | null;
  landing_url: string | null;
  updated_at: string;
};

export type MetaAdSetDetail = {
  id: string;
  campaignId: string | null;
  metaAdsetId: string;
  name: string;
  optimizationGoal: string | null;
  billingEvent: string | null;
  status: string | null;
  effectiveStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MetaAdSetCampaign = {
  id: string;
  metaCampaignId: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
};

export type MetaAdSetAd = {
  id: string;
  creativeId: string | null;
  metaAdId: string;
  name: string;
  status: string | null;
  effectiveStatus: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MetaAdSetCreative = {
  id: string;
  metaCreativeId: string;
  type: string | null;
  name: string;
  title: string | null;
  body: string | null;
  imageUrl: string | null;
  thumbnailUrl: string | null;
  landingUrl: string | null;
  updatedAt: string;
};

export type MetaAdSetAdCreativeRow = {
  ad: MetaAdSetAd;
  creative: MetaAdSetCreative | null;
};

function adSetName(row: MetaAdSetRow) {
  return row.name ?? row.meta_adset_id;
}

function campaignName(row: CampaignRow) {
  return row.name ?? row.meta_campaign_id;
}

function adName(row: AdRow) {
  return row.name ?? row.meta_ad_id;
}

function creativeName(row: CreativeRow) {
  return row.name ?? row.title ?? row.meta_creative_id;
}

function mapAdSet(row: MetaAdSetRow): MetaAdSetDetail {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    metaAdsetId: row.meta_adset_id,
    name: adSetName(row),
    optimizationGoal: row.optimization_goal,
    billingEvent: row.billing_event,
    status: row.status,
    effectiveStatus: row.effective_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCampaign(row: CampaignRow): MetaAdSetCampaign {
  return {
    id: row.id,
    metaCampaignId: row.meta_campaign_id,
    name: campaignName(row),
    status: row.status,
    effectiveStatus: row.effective_status
  };
}

function mapAd(row: AdRow): MetaAdSetAd {
  return {
    id: row.id,
    creativeId: row.creative_id,
    metaAdId: row.meta_ad_id,
    name: adName(row),
    status: row.status,
    effectiveStatus: row.effective_status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCreative(row: CreativeRow): MetaAdSetCreative {
  return {
    id: row.id,
    metaCreativeId: row.meta_creative_id,
    type: row.creative_type,
    name: creativeName(row),
    title: row.title,
    body: row.body,
    imageUrl: row.image_url,
    thumbnailUrl: row.thumbnail_url,
    landingUrl: row.landing_url,
    updatedAt: row.updated_at
  };
}

export async function getMetaAdSetDetail(clientId: string, adSetId: string): Promise<{
  adSet: MetaAdSetDetail | null;
  campaign: MetaAdSetCampaign | null;
  rows: MetaAdSetAdCreativeRow[];
  error: string | null;
}> {
  try {
    const supabase = createSupabaseServiceRoleClient();
    const { data: adSetData, error: adSetError } = await supabase
      .from("meta_ad_sets")
      .select("id,campaign_id,meta_adset_id,name,optimization_goal,billing_event,status,effective_status,created_at,updated_at")
      .eq("client_id", clientId)
      .eq("id", adSetId)
      .maybeSingle();

    if (adSetError) return { adSet: null, campaign: null, rows: [], error: adSetError.message };
    if (!adSetData) return { adSet: null, campaign: null, rows: [], error: "Ad Set wurde nicht gefunden." };

    const adSetRow = adSetData as MetaAdSetRow;
    const [adsResult, campaignResult] = await Promise.all([
      supabase
        .from("meta_ads")
        .select("id,creative_id,meta_ad_id,name,status,effective_status,created_at,updated_at")
        .eq("client_id", clientId)
        .eq("adset_id", adSetId)
        .order("updated_at", { ascending: false }),
      adSetRow.campaign_id
        ? supabase
            .from("meta_campaigns")
            .select("id,meta_campaign_id,name,status,effective_status")
            .eq("client_id", clientId)
            .eq("id", adSetRow.campaign_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ]);

    const error = adsResult.error ?? campaignResult.error;
    if (error) return { adSet: mapAdSet(adSetRow), campaign: null, rows: [], error: error.message };

    const adRows = (adsResult.data ?? []) as AdRow[];
    const creativeIds = Array.from(new Set(adRows.map((row) => row.creative_id).filter((id): id is string => Boolean(id))));
    let creativeRows: CreativeRow[] = [];

    if (creativeIds.length > 0) {
      const { data, error: creativesError } = await supabase
        .from("creatives")
        .select("id,meta_creative_id,creative_type,name,title,body,image_url,thumbnail_url,landing_url,updated_at")
        .eq("client_id", clientId)
        .in("id", creativeIds);

      if (creativesError) return { adSet: mapAdSet(adSetRow), campaign: null, rows: [], error: creativesError.message };
      creativeRows = (data ?? []) as CreativeRow[];
    }

    const creativesById = new Map(creativeRows.map((row) => [row.id, mapCreative(row)]));
    const rows = adRows.map((row) => ({
      ad: mapAd(row),
      creative: row.creative_id ? creativesById.get(row.creative_id) ?? null : null
    }));

    return {
      adSet: mapAdSet(adSetRow),
      campaign: campaignResult.data ? mapCampaign(campaignResult.data as CampaignRow) : null,
      rows,
      error: null
    };
  } catch (error) {
    return {
      adSet: null,
      campaign: null,
      rows: [],
      error: error instanceof Error ? error.message : "Ad Set konnte nicht geladen werden."
    };
  }
}
