create table if not exists public.landingpage_analyses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  normalized_url text not null,
  final_url text,
  status text not null default 'pending',
  http_status integer,
  title text,
  meta_description text,
  extracted_text text,
  content_hash text,
  primary_offer text,
  target_audience text,
  funnel_stage text,
  ctas jsonb not null default '[]',
  value_props jsonb not null default '[]',
  proof_points jsonb not null default '[]',
  objections jsonb not null default '[]',
  keywords jsonb not null default '[]',
  product_categories jsonb not null default '[]',
  match_signals jsonb not null default '[]',
  summary text,
  risks jsonb not null default '[]',
  analysis jsonb not null default '{}',
  error_message text,
  crawled_at timestamptz,
  analyzed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, normalized_url)
);

create trigger set_landingpage_analyses_updated_at
before update on public.landingpage_analyses
for each row execute function public.set_updated_at();

create index if not exists landingpage_analyses_client_id_idx
on public.landingpage_analyses(client_id);

create index if not exists landingpage_analyses_status_idx
on public.landingpage_analyses(client_id, status);

alter table public.landingpage_analyses enable row level security;

create policy "authenticated manage landingpage_analyses"
on public.landingpage_analyses for all to authenticated using (true) with check (true);
