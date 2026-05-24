alter table public.creative_ai_analyses
add column if not exists funnel_stage text,
add column if not exists funnel_reason text;

create index if not exists creative_ai_analyses_funnel_stage_idx
on public.creative_ai_analyses(client_id, funnel_stage);
