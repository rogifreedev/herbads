set statement_timeout = 0;

create index if not exists meta_ads_campaign_id_idx
on public.meta_ads(campaign_id);

create index if not exists meta_ads_adset_id_idx
on public.meta_ads(adset_id);

create index if not exists meta_ads_creative_id_idx
on public.meta_ads(creative_id);

create index if not exists creative_insights_daily_campaign_id_idx
on public.creative_insights_daily(campaign_id);

create index if not exists creative_insights_daily_adset_id_idx
on public.creative_insights_daily(adset_id);

create index if not exists creative_insights_daily_creative_id_idx
on public.creative_insights_daily(creative_id);

create index if not exists creative_insight_breakdowns_campaign_id_idx
on public.creative_insight_breakdowns_daily(campaign_id);

create index if not exists creative_insight_breakdowns_adset_id_idx
on public.creative_insight_breakdowns_daily(adset_id);

create index if not exists creative_insight_breakdowns_creative_id_idx
on public.creative_insight_breakdowns_daily(creative_id);

create index if not exists meta_ad_sets_campaign_id_idx
on public.meta_ad_sets(campaign_id);
