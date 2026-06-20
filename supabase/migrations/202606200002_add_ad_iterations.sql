create table if not exists public.ad_iteration_generations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  model text,
  status text not null default 'completed',
  generation_key text not null,
  format text not null default 'all',
  period_start date,
  period_end date,
  options jsonb not null default '{}',
  prompt_context jsonb not null default '{}',
  raw_response jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, generation_key, format)
);

create trigger set_ad_iteration_generations_updated_at
before update on public.ad_iteration_generations
for each row execute function public.set_updated_at();

create table if not exists public.ad_iterations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  generation_id uuid references public.ad_iteration_generations(id) on delete set null,
  source_creative_id uuid not null references public.creatives(id) on delete cascade,
  format text not null,
  status text not null default 'new',
  title text not null,
  angle text,
  description text,
  hook text,
  script text,
  production_notes text,
  rationale text,
  score numeric,
  performance_snapshot jsonb not null default '{}',
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_ad_iterations_updated_at
before update on public.ad_iterations
for each row execute function public.set_updated_at();

create index if not exists ad_iteration_generations_client_created_idx
on public.ad_iteration_generations(client_id, created_at desc);

create index if not exists ad_iterations_client_format_status_idx
on public.ad_iterations(client_id, format, status, created_at desc);

create index if not exists ad_iterations_client_source_idx
on public.ad_iterations(client_id, source_creative_id);

alter table public.ad_iteration_generations enable row level security;
alter table public.ad_iterations enable row level security;

create policy "authenticated manage ad_iteration_generations"
on public.ad_iteration_generations
for all to authenticated
using (true)
with check (true);

create policy "authenticated manage ad_iterations"
on public.ad_iterations
for all to authenticated
using (true)
with check (true);
