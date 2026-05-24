alter table public.creative_insights_daily
add column if not exists outbound_clicks integer;

create index if not exists creative_insights_daily_outbound_clicks_idx
on public.creative_insights_daily(client_id, outbound_clicks);
