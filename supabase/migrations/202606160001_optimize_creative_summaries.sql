create index if not exists creative_insights_daily_client_creative_date_idx
on public.creative_insights_daily(client_id, creative_id, date);

create index if not exists meta_ads_client_creative_idx
on public.meta_ads(client_id, creative_id);

create index if not exists creative_ai_analyses_client_creative_created_idx
on public.creative_ai_analyses(client_id, creative_id, created_at desc);

create index if not exists creatives_client_updated_idx
on public.creatives(client_id, updated_at desc);

create or replace function public.get_client_creative_summaries(
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
  with scoped_creatives as (
    select c.*
    from public.creatives c
    where c.client_id = p_client_id
  ),
  insight_metrics as (
    select
      cid.creative_id,
      coalesce(sum(cid.spend), 0) as spend,
      coalesce(sum(cid.impressions), 0)::bigint as impressions,
      coalesce(sum(cid.reach), 0)::bigint as reach,
      coalesce(sum(cid.clicks), 0)::bigint as clicks,
      coalesce(sum(cid.link_clicks), 0)::bigint as link_clicks,
      coalesce(sum(coalesce(cid.outbound_clicks, cid.link_clicks)), 0)::bigint as outbound_clicks,
      coalesce(sum(cid.purchases), 0)::bigint as purchases,
      coalesce(sum(cid.purchase_value), 0) as purchase_value,
      coalesce(sum(cid.engagement), 0)::bigint as engagement,
      coalesce(sum(cid.video_3s_views), 0)::bigint as video_3s_views,
      coalesce(sum(cid.thruplays), 0)::bigint as thruplays
    from public.creative_insights_daily cid
    where cid.client_id = p_client_id
      and cid.creative_id is not null
      and (p_since is null or cid.date >= p_since)
      and (p_until is null or cid.date <= p_until)
    group by cid.creative_id
  ),
  first_deliveries as (
    select
      cid.creative_id,
      min(cid.date) filter (where cid.impressions > 0 or cid.spend > 0) as first_delivered_date
    from public.creative_insights_daily cid
    where cid.client_id = p_client_id
      and cid.creative_id is not null
    group by cid.creative_id
  ),
  ad_performance as (
    select
      cid.ad_id,
      sum(cid.spend) + (sum(cid.impressions)::numeric / 1000) as performance_weight
    from public.creative_insights_daily cid
    where cid.client_id = p_client_id
      and cid.ad_id is not null
      and (p_since is null or cid.date >= p_since)
      and (p_until is null or cid.date <= p_until)
    group by cid.ad_id
  ),
  ranked_ads as (
    select
      ma.*,
      case
        when substring(ma.raw->>'created_time' from 1 for 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          then substring(ma.raw->>'created_time' from 1 for 10)::date
        else null
      end as created_date,
      row_number() over (
        partition by ma.creative_id
        order by
          case
            when ma.effective_status = 'ACTIVE' or ma.status = 'ACTIVE' then 2
            when ma.effective_status = 'PAUSED' or ma.status = 'PAUSED' then 1
            else 0
          end desc,
          coalesce(ap.performance_weight, 0) desc,
          ma.created_at desc
      ) as ad_rank
    from public.meta_ads ma
    left join ad_performance ap on ap.ad_id = ma.id
    where ma.client_id = p_client_id
      and ma.creative_id is not null
  ),
  ad_summary as (
    select
      ra.creative_id,
      count(*)::bigint as ad_count,
      case
        when bool_or(ra.effective_status = 'ACTIVE' or ra.status = 'ACTIVE') then 'ACTIVE'
        when bool_or(ra.effective_status = 'PAUSED' or ra.status = 'PAUSED') then 'PAUSED'
        else coalesce((array_agg(coalesce(ra.effective_status, ra.status) order by ra.ad_rank))[1], 'UNKNOWN')
      end as creative_status,
      coalesce(
        (array_agg(ra.name order by ra.ad_rank) filter (where ra.name is not null))[1],
        (array_agg(ra.meta_ad_id order by ra.ad_rank) filter (where ra.meta_ad_id is not null))[1]
      ) as display_name,
      min(ra.created_date) as first_created_date
    from ranked_ads ra
    group by ra.creative_id
  ),
  latest_analyses as (
    select distinct on (caa.creative_id)
      caa.creative_id,
      caa.funnel_stage
    from public.creative_ai_analyses caa
    where caa.client_id = p_client_id
    order by caa.creative_id, caa.created_at desc
  )
  select
    sc.id,
    sc.meta_creative_id,
    sc.creative_type,
    sc.name,
    sc.title,
    sc.body,
    sc.call_to_action_type,
    sc.image_url,
    sc.thumbnail_url,
    sc.video_id,
    sc.video_url,
    sc.video_embed_url,
    sc.video_permalink_url,
    sc.landing_url,
    sc.updated_at,
    coalesce(ads.display_name, sc.name, sc.title, sc.meta_creative_id) as display_name,
    coalesce(ads.ad_count, 0)::bigint as ad_count,
    coalesce(ads.creative_status, 'UNKNOWN') as creative_status,
    coalesce(fd.first_delivered_date, ads.first_created_date) as first_active_date,
    coalesce(im.spend, 0) as spend,
    coalesce(im.impressions, 0)::bigint as impressions,
    coalesce(im.reach, 0)::bigint as reach,
    coalesce(im.clicks, 0)::bigint as clicks,
    coalesce(im.link_clicks, 0)::bigint as link_clicks,
    coalesce(im.outbound_clicks, 0)::bigint as outbound_clicks,
    coalesce(im.purchases, 0)::bigint as purchases,
    coalesce(im.purchase_value, 0) as purchase_value,
    coalesce(im.engagement, 0)::bigint as engagement,
    coalesce(im.video_3s_views, 0)::bigint as video_3s_views,
    coalesce(im.thruplays, 0)::bigint as thruplays,
    la.funnel_stage,
    la.creative_id is not null as has_ai_analysis
  from scoped_creatives sc
  left join insight_metrics im on im.creative_id = sc.id
  left join first_deliveries fd on fd.creative_id = sc.id
  left join ad_summary ads on ads.creative_id = sc.id
  left join latest_analyses la on la.creative_id = sc.id
  order by coalesce(im.spend, 0) desc, sc.updated_at desc;
$$;

grant execute on function public.get_client_creative_summaries(uuid, date, date) to authenticated, service_role;
