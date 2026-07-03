alter table public.batch_settings
add column if not exists last_checked_at timestamptz,
add column if not exists last_check_started_at timestamptz,
add column if not exists last_check_status text not null default 'idle',
add column if not exists last_check_error text,
add column if not exists last_meta_entities_count integer not null default 0,
add column if not exists last_drive_folder_count integer not null default 0;

create table if not exists public.batch_folder_checks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  drive_folder_id text not null,
  name text not null,
  path text not null,
  depth integer not null default 0,
  web_view_link text,
  modified_time timestamptz,
  status text not null default 'missing' check (status in ('live', 'found', 'missing')),
  match_type text check (match_type in ('ad', 'adset', 'campaign')),
  match_id uuid,
  match_name text,
  match_status text,
  match_effective_status text,
  match_href text,
  checked_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, drive_folder_id)
);

drop trigger if exists set_batch_folder_checks_updated_at on public.batch_folder_checks;
create trigger set_batch_folder_checks_updated_at
before update on public.batch_folder_checks
for each row execute function public.set_updated_at();

alter table public.batch_folder_checks enable row level security;

drop policy if exists "authenticated manage batch_folder_checks" on public.batch_folder_checks;
create policy "authenticated manage batch_folder_checks" on public.batch_folder_checks
for all to authenticated using (true) with check (true);

create index if not exists batch_folder_checks_client_checked_idx
on public.batch_folder_checks(client_id, checked_at desc);
