create table if not exists public.creative_video_transcripts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  creative_id uuid not null references public.creatives(id) on delete cascade,
  provider text not null default 'openai',
  model text not null,
  status text not null default 'pending',
  language text,
  transcript text,
  segments jsonb not null default '[]',
  duration_seconds numeric,
  source_url text,
  source_content_type text,
  source_bytes bigint,
  error_message text,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(creative_id)
);

create trigger set_creative_video_transcripts_updated_at
before update on public.creative_video_transcripts
for each row execute function public.set_updated_at();

create index if not exists creative_video_transcripts_client_id_idx
on public.creative_video_transcripts(client_id);

create index if not exists creative_video_transcripts_status_idx
on public.creative_video_transcripts(client_id, status);

alter table public.creative_video_transcripts enable row level security;

create policy "authenticated manage creative_video_transcripts"
on public.creative_video_transcripts for all to authenticated using (true) with check (true);
