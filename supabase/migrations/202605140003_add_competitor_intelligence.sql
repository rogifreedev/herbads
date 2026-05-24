create table public.competitors (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  website_url text,
  meta_page_id text,
  meta_ad_library_url text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_competitors_updated_at
before update on public.competitors
for each row execute function public.set_updated_at();

create table public.competitor_ad_library_sources (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  competitor_id uuid references public.competitors(id) on delete set null,
  url text not null,
  status text not null default 'pending',
  error_message text,
  last_checked_at timestamptz,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_competitor_ad_library_sources_updated_at
before update on public.competitor_ad_library_sources
for each row execute function public.set_updated_at();

create table public.competitor_creatives (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  competitor_id uuid references public.competitors(id) on delete set null,
  source_id uuid references public.competitor_ad_library_sources(id) on delete set null,
  source_url text,
  ad_library_id text,
  status text not null default 'active',
  format text not null default 'unknown',
  platforms jsonb not null default '[]',
  started_at date,
  ended_at date,
  active_days integer,
  reach_min integer,
  reach_max integer,
  reach_estimate integer,
  estimated_cpm numeric,
  estimated_spend numeric,
  estimated_daily_spend numeric,
  estimate_confidence text not null default 'low',
  thumbnail_url text,
  video_url text,
  image_url text,
  landing_url text,
  primary_text text,
  headline text,
  hook text,
  cta text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_competitor_creatives_updated_at
before update on public.competitor_creatives
for each row execute function public.set_updated_at();

create table public.competitor_creative_analyses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  competitor_creative_id uuid not null references public.competitor_creatives(id) on delete cascade,
  model text not null,
  status text not null default 'completed',
  hook text,
  hook_explanation text,
  body text,
  ending text,
  visual_elements jsonb not null default '{}',
  detected_text text,
  offer text,
  angle text,
  funnel_stage text,
  emotion_scores jsonb not null default '{}',
  strengths jsonb not null default '[]',
  weaknesses jsonb not null default '[]',
  hypotheses jsonb not null default '[]',
  adaptation_ideas jsonb not null default '[]',
  ranking_score numeric,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_competitor_creative_analyses_updated_at
before update on public.competitor_creative_analyses
for each row execute function public.set_updated_at();

create index competitors_client_idx on public.competitors(client_id, created_at desc);
create index competitor_ad_library_sources_client_idx on public.competitor_ad_library_sources(client_id, status, created_at desc);
create index competitor_creatives_client_idx on public.competitor_creatives(client_id, competitor_id, created_at desc);
create index competitor_creatives_score_idx on public.competitor_creatives(client_id, estimated_spend desc, reach_estimate desc);
create index competitor_creative_analyses_client_idx on public.competitor_creative_analyses(client_id, competitor_creative_id, created_at desc);

alter table public.competitors enable row level security;
alter table public.competitor_ad_library_sources enable row level security;
alter table public.competitor_creatives enable row level security;
alter table public.competitor_creative_analyses enable row level security;

create policy "authenticated manage competitors" on public.competitors for all to authenticated using (true) with check (true);
create policy "authenticated manage competitor_ad_library_sources" on public.competitor_ad_library_sources for all to authenticated using (true) with check (true);
create policy "authenticated manage competitor_creatives" on public.competitor_creatives for all to authenticated using (true) with check (true);
create policy "authenticated manage competitor_creative_analyses" on public.competitor_creative_analyses for all to authenticated using (true) with check (true);
