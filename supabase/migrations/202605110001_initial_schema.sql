create extension if not exists vector;
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

create table public.client_profiles (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  brand_name text,
  positioning text,
  tone_of_voice text,
  target_audience text,
  pain_points text,
  buying_triggers text,
  usps text,
  offers text,
  forbidden_claims text,
  brand_no_gos text,
  competitors text,
  cta_preferences text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id)
);

create trigger set_client_profiles_updated_at
before update on public.client_profiles
for each row execute function public.set_updated_at();

create table public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  meta_account_id text not null,
  name text,
  currency text,
  timezone_name text,
  status text not null default 'active',
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(meta_account_id)
);

create trigger set_meta_ad_accounts_updated_at
before update on public.meta_ad_accounts
for each row execute function public.set_updated_at();

create table public.meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  meta_campaign_id text not null,
  name text,
  objective text,
  status text,
  effective_status text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, meta_campaign_id)
);

create trigger set_meta_campaigns_updated_at
before update on public.meta_campaigns
for each row execute function public.set_updated_at();

create table public.meta_ad_sets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  campaign_id uuid references public.meta_campaigns(id) on delete set null,
  meta_adset_id text not null,
  name text,
  optimization_goal text,
  billing_event text,
  status text,
  effective_status text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, meta_adset_id)
);

create trigger set_meta_ad_sets_updated_at
before update on public.meta_ad_sets
for each row execute function public.set_updated_at();

create table public.creatives (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  meta_creative_id text not null,
  creative_type text,
  name text,
  title text,
  body text,
  call_to_action_type text,
  image_url text,
  video_id text,
  thumbnail_url text,
  landing_url text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, meta_creative_id)
);

create trigger set_creatives_updated_at
before update on public.creatives
for each row execute function public.set_updated_at();

create table public.meta_ads (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  campaign_id uuid references public.meta_campaigns(id) on delete set null,
  adset_id uuid references public.meta_ad_sets(id) on delete set null,
  creative_id uuid references public.creatives(id) on delete set null,
  meta_ad_id text not null,
  meta_creative_id text,
  name text,
  status text,
  effective_status text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(ad_account_id, meta_ad_id)
);

create trigger set_meta_ads_updated_at
before update on public.meta_ads
for each row execute function public.set_updated_at();

create table public.creative_insights_daily (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  campaign_id uuid references public.meta_campaigns(id) on delete set null,
  adset_id uuid references public.meta_ad_sets(id) on delete set null,
  ad_id uuid references public.meta_ads(id) on delete cascade,
  creative_id uuid references public.creatives(id) on delete set null,
  date date not null,
  spend numeric not null default 0,
  impressions integer not null default 0,
  reach integer not null default 0,
  frequency numeric,
  clicks integer not null default 0,
  link_clicks integer not null default 0,
  ctr numeric,
  cpc numeric,
  cpm numeric,
  purchases integer not null default 0,
  purchase_value numeric not null default 0,
  cost_per_purchase numeric,
  roas numeric,
  engagement integer not null default 0,
  video_3s_views integer not null default 0,
  thruplays integer not null default 0,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(ad_id, date)
);

