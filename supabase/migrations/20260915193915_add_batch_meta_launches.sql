create table public.batch_launch_presets (
  id uuid primary key default gen_random_uuid(),
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  settings jsonb not null check (jsonb_typeof(settings) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_account_id, name)
);

create table public.batch_launch_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  drive_folder_id text not null,
  meta_campaign_id text not null,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'running', 'failed', 'review', 'completed')),
  payload jsonb not null,
  state jsonb not null default '{"media":{},"ads":{},"step":"adset"}'::jsonb,
  error text,
  lease_token uuid,
  lease_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ad_account_id, drive_folder_id, meta_campaign_id)
);

create index batch_launch_jobs_client_updated_idx on public.batch_launch_jobs(client_id, updated_at desc);
create trigger set_batch_launch_presets_updated_at before update on public.batch_launch_presets for each row execute function public.set_updated_at();
create trigger set_batch_launch_jobs_updated_at before update on public.batch_launch_jobs for each row execute function public.set_updated_at();

alter table public.batch_launch_presets enable row level security;
alter table public.batch_launch_jobs enable row level security;
revoke all on public.batch_launch_presets, public.batch_launch_jobs from public, anon, authenticated;
grant select, insert, update, delete on public.batch_launch_presets, public.batch_launch_jobs to service_role;

create function public.get_batch_launch_copy_stats(p_ad_account_id uuid, p_since date)
returns table (creative_id uuid, spend numeric, purchases numeric, revenue numeric, ad_count bigint)
language sql stable security invoker set search_path = '' as $$
  select a.creative_id, coalesce(sum(i.spend), 0), coalesce(sum(i.purchases), 0),
    coalesce(sum(i.purchase_value), 0), count(distinct a.id)
  from public.meta_ads a
  left join public.creative_insights_daily i on i.ad_id = a.id and i.date >= p_since
  where a.ad_account_id = p_ad_account_id and a.effective_status = 'ACTIVE' and a.creative_id is not null
  group by a.creative_id
  order by coalesce(sum(i.purchases), 0) desc, coalesce(sum(i.spend), 0) desc
  limit 100;
$$;
revoke all on function public.get_batch_launch_copy_stats(uuid, date) from public, anon, authenticated;
grant execute on function public.get_batch_launch_copy_stats(uuid, date) to service_role;
