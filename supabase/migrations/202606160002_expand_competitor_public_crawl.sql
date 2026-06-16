alter table public.competitor_creatives
add column if not exists demographic_signals jsonb not null default '{}',
add column if not exists age_ranges jsonb not null default '[]',
add column if not exists gender_signals jsonb not null default '[]',
add column if not exists audience_locations jsonb not null default '[]',
add column if not exists audience_interests jsonb not null default '[]';

alter table public.competitor_creative_analyses
add column if not exists target_audience text,
add column if not exists age_signal text,
add column if not exists audience_reasoning text,
add column if not exists thesis text;

create unique index if not exists competitor_creatives_client_ad_library_id_key
on public.competitor_creatives(client_id, ad_library_id)
where ad_library_id is not null;

create index if not exists competitor_creatives_client_angle_lookup_idx
on public.competitor_creatives(client_id, competitor_id, created_at desc);
