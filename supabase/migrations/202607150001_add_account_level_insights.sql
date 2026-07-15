create table if not exists public.meta_account_insights_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  date date not null,
  spend numeric not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  frequency numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, date)
);

drop trigger if exists set_meta_account_insights_daily_updated_at on public.meta_account_insights_daily;
create trigger set_meta_account_insights_daily_updated_at
before update on public.meta_account_insights_daily
for each row execute function public.set_updated_at();

alter table public.meta_account_insights_daily enable row level security;

drop policy if exists "authenticated manage meta_account_insights_daily" on public.meta_account_insights_daily;
create policy "authenticated manage meta_account_insights_daily" on public.meta_account_insights_daily
for all to authenticated using (true) with check (true);

create index if not exists meta_account_insights_daily_client_date_idx
on public.meta_account_insights_daily(client_id, date);

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
  with ad_daily as (
    select
      cid.date,
      count(*)::bigint as row_count,
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
      and cid.date >= coalesce(p_since, '-infinity'::date)
      and cid.date <= coalesce(p_until, 'infinity'::date)
    group by cid.date
  ),
  account_daily as (
    select maid.*
    from public.meta_account_insights_daily maid
    where maid.client_id = p_client_id
      and maid.date >= coalesce(p_since, '-infinity'::date)
      and maid.date <= coalesce(p_until, 'infinity'::date)
  ),
  combined as (
    select
      coalesce(ad.date, account.date) as date,
      coalesce(ad.row_count, 0)::bigint as row_count,
      coalesce(account.spend, ad.spend, 0) as spend,
      coalesce(account.impressions, ad.impressions, 0)::bigint as impressions,
      coalesce(account.reach, ad.reach, 0)::bigint as reach,
      coalesce(account.clicks, ad.clicks, 0)::bigint as clicks,
      coalesce(ad.link_clicks, 0)::bigint as link_clicks,
      coalesce(ad.outbound_clicks, 0)::bigint as outbound_clicks,
      coalesce(ad.purchases, 0)::bigint as purchases,
      coalesce(ad.purchase_value, 0) as purchase_value,
      coalesce(ad.engagement, 0)::bigint as engagement,
      coalesce(ad.video_3s_views, 0)::bigint as video_3s_views,
      coalesce(ad.thruplays, 0)::bigint as thruplays
    from ad_daily ad
    full outer join account_daily account on account.date = ad.date
  )
  select
    coalesce(sum(combined.row_count), 0)::bigint,
    coalesce(sum(combined.spend), 0),
    coalesce(sum(combined.impressions), 0)::bigint,
    coalesce(sum(combined.reach), 0)::bigint,
    coalesce(sum(combined.clicks), 0)::bigint,
    coalesce(sum(combined.link_clicks), 0)::bigint,
    coalesce(sum(combined.outbound_clicks), 0)::bigint,
    coalesce(sum(combined.purchases), 0)::bigint,
    coalesce(sum(combined.purchase_value), 0),
    coalesce(sum(combined.engagement), 0)::bigint,
    coalesce(sum(combined.video_3s_views), 0)::bigint,
    coalesce(sum(combined.thruplays), 0)::bigint
  from combined;
$$;
