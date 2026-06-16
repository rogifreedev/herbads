create table if not exists public.competitor_creative_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'pending',
  total_items integer not null default 0,
  completed_items integer not null default 0,
  failed_items integer not null default 0,
  pause_until timestamptz,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.competitor_creative_analysis_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.competitor_creative_analysis_jobs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  competitor_creative_id uuid not null references public.competitor_creatives(id) on delete cascade,
  item_index integer not null default 0,
  status text not null default 'pending',
  attempts integer not null default 0,
  analysis_id uuid references public.competitor_creative_analyses(id) on delete set null,
  error_message text,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists competitor_analysis_jobs_client_status_idx
on public.competitor_creative_analysis_jobs(client_id, status, created_at desc);

create index if not exists competitor_analysis_job_items_job_status_idx
on public.competitor_creative_analysis_job_items(job_id, status, item_index);

create index if not exists competitor_analysis_job_items_client_idx
on public.competitor_creative_analysis_job_items(client_id, created_at desc);
