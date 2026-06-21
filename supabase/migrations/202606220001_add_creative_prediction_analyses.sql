create table if not exists public.creative_prediction_analyses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  format text not null,
  file_name text not null,
  file_type text,
  file_size bigint not null default 0,
  primary_text text,
  headline text,
  landing_url text,
  quality_score numeric not null default 0,
  confidence numeric not null default 0,
  band text not null default 'low',
  angle text,
  hook text,
  script text,
  transcript text,
  transcript_meta jsonb not null default '{}'::jsonb,
  ai_result jsonb not null default '{}'::jsonb,
  components jsonb not null default '{}'::jsonb,
  benchmarks jsonb not null default '{}'::jsonb,
  rationale jsonb not null default '[]'::jsonb,
  frames jsonb not null default '[]'::jsonb,
  raw_result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint creative_prediction_analyses_format_check check (format in ('static', 'video')),
  constraint creative_prediction_analyses_band_check check (band in ('high', 'medium', 'low'))
);

create trigger set_creative_prediction_analyses_updated_at
before update on public.creative_prediction_analyses
for each row execute function public.set_updated_at();

create index if not exists creative_prediction_analyses_client_created_idx
on public.creative_prediction_analyses(client_id, created_at desc);

create index if not exists creative_prediction_analyses_client_format_created_idx
on public.creative_prediction_analyses(client_id, format, created_at desc);

create index if not exists creative_prediction_analyses_client_score_idx
on public.creative_prediction_analyses(client_id, quality_score desc, created_at desc);

alter table public.creative_prediction_analyses enable row level security;

create policy "authenticated manage creative_prediction_analyses"
on public.creative_prediction_analyses
for all to authenticated
using (true)
with check (true);
