create or replace function public.is_conversion_campaign_objective(p_objective text)
returns boolean
language sql
immutable
as $$
  select upper(coalesce(p_objective, '')) in (
    'OUTCOME_SALES',
    'CONVERSIONS',
    'PRODUCT_CATALOG_SALES',
    'OUTCOME_LEADS',
    'LEAD_GENERATION'
  );
$$;

create or replace function public.get_client_conversion_creative_summaries(
  p_client_id uuid,
  p_since date default null,
  p_until date default null
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
  has_ai_analysis boolean
)
language sql
stable
as $$
  with conversion_ads as (
    select ads.*
    from public.meta_ads ads
    join public.meta_campaigns campaigns on campaigns.id = ads.campaign_id
    where ads.client_id = p_client_id
      and ads.creative_id is not null
      and public.is_conversion_campaign_objective(campaigns.objective)
  ),
  scoped_creatives as (
    select creatives.*
    from public.creatives creatives
    where creatives.client_id = p_client_id
      and exists (
        select 1
        from conversion_ads ads
        where ads.creative_id = creatives.id
      )
  ),
  insight_metrics as (
    select
      insights.creative_id,
      coalesce(sum(insights.spend), 0) as spend,
      coalesce(sum(insights.impressions), 0)::bigint as impressions,
      coalesce(sum(insights.reach), 0)::bigint as reach,
      coalesce(sum(insights.clicks), 0)::bigint as clicks,
      coalesce(sum(insights.link_clicks), 0)::bigint as link_clicks,
      coalesce(sum(coalesce(insights.outbound_clicks, insights.link_clicks)), 0)::bigint as outbound_clicks,
      coalesce(sum(insights.purchases), 0)::bigint as purchases,
      coalesce(sum(insights.purchase_value), 0) as purchase_value,
      coalesce(sum(insights.engagement), 0)::bigint as engagement,
      coalesce(sum(insights.video_3s_views), 0)::bigint as video_3s_views,
      coalesce(sum(insights.thruplays), 0)::bigint as thruplays
    from public.creative_insights_daily insights
    join conversion_ads ads on ads.id = insights.ad_id
    where insights.client_id = p_client_id
      and (p_since is null or insights.date >= p_since)
      and (p_until is null or insights.date <= p_until)
    group by insights.creative_id
  ),
  first_deliveries as (
    select
      insights.creative_id,
      min(insights.date) filter (where insights.impressions > 0 or insights.spend > 0) as first_delivered_date
    from public.creative_insights_daily insights
    join conversion_ads ads on ads.id = insights.ad_id
    where insights.client_id = p_client_id
    group by insights.creative_id
  ),
  ad_performance as (
    select
      insights.ad_id,
      sum(insights.spend) + (sum(insights.impressions)::numeric / 1000) as performance_weight
    from public.creative_insights_daily insights
    join conversion_ads ads on ads.id = insights.ad_id
    where insights.client_id = p_client_id
      and (p_since is null or insights.date >= p_since)
      and (p_until is null or insights.date <= p_until)
    group by insights.ad_id
  ),
  ranked_ads as (
    select
      ads.*,
      case
        when substring(ads.raw->>'created_time' from 1 for 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then substring(ads.raw->>'created_time' from 1 for 10)::date
        else null
      end as created_date,
      row_number() over (
        partition by ads.creative_id
        order by
          case
            when ads.effective_status = 'ACTIVE' or ads.status = 'ACTIVE' then 2
            when ads.effective_status = 'PAUSED' or ads.status = 'PAUSED' then 1
            else 0
          end desc,
          coalesce(performance.performance_weight, 0) desc,
          ads.created_at desc
      ) as ad_rank
    from conversion_ads ads
    left join ad_performance performance on performance.ad_id = ads.id
  ),
  ad_summary as (
    select
      ads.creative_id,
      count(*)::bigint as ad_count,
      case
        when bool_or(ads.effective_status = 'ACTIVE' or ads.status = 'ACTIVE') then 'ACTIVE'
        when bool_or(ads.effective_status = 'PAUSED' or ads.status = 'PAUSED') then 'PAUSED'
        else coalesce((array_agg(coalesce(ads.effective_status, ads.status) order by ads.ad_rank))[1], 'UNKNOWN')
      end as creative_status,
      coalesce(
        (array_agg(ads.name order by ads.ad_rank) filter (where ads.name is not null))[1],
        (array_agg(ads.meta_ad_id order by ads.ad_rank) filter (where ads.meta_ad_id is not null))[1]
      ) as display_name,
      min(ads.created_date) as first_created_date
    from ranked_ads ads
    group by ads.creative_id
  ),
  latest_analyses as (
    select distinct on (analyses.creative_id)
      analyses.creative_id,
      analyses.funnel_stage
    from public.creative_ai_analyses analyses
    where analyses.client_id = p_client_id
    order by analyses.creative_id, analyses.created_at desc
  )
  select
    creatives.id,
    creatives.meta_creative_id,
    creatives.creative_type,
    creatives.name,
    creatives.title,
    creatives.body,
    creatives.call_to_action_type,
    creatives.image_url,
    creatives.thumbnail_url,
    creatives.video_id,
    creatives.video_url,
    creatives.video_embed_url,
    creatives.video_permalink_url,
    creatives.landing_url,
    creatives.updated_at,
    coalesce(ads.display_name, creatives.name, creatives.title, creatives.meta_creative_id),
    coalesce(ads.ad_count, 0)::bigint,
    coalesce(ads.creative_status, 'UNKNOWN'),
    coalesce(deliveries.first_delivered_date, ads.first_created_date),
    coalesce(metrics.spend, 0),
    coalesce(metrics.impressions, 0)::bigint,
    coalesce(metrics.reach, 0)::bigint,
    coalesce(metrics.clicks, 0)::bigint,
    coalesce(metrics.link_clicks, 0)::bigint,
    coalesce(metrics.outbound_clicks, 0)::bigint,
    coalesce(metrics.purchases, 0)::bigint,
    coalesce(metrics.purchase_value, 0),
    coalesce(metrics.engagement, 0)::bigint,
    coalesce(metrics.video_3s_views, 0)::bigint,
    coalesce(metrics.thruplays, 0)::bigint,
    analyses.funnel_stage,
    analyses.creative_id is not null
  from scoped_creatives creatives
  left join insight_metrics metrics on metrics.creative_id = creatives.id
  left join first_deliveries deliveries on deliveries.creative_id = creatives.id
  left join ad_summary ads on ads.creative_id = creatives.id
  left join latest_analyses analyses on analyses.creative_id = creatives.id
  order by coalesce(metrics.spend, 0) desc, creatives.updated_at desc;
$$;

create or replace function public.get_client_conversion_creative_summaries_page(
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
    from public.get_client_conversion_creative_summaries(p_client_id, p_since, p_until) summaries
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

create or replace function public.get_client_conversion_creative_ids(p_client_id uuid)
returns table (id uuid)
language sql
stable
as $$
  select distinct ads.creative_id
  from public.meta_ads ads
  join public.meta_campaigns campaigns on campaigns.id = ads.campaign_id
  where ads.client_id = p_client_id
    and ads.creative_id is not null
    and public.is_conversion_campaign_objective(campaigns.objective);
$$;

grant execute on function public.is_conversion_campaign_objective(text) to authenticated, service_role;
grant execute on function public.get_client_conversion_creative_summaries(uuid, date, date) to authenticated, service_role;
grant execute on function public.get_client_conversion_creative_summaries_page(uuid, date, date, integer, integer, text, text, text, text, numeric, numeric, numeric, numeric, text) to authenticated, service_role;
grant execute on function public.get_client_conversion_creative_ids(uuid) to authenticated, service_role;