create table public.creative_ai_analyses (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  creative_id uuid not null references public.creatives(id) on delete cascade,
  model text not null,
  status text not null default 'pending',
  summary text,
  creative_type text,
  visual_elements jsonb not null default '{}',
  detected_text text,
  hook text,
  target_audience_fit_score numeric,
  brand_fit_score numeric,
  clarity_score numeric,
  scrollstopper_score numeric,
  cta_score numeric,
  risks jsonb not null default '[]',
  hypotheses jsonb not null default '[]',
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_creative_ai_analyses_updated_at
before update on public.creative_ai_analyses
for each row execute function public.set_updated_at();

create table public.creative_scores (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  creative_id uuid not null references public.creatives(id) on delete cascade,
  from_date date not null,
  to_date date not null,
  score numeric not null,
  confidence numeric not null default 0,
  score_components jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique(creative_id, from_date, to_date)
);

create table public.client_knowledge_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  title text not null,
  document_type text not null default 'general',
  source_type text not null default 'upload',
  storage_path text,
  status text not null default 'pending',
  error_message text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_client_knowledge_documents_updated_at
before update on public.client_knowledge_documents
for each row execute function public.set_updated_at();

create table public.client_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  document_id uuid not null references public.client_knowledge_documents(id) on delete cascade,
  content text not null,
  embedding vector(1536),
  chunk_index integer not null,
  token_count integer,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index client_knowledge_chunks_client_id_idx on public.client_knowledge_chunks(client_id);
create index client_knowledge_chunks_embedding_idx on public.client_knowledge_chunks using hnsw (embedding vector_cosine_ops);

create or replace function public.match_client_knowledge(
  query_embedding vector(1536),
  match_client_id uuid,
  match_count int default 8
)
returns table (
  id uuid,
  document_id uuid,
  content text,
  metadata jsonb,
  similarity float
)
language sql stable
as $$
  select
    client_knowledge_chunks.id,
    client_knowledge_chunks.document_id,
    client_knowledge_chunks.content,
    client_knowledge_chunks.metadata,
    1 - (client_knowledge_chunks.embedding <=> query_embedding) as similarity
  from public.client_knowledge_chunks
  where client_knowledge_chunks.client_id = match_client_id
  order by client_knowledge_chunks.embedding <=> query_embedding
  limit match_count;
$$;

create table public.sync_jobs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.clients(id) on delete cascade,
  ad_account_id uuid references public.meta_ad_accounts(id) on delete cascade,
  job_type text not null,
  status text not null default 'pending',
  payload jsonb not null default '{}',
  error_message text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.clients enable row level security;
alter table public.client_profiles enable row level security;
alter table public.meta_ad_accounts enable row level security;
alter table public.meta_campaigns enable row level security;
alter table public.meta_ad_sets enable row level security;
alter table public.meta_ads enable row level security;
alter table public.creatives enable row level security;
alter table public.creative_insights_daily enable row level security;
alter table public.creative_ai_analyses enable row level security;
alter table public.creative_scores enable row level security;
alter table public.client_knowledge_documents enable row level security;
alter table public.client_knowledge_chunks enable row level security;
alter table public.sync_jobs enable row level security;

create policy "authenticated manage clients" on public.clients for all to authenticated using (true) with check (true);
create policy "authenticated manage client_profiles" on public.client_profiles for all to authenticated using (true) with check (true);
create policy "authenticated manage meta_ad_accounts" on public.meta_ad_accounts for all to authenticated using (true) with check (true);
create policy "authenticated manage meta_campaigns" on public.meta_campaigns for all to authenticated using (true) with check (true);
create policy "authenticated manage meta_ad_sets" on public.meta_ad_sets for all to authenticated using (true) with check (true);
create policy "authenticated manage meta_ads" on public.meta_ads for all to authenticated using (true) with check (true);
create policy "authenticated manage creatives" on public.creatives for all to authenticated using (true) with check (true);
create policy "authenticated manage creative_insights_daily" on public.creative_insights_daily for all to authenticated using (true) with check (true);
create policy "authenticated manage creative_ai_analyses" on public.creative_ai_analyses for all to authenticated using (true) with check (true);
create policy "authenticated manage creative_scores" on public.creative_scores for all to authenticated using (true) with check (true);
create policy "authenticated manage client_knowledge_documents" on public.client_knowledge_documents for all to authenticated using (true) with check (true);
create policy "authenticated manage client_knowledge_chunks" on public.client_knowledge_chunks for all to authenticated using (true) with check (true);
create policy "authenticated manage sync_jobs" on public.sync_jobs for all to authenticated using (true) with check (true);
