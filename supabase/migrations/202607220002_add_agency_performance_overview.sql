create or replace function public.get_clients_performance_metrics(
  p_since date default null,
  p_until date default null
)
returns table (
  client_id uuid,
  client_name text,
  row_count bigint,
  spend numeric,
  impressions bigint,
  reach bigint,
  clicks bigint,
  link_clicks bigint,
  outbound_clicks bigint,
  purchases bigint,
  purchase_value numeric,
  engagement bigint,
  video_3s_views bigint,
  thruplays bigint
)
language sql
stable
as $$
  select
    clients.id,
    clients.name,
    metrics.row_count,
    metrics.spend,
    metrics.impressions,
    metrics.reach,
    metrics.clicks,
    metrics.link_clicks,
    metrics.outbound_clicks,
    metrics.purchases,
    metrics.purchase_value,
    metrics.engagement,
    metrics.video_3s_views,
    metrics.thruplays
  from public.clients clients
  cross join lateral public.get_client_performance_metrics(clients.id, p_since, p_until) metrics
  where clients.status = 'active'
  order by clients.name;
$$;

grant execute on function public.get_clients_performance_metrics(date, date) to authenticated, service_role;
