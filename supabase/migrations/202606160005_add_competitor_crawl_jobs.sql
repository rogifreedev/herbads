create table if not exists public.competitor_crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  source_id uuid not null references public.competitor_ad_library_sources(id) on delete cascade,
  competitor_id uuid references public.competitors(id) on delete set null,
  status text not null default 'pending',
  attempts integer not null default 0,
  max_attempts integer not null default 3,
  imported_items integer not null default 0,
  skipped_items integer not null default 0,
  error_message text,
  worker_id text,
  locked_at timestamptz,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  last_heartbeat_at timestamptz,
  finished_at timestamptz,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_competitor_crawl_jobs_updated_at
before update on public.competitor_crawl_jobs
for each row execute function public.set_updated_at();

create index if not exists competitor_crawl_jobs_client_status_idx
on public.competitor_crawl_jobs(client_id, status, run_after, created_at desc);

create index if not exists competitor_crawl_jobs_source_status_idx
on public.competitor_crawl_jobs(source_id, status, created_at desc);

create index if not exists competitor_crawl_jobs_worker_idx
on public.competitor_crawl_jobs(worker_id, status, last_heartbeat_at desc);

alter table public.competitor_crawl_jobs enable row level security;

create policy "authenticated manage competitor_crawl_jobs"
on public.competitor_crawl_jobs
for all to authenticated
using (true)
with check (true);
