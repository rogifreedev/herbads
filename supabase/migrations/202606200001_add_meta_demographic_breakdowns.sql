create table if not exists public.creative_insight_breakdowns_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  campaign_id uuid references public.meta_campaigns(id) on delete set null,
  adset_id uuid references public.meta_ad_sets(id) on delete set null,
  ad_id uuid references public.meta_ads(id) on delete cascade,
  creative_id uuid references public.creatives(id) on delete set null,
  date date not null,
  breakdown_type text not null check (breakdown_type in ('country', 'age', 'gender')),
  breakdown_value text not null,
  spend numeric not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  frequency numeric,
  clicks integer not null default 0,
  link_clicks integer not null default 0,
  outbound_clicks integer not null default 0,
  ctr numeric,
  cpc numeric,
  cpm numeric,
  purchases integer not null default 0,
  purchase_value numeric not null default 0,
  cost_per_purchase numeric,
  roas numeric,
  engagement integer not null default 0,
  video_3s_views integer not null default 0,
  thruplays integer not null default 0,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_id, date, breakdown_type, breakdown_value)
);

create trigger set_creative_insight_breakdowns_daily_updated_at
before update on public.creative_insight_breakdowns_daily
for each row execute function public.set_updated_at();

create index if not exists creative_insight_breakdowns_client_type_date_idx
on public.creative_insight_breakdowns_daily(client_id, breakdown_type, date);

create index if not exists creative_insight_breakdowns_client_value_idx
on public.creative_insight_breakdowns_daily(client_id, breakdown_type, breakdown_value);

alter table public.creative_insight_breakdowns_daily enable row level security;

create policy "authenticated manage creative_insight_breakdowns_daily"
on public.creative_insight_breakdowns_daily
for all to authenticated
using (true)
with check (true);

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
    coalesce(sum(cibd.spend), 0) as spend,
    coalesce(sum(cibd.impressions), 0)::bigint as impressions,
    coalesce(sum(cibd.reach), 0)::bigint as reach,
    coalesce(sum(cibd.clicks), 0)::bigint as clicks,
    coalesce(sum(cibd.link_clicks), 0)::bigint as link_clicks,
    coalesce(sum(coalesce(cibd.outbound_clicks, cibd.link_clicks)), 0)::bigint as outbound_clicks,
    coalesce(sum(cibd.purchases), 0)::bigint as purchases,
    coalesce(sum(cibd.purchase_value), 0) as purchase_value,
    coalesce(sum(cibd.engagement), 0)::bigint as engagement,
    coalesce(sum(cibd.video_3s_views), 0)::bigint as video_3s_views,
    coalesce(sum(cibd.thruplays), 0)::bigint as thruplays
  from public.creative_insight_breakdowns_daily cibd
  where cibd.client_id = p_client_id
    and (p_since is null or cibd.date >= p_since)
    and (p_until is null or cibd.date <= p_until)
  group by cibd.breakdown_type, cibd.breakdown_value
  order by spend desc, purchases desc, reach desc;
$$;

grant execute on function public.get_client_performance_breakdowns(uuid, date, date) to authenticated, service_role;
