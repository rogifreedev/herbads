create table if not exists public.batch_settings (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  google_drive_folder_url text,
  google_drive_folder_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id)
);

create trigger set_batch_settings_updated_at
before update on public.batch_settings
for each row execute function public.set_updated_at();

alter table public.batch_settings enable row level security;

create policy "authenticated manage batch_settings" on public.batch_settings
for all to authenticated using (true) with check (true);
