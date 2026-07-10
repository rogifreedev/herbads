create index if not exists creative_insights_daily_client_date_idx
on public.creative_insights_daily(client_id, date);

create index if not exists creative_insight_breakdowns_client_date_type_idx
on public.creative_insight_breakdowns_daily(client_id, date, breakdown_type);

create or replace function public.get_client_performance_metrics(
  p_client_id uuid,
  p_since date default null,
  p_until date default null
)
returns table (
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
    count(*)::bigint,
    coalesce(sum(cid.spend), 0),
    coalesce(sum(cid.impressions), 0)::bigint,
    coalesce(sum(cid.reach), 0)::bigint,
    coalesce(sum(cid.clicks), 0)::bigint,
    coalesce(sum(cid.link_clicks), 0)::bigint,
    coalesce(sum(coalesce(cid.outbound_clicks, cid.link_clicks)), 0)::bigint,
    coalesce(sum(cid.purchases), 0)::bigint,
    coalesce(sum(cid.purchase_value), 0),
    coalesce(sum(cid.engagement), 0)::bigint,
    coalesce(sum(cid.video_3s_views), 0)::bigint,
    coalesce(sum(cid.thruplays), 0)::bigint
  from public.creative_insights_daily cid
  where cid.client_id = p_client_id
    and cid.date >= coalesce(p_since, '-infinity'::date)
    and cid.date <= coalesce(p_until, 'infinity'::date);
$$;

create or replace function public.get_global_performance_metrics()
returns table (
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
    count(*)::bigint,
    coalesce(sum(cid.spend), 0),
    coalesce(sum(cid.impressions), 0)::bigint,
    coalesce(sum(cid.reach), 0)::bigint,
    coalesce(sum(cid.clicks), 0)::bigint,
    coalesce(sum(cid.link_clicks), 0)::bigint,
    coalesce(sum(coalesce(cid.outbound_clicks, cid.link_clicks)), 0)::bigint,
    coalesce(sum(cid.purchases), 0)::bigint,
    coalesce(sum(cid.purchase_value), 0),
    coalesce(sum(cid.engagement), 0)::bigint,
    coalesce(sum(cid.video_3s_views), 0)::bigint,
    coalesce(sum(cid.thruplays), 0)::bigint
  from public.creative_insights_daily cid;
$$;

create or replace function public.get_client_performance_breakdowns(
  p_client_id uuid,
  p_since date default null,
  p_until date default null
)
returns table (
  breakdown_type text,
  breakdown_value text,
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
    cibd.breakdown_type,
    cibd.breakdown_value,
    coalesce(sum(cibd.spend), 0),
    coalesce(sum(cibd.impressions), 0)::bigint,
    coalesce(sum(cibd.reach), 0)::bigint,
    coalesce(sum(cibd.clicks), 0)::bigint,
    coalesce(sum(cibd.link_clicks), 0)::bigint,
    coalesce(sum(coalesce(cibd.outbound_clicks, cibd.link_clicks)), 0)::bigint,
    coalesce(sum(cibd.purchases), 0)::bigint,
    coalesce(sum(cibd.purchase_value), 0),
    coalesce(sum(cibd.engagement), 0)::bigint,
    coalesce(sum(cibd.video_3s_views), 0)::bigint,
    coalesce(sum(cibd.thruplays), 0)::bigint
  from public.creative_insight_breakdowns_daily cibd
  where cibd.client_id = p_client_id
    and cibd.date >= coalesce(p_since, '-infinity'::date)
    and cibd.date <= coalesce(p_until, 'infinity'::date)
  group by cibd.breakdown_type, cibd.breakdown_value
  order by
    coalesce(sum(cibd.spend), 0) desc,
    coalesce(sum(cibd.purchases), 0) desc,
    coalesce(sum(cibd.reach), 0) desc;
$$;

create or replace function public.calculate_creative_performance_score(
  p_spend numeric,
  p_impressions numeric,
  p_clicks numeric,
  p_outbound_clicks numeric,
  p_purchases numeric,
  p_purchase_value numeric,
  p_video_3s_views numeric,
  p_thruplays numeric
)
returns integer
language plpgsql
immutable
as $$
declare
  v_spend numeric := coalesce(p_spend, 0);
  v_impressions numeric := coalesce(p_impressions, 0);
  v_clicks numeric := coalesce(p_clicks, 0);
  v_outbound numeric := coalesce(p_outbound_clicks, 0);
  v_purchases numeric := coalesce(p_purchases, 0);
  v_value numeric := coalesce(p_purchase_value, 0);
  v_video3 numeric := coalesce(p_video_3s_views, 0);
  v_thruplays numeric := coalesce(p_thruplays, 0);
  v_data_quality numeric;
  v_weighted_sum numeric := 0;
  v_weight_sum numeric := 0;
  v_score numeric;
  v_value_score numeric;
begin
  v_data_quality := greatest(0, least(100, least(v_spend / 100, v_impressions / 1000) * 100));

  if v_purchases >= 2 then
    v_value_score := greatest(0, least(100, (v_value / nullif(v_spend, 0)) / 3 * 100));
    if v_value_score is not null then v_weighted_sum := v_weighted_sum + v_value_score * 28; v_weight_sum := v_weight_sum + 28; end if;

    v_score := v_spend / nullif(v_purchases, 0);
    v_value_score := case when v_score <= 20 then 100 when v_score >= 80 then 0 else ((80 - v_score) / 60) * 100 end;
    if v_value_score is not null then v_weighted_sum := v_weighted_sum + v_value_score * 20; v_weight_sum := v_weight_sum + 20; end if;
  end if;

  v_value_score := greatest(0, least(100, ((v_clicks / nullif(v_impressions, 0)) * 100) / 2.5 * 100));
  if v_value_score is not null then v_weighted_sum := v_weighted_sum + v_value_score * 20; v_weight_sum := v_weight_sum + 20; end if;

  v_value_score := greatest(0, least(100, ((v_purchases / nullif(v_outbound, 0)) * 100) / 5 * 100));
  if v_value_score is not null then v_weighted_sum := v_weighted_sum + v_value_score * 10; v_weight_sum := v_weight_sum + 10; end if;

  v_value_score := greatest(0, least(100, ((v_video3 / nullif(v_impressions, 0)) * 100) / 25 * 100));
  if v_value_score is not null then v_weighted_sum := v_weighted_sum + v_value_score * 5; v_weight_sum := v_weight_sum + 5; end if;

  v_value_score := greatest(0, least(100, ((v_thruplays / nullif(v_video3, 0)) * 100) / 20 * 100));
  if v_value_score is not null then v_weighted_sum := v_weighted_sum + v_value_score * 5; v_weight_sum := v_weight_sum + 5; end if;

  v_weighted_sum := v_weighted_sum + greatest(0, least(100, v_purchases / 10 * 100)) * 10;
  v_weight_sum := v_weight_sum + 10;
  v_weighted_sum := v_weighted_sum + v_data_quality * 2;
  v_weight_sum := v_weight_sum + 2;

  return round(case when v_weight_sum > 0 then v_weighted_sum / v_weight_sum else 0 end)::integer;
end;
$$;

create or replace function public.get_client_creative_summaries_page(
  p_client_id uuid,
  p_since date default null,
  p_until date default null,
  p_limit integer default 24,
  p_offset integer default 0,
  p_query text default null,
  p_type text default null,
  p_status text default null,
  p_funnel text default null,
  p_min_score numeric default null,
  p_min_spend numeric default null,
  p_min_roas numeric default null,
  p_min_ctr numeric default null,
  p_sort text default 'spend'
)
returns table (
  id uuid,
  meta_creative_id text,
  creative_type text,
  name text,
  title text,
  body text,
  call_to_action_type text,
  image_url text,
  thumbnail_url text,
  video_id text,
  video_url text,
  video_embed_url text,
  video_permalink_url text,
  landing_url text,
  updated_at timestamptz,
  display_name text,
  ad_count bigint,
  creative_status text,
  first_active_date date,
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
  thruplays bigint,
  funnel_stage text,
  has_ai_analysis boolean,
  performance_score integer,
  total_count bigint
)
language sql
stable
as $$
  with scored as (
    select
      summaries.*,
      public.calculate_creative_performance_score(
        summaries.spend,
        summaries.impressions,
        summaries.clicks,
        summaries.outbound_clicks,
        summaries.purchases,
        summaries.purchase_value,
        summaries.video_3s_views,
        summaries.thruplays
      ) as performance_score
    from public.get_client_creative_summaries(p_client_id, p_since, p_until) summaries
  ),
  filtered as (
    select scored.*
    from scored
    where (nullif(trim(p_query), '') is null or concat_ws(' ', scored.display_name, scored.name, scored.title, scored.body, scored.meta_creative_id, scored.landing_url) ilike '%' || trim(p_query) || '%')
      and (nullif(p_type, '') is null or lower(scored.creative_type) = lower(p_type))
      and (nullif(p_status, '') is null or upper(scored.creative_status) = upper(p_status))
      and (nullif(p_funnel, '') is null or upper(coalesce(scored.funnel_stage, 'UNCLASSIFIED')) = upper(p_funnel))
      and (p_min_score is null or scored.performance_score >= p_min_score)
      and (p_min_spend is null or scored.spend >= p_min_spend)
      and (p_min_roas is null or scored.purchase_value / nullif(scored.spend, 0) >= p_min_roas)
      and (p_min_ctr is null or scored.clicks::numeric / nullif(scored.impressions, 0) * 100 >= p_min_ctr)
  ),
  counted as (
    select filtered.*, count(*) over()::bigint as total_count
    from filtered
  )
  select counted.*
  from counted
  order by
    case when p_sort = 'score' then counted.performance_score end desc nulls last,
    case when p_sort = 'roas' then counted.purchase_value / nullif(counted.spend, 0) end desc nulls last,
    case when p_sort = 'ctr' then counted.clicks::numeric / nullif(counted.impressions, 0) end desc nulls last,
    case when p_sort = 'purchases' then counted.purchases end desc nulls last,
    case when p_sort = 'cpa' then counted.spend / nullif(counted.purchases, 0) end asc nulls last,
    case when p_sort = 'hookRate' then counted.video_3s_views::numeric / nullif(counted.impressions, 0) end desc nulls last,
    case when p_sort = 'outboundCvr' then counted.purchases::numeric / nullif(counted.outbound_clicks, 0) end desc nulls last,
    case when p_sort = 'spend' or p_sort is null then counted.spend end desc nulls last,
    counted.updated_at desc
  limit greatest(1, least(coalesce(p_limit, 24), 100))
  offset greatest(0, coalesce(p_offset, 0));
$$;

create or replace function public.get_clients_report_summaries()
returns table (
  client_id uuid,
  creative_count bigint,
  analyzed_count bigint,
  total_spend numeric,
  purchases bigint,
  average_score numeric,
  top_creative_name text
)
language sql
stable
as $$
  with summaries as (
    select
      clients.id as client_id,
      creative.display_name,
      creative.spend,
      creative.purchases,
      creative.has_ai_analysis,
      public.calculate_creative_performance_score(
        creative.spend,
        creative.impressions,
        creative.clicks,
        creative.outbound_clicks,
        creative.purchases,
        creative.purchase_value,
        creative.video_3s_views,
        creative.thruplays
      ) as performance_score
    from public.clients clients
    cross join lateral public.get_client_creative_summaries(clients.id, null, null) creative
    where clients.status = 'active'
  )
  select
    summaries.client_id,
    count(*)::bigint,
    count(*) filter (where summaries.has_ai_analysis)::bigint,
    coalesce(sum(summaries.spend), 0),
    coalesce(sum(summaries.purchases), 0)::bigint,
    round(avg(summaries.performance_score), 0),
    (array_agg(summaries.display_name order by summaries.performance_score desc, summaries.spend desc))[1]
  from summaries
  group by summaries.client_id;
$$;

grant execute on function public.get_client_performance_metrics(uuid, date, date) to authenticated, service_role;
grant execute on function public.get_global_performance_metrics() to authenticated, service_role;
grant execute on function public.get_client_performance_breakdowns(uuid, date, date) to authenticated, service_role;
grant execute on function public.calculate_creative_performance_score(numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric) to authenticated, service_role;
grant execute on function public.get_client_creative_summaries_page(uuid, date, date, integer, integer, text, text, text, text, numeric, numeric, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.get_clients_report_summaries() to authenticated, service_role;
