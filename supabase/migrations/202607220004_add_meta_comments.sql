create table if not exists public.meta_comments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  ad_id uuid references public.meta_ads(id) on delete set null,
  creative_id uuid references public.creatives(id) on delete set null,
  meta_comment_id text not null,
  parent_meta_comment_id text,
  object_story_id text not null,
  message text not null,
  commenter_name text,
  commenter_meta_id text,
  like_count integer not null default 0,
  reply_count integer not null default 0,
  comment_created_at timestamptz,
  ai_status text not null default 'pending',
  is_wording_candidate boolean not null default false,
  wording_score integer,
  wording_reason text,
  suggested_wording text,
  themes text[] not null default '{}',
  ai_model text,
  analyzed_at timestamptz,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, meta_comment_id),
  constraint meta_comments_wording_score_check check (wording_score is null or wording_score between 0 and 100),
  constraint meta_comments_ai_status_check check (ai_status in ('pending', 'analyzed', 'failed'))
);

create trigger set_meta_comments_updated_at
before update on public.meta_comments
for each row execute function public.set_updated_at();

create table if not exists public.meta_comment_sync_state (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  ad_account_id uuid not null references public.meta_ad_accounts(id) on delete cascade,
  ad_id uuid references public.meta_ads(id) on delete set null,
  creative_id uuid references public.creatives(id) on delete set null,
  object_story_id text not null,
  status text not null default 'pending',
  last_synced_at timestamptz,
  last_comment_created_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(client_id, object_story_id),
  constraint meta_comment_sync_state_status_check check (status in ('pending', 'completed', 'failed'))
);

create trigger set_meta_comment_sync_state_updated_at
before update on public.meta_comment_sync_state
for each row execute function public.set_updated_at();

create index if not exists meta_comments_client_created_idx
on public.meta_comments(client_id, comment_created_at desc);

create index if not exists meta_comments_client_candidate_idx
on public.meta_comments(client_id, is_wording_candidate, wording_score desc);

create index if not exists meta_comments_client_ai_status_idx
on public.meta_comments(client_id, ai_status, created_at);

create index if not exists meta_comment_sync_state_client_synced_idx
on public.meta_comment_sync_state(client_id, last_synced_at nulls first);

alter table public.meta_comments enable row level security;
alter table public.meta_comment_sync_state enable row level security;

create policy "authenticated manage meta_comments"
on public.meta_comments
for all to authenticated
using (true)
with check (true);

create policy "authenticated manage meta_comment_sync_state"
on public.meta_comment_sync_state
for all to authenticated
using (true)
with check (true);
