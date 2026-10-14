-- Tool provenance comes from the upload job, not a name match or the current Meta status.
create function public.get_adset_output(p_since date default null, p_until date default null)
returns table (
  job_id uuid, client_id uuid, client_name text, account_id uuid, account_name text,
  meta_account_id text, meta_adset_id text, batch_name text, folder_id text,
  first_delivery_date date, media_type text
)
language sql stable security invoker set search_path = '' as $$
  with launches as (
    select distinct on (j.ad_account_id, j.state->>'adsetId')
      j.id, j.client_id, j.ad_account_id, j.name, j.drive_folder_id, j.payload,
      j.state->>'adsetId' as external_id
    from public.batch_launch_jobs j
    where nullif(j.state->>'adsetId', '') is not null
    order by j.ad_account_id, j.state->>'adsetId', j.created_at, j.id
  )
  select j.id, j.client_id, c.name, j.ad_account_id, coalesce(a.name, a.meta_account_id), a.meta_account_id,
    j.external_id, j.name, j.drive_folder_id, delivery.first_date,
    case when kinds.has_image and kinds.has_video then 'mixed'
         when kinds.has_unknown or kinds.selected_count = 0 then 'unknown'
         when kinds.has_video then 'video' else 'static' end
  from launches j
  join public.clients c on c.id = j.client_id
  join public.meta_ad_accounts a on a.id = j.ad_account_id and a.client_id = j.client_id
  join public.meta_ad_sets s on s.ad_account_id = a.id and s.meta_adset_id = j.external_id
  cross join lateral (
    -- Find the first delivery across ALL history, then filter; ongoing batches are not new output.
    select min(i.date) as first_date from public.creative_insights_daily i
    where i.adset_id = s.id and i.ad_account_id = a.id and (i.impressions > 0 or i.spend > 0)
  ) delivery
  cross join lateral (
    select count(*) as selected_count,
      bool_or(f->>'kind' = 'image') as has_image,
      bool_or(f->>'kind' = 'video') as has_video,
      bool_or(coalesce(f->>'kind', '') not in ('image', 'video')) as has_unknown
    from jsonb_array_elements(coalesce(j.payload->'files', '[]'::jsonb)) f
    where exists (
      select 1 from jsonb_array_elements(coalesce(j.payload->'input'->'groups', '[]'::jsonb)) g
      where f->>'id' = g->>'feedFileId' or f->>'id' = g->>'storyFileId'
    )
  ) kinds
  where delivery.first_date is not null
    and (p_since is null or delivery.first_date >= p_since)
    and (p_until is null or delivery.first_date <= p_until);
$$;

revoke all on function public.get_adset_output(date, date) from public, anon, authenticated;
grant execute on function public.get_adset_output(date, date) to service_role;
