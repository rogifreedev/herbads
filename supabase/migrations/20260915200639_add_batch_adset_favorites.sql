create table public.batch_adset_favorites (
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  meta_adset_id text not null check (meta_adset_id ~ '^[0-9]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (ad_account_id, meta_adset_id)
);

alter table public.batch_adset_favorites enable row level security;
revoke all on public.batch_adset_favorites from public, anon, authenticated;
grant select, insert, delete on public.batch_adset_favorites to service_role;
