alter table public.creatives
add column if not exists video_url text,
add column if not exists video_embed_url text,
add column if not exists video_permalink_url text;
