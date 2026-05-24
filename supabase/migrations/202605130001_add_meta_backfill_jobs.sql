create table public.meta_backfill_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  status text not null default 'pending',
  since date not null,
  until date not null,
  total_chunks integer not null default 0,
  completed_chunks integer not null default 0,
  failed_chunks integer not null default 0,
  total_insights integer not null default 0,
  pause_until timestamptz,
  error_message text,
  payload jsonb not null default '{}',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_meta_backfill_jobs_updated_at
before update on public.meta_backfill_jobs
for each row execute function public.set_updated_at();

create table public.meta_backfill_chunks (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.meta_backfill_jobs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  chunk_index integer not null,
  since date not null,
  until date not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  insights integer not null default 0,
  error_message text,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, chunk_index)
);

create trigger set_meta_backfill_chunks_updated_at
before update on public.meta_backfill_chunks
for each row execute function public.set_updated_at();

create index meta_backfill_jobs_client_status_idx on public.meta_backfill_jobs(client_id, status, created_at desc);
create index meta_backfill_chunks_job_status_idx on public.meta_backfill_chunks(job_id, status, run_after, chunk_index);

alter table public.meta_backfill_jobs enable row level security;
alter table public.meta_backfill_chunks enable row level security;

create policy "authenticated manage meta_backfill_jobs" on public.meta_backfill_jobs for all to authenticated using (true) with check (true);
create policy "authenticated manage meta_backfill_chunks" on public.meta_backfill_chunks for all to authenticated using (true) with check (true);
