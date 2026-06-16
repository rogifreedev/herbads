alter table public.competitors
add column if not exists crawl_enabled boolean not null default true;

create index if not exists competitors_client_crawl_enabled_idx
on public.competitors(client_id, crawl_enabled, created_at desc);
