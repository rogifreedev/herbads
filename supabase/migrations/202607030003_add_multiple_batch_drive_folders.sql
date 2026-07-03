create table if not exists public.batch_drive_folders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  label text not null default 'Drive Ordner',
  google_drive_folder_url text,
  google_drive_folder_id text not null,
  enabled boolean not null default true,
  last_checked_at timestamptz,
  last_check_started_at timestamptz,
  last_check_status text not null default 'idle',
  last_check_error text,
  last_drive_folder_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, google_drive_folder_id)
);

drop trigger if exists set_batch_drive_folders_updated_at on public.batch_drive_folders;
create trigger set_batch_drive_folders_updated_at
before update on public.batch_drive_folders
for each row execute function public.set_updated_at();

alter table public.batch_drive_folders enable row level security;

drop policy if exists "authenticated manage batch_drive_folders" on public.batch_drive_folders;
create policy "authenticated manage batch_drive_folders" on public.batch_drive_folders
for all to authenticated using (true) with check (true);

insert into public.batch_drive_folders (
  client_id,
  label,
  google_drive_folder_url,
  google_drive_folder_id,
  enabled,
  last_checked_at,
  last_check_started_at,
  last_check_status,
  last_check_error,
  last_drive_folder_count
)
select
  client_id,
  'Drive Ordner',
  google_drive_folder_url,
  google_drive_folder_id,
  true,
  last_checked_at,
  last_check_started_at,
  last_check_status,
  last_check_error,
  last_drive_folder_count
from public.batch_settings
where google_drive_folder_id is not null
on conflict (client_id, google_drive_folder_id) do nothing;

alter table public.batch_folder_checks
add column if not exists source_folder_id uuid references public.batch_drive_folders(id) on delete cascade,
add column if not exists source_folder_label text;

update public.batch_folder_checks bfc
set
  source_folder_id = bdf.id,
  source_folder_label = bdf.label
from public.batch_drive_folders bdf
where bfc.client_id = bdf.client_id
  and bfc.source_folder_id is null;

do $$
declare
  constraint_name text;
begin
  select conname into constraint_name
  from pg_constraint
  where conrelid = 'public.batch_folder_checks'::regclass
    and contype = 'u'
    and conkey = (
      select array_agg(attnum order by attnum)
      from pg_attribute
      where attrelid = 'public.batch_folder_checks'::regclass
        and attname in ('client_id', 'drive_folder_id')
    );

  if constraint_name is not null then
    execute format('alter table public.batch_folder_checks drop constraint %I', constraint_name);
  end if;
end $$;

create unique index if not exists batch_folder_checks_source_drive_unique_idx
on public.batch_folder_checks(client_id, source_folder_id, drive_folder_id);

create index if not exists batch_drive_folders_client_enabled_idx
on public.batch_drive_folders(client_id, enabled);
