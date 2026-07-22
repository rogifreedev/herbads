create index if not exists creative_insights_daily_client_ad_date_idx
on public.creative_insights_daily(client_id, ad_id, date);

create index if not exists creative_insights_daily_client_campaign_date_creative_idx
on public.creative_insights_daily(client_id, campaign_id, date, creative_id);

create index if not exists meta_ads_client_campaign_creative_idx
on public.meta_ads(client_id, campaign_id, creative_id);

create index if not exists meta_campaigns_client_objective_idx
on public.meta_campaigns(client_id, objective, id);

alter function public.get_client_conversion_creative_summaries(uuid, date, date)
set statement_timeout = '20s';

alter function public.get_client_conversion_creative_summaries_page(uuid, date, date, integer, integer, text, text, text, text, numeric, numeric, numeric, numeric, text)
set statement_timeout = '20s';

alter function public.get_client_conversion_creative_ids(uuid)
set statement_timeout = '20s';
