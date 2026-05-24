create table public.ad_idea_generations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  model text not null,
  status text not null default 'completed',
  options jsonb not null default '{}',
  prompt_context jsonb not null default '{}',
  raw_response jsonb not null default '{}',
  error_message text,
  created_at timestamptz not null default now()
);

create table public.ad_ideas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  generation_id uuid references public.ad_idea_generations(id) on delete set null,
  status text not null default 'new',
  format text not null default 'reel',
  funnel_stage text,
  hook text not null,
  angle text,
  concept text,
  visual_direction text,
  first_seconds text,
  script_outline text,
  primary_text text,
  headline text,
  cta text,
  rationale text,
  score numeric,
  source_patterns jsonb not null default '[]',
  meta_context jsonb not null default '{}',
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_ad_ideas_updated_at
before update on public.ad_ideas
for each row execute function public.set_updated_at();

create table public.ad_idea_creative_links (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  idea_id uuid not null references public.ad_ideas(id) on delete cascade,
  creative_id uuid not null references public.creatives(id) on delete cascade,
  performance_snapshot jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(idea_id, creative_id)
);

create index ad_idea_generations_client_created_idx on public.ad_idea_generations(client_id, created_at desc);
create index ad_ideas_client_status_idx on public.ad_ideas(client_id, status, created_at desc);
create index ad_ideas_client_format_idx on public.ad_ideas(client_id, format, funnel_stage, created_at desc);
create index ad_idea_creative_links_client_idx on public.ad_idea_creative_links(client_id, idea_id, creative_id);

alter table public.ad_idea_generations enable row level security;
alter table public.ad_ideas enable row level security;
alter table public.ad_idea_creative_links enable row level security;

create policy "authenticated manage ad_idea_generations" on public.ad_idea_generations for all to authenticated using (true) with check (true);
create policy "authenticated manage ad_ideas" on public.ad_ideas for all to authenticated using (true) with check (true);
create policy "authenticated manage ad_idea_creative_links" on public.ad_idea_creative_links for all to authenticated using (true) with check (true);
