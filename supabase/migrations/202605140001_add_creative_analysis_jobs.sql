create table public.creative_analysis_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  status text not null default 'pending',
  total_items integer not null default 0,
  completed_items integer not null default 0,
  failed_items integer not null default 0,
  pause_until timestamptz,
  error_message text,
  payload jsonb not null default '{}',
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_creative_analysis_jobs_updated_at
before update on public.creative_analysis_jobs
for each row execute function public.set_updated_at();

create table public.creative_analysis_job_items (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.creative_analysis_jobs(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  creative_id uuid not null references public.creatives(id) on delete cascade,
  item_index integer not null,
  status text not null default 'pending',
  attempts integer not null default 0,
  analysis_id uuid references public.creative_ai_analyses(id) on delete set null,
  error_message text,
  run_after timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(job_id, creative_id),
  unique(job_id, item_index)
);

create trigger set_creative_analysis_job_items_updated_at
before update on public.creative_analysis_job_items
for each row execute function public.set_updated_at();

create index creative_analysis_jobs_client_status_idx on public.creative_analysis_jobs(client_id, status, created_at desc);
create index creative_analysis_job_items_job_status_idx on public.creative_analysis_job_items(job_id, status, run_after, item_index);
create index creative_analysis_job_items_client_status_idx on public.creative_analysis_job_items(client_id, status, run_after);

alter table public.creative_analysis_jobs enable row level security;
alter table public.creative_analysis_job_items enable row level security;

create policy "authenticated manage creative_analysis_jobs" on public.creative_analysis_jobs for all to authenticated using (true) with check (true);
create policy "authenticated manage creative_analysis_job_items" on public.creative_analysis_job_items for all to authenticated using (true) with check (true);
