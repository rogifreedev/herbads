alter table public.batch_launch_jobs
  add column retry_after timestamptz,
  add column retry_count integer not null default 0 check (retry_count >= 0);

drop index public.batch_upload_fifo_idx;
create index batch_upload_fifo_idx on public.batch_launch_jobs(queued_at, id)
  where queue_enabled and control_status = 'run' and status in ('pending', 'running');
create index batch_upload_retry_idx on public.batch_launch_jobs(retry_after, queued_at)
  where queue_enabled and control_status = 'run' and status in ('pending', 'running');

create or replace function public.claim_batch_upload_step(
  p_client_id uuid,
  p_job_id uuid,
  p_queue_token uuid,
  p_token uuid
)
returns setof public.batch_launch_jobs language plpgsql security invoker set search_path = '' as $$
declare head public.batch_launch_jobs;
begin
  perform 1 from public.batch_upload_runtime
  where singleton and enabled and lease_token = p_queue_token and lease_until > now()
  for update;
  if not found then return; end if;
  select * into head from public.batch_launch_jobs
    where queue_enabled and control_status = 'run' and status in ('pending', 'running')
      and (retry_after is null or retry_after <= now())
    order by queued_at, id limit 1 for update;
  if not found or head.id <> p_job_id or head.client_id <> p_client_id or head.lease_until > now() then return; end if;
  return query update public.batch_launch_jobs
    set lease_token = p_token,
      lease_until = now() + interval '180 seconds',
      status = 'running',
      error = null,
      retry_after = null
    where id = head.id
    returning *;
end;
$$;

create function public.defer_batch_upload_step(
  p_client_id uuid,
  p_job_id uuid,
  p_token uuid,
  p_state jsonb,
  p_error text,
  p_retry_after timestamptz
)
returns boolean language sql security invoker set search_path = '' as $$
  with saved as (
    update public.batch_launch_jobs
    set state = p_state,
      error = left(p_error, 1000),
      retry_after = p_retry_after,
      retry_count = retry_count + 1,
      status = case
        when control_status = 'cancel' then 'cancelled'
        when control_status = 'pause' then 'paused'
        else 'pending'
      end,
      lease_token = null,
      lease_until = null
    where id = p_job_id and client_id = p_client_id and lease_token = p_token
    returning 1
  )
  select exists(select 1 from saved);
$$;

create or replace function public.control_batch_upload(p_client_id uuid, p_job_id uuid, p_action text)
returns setof public.batch_launch_jobs language plpgsql security invoker set search_path = '' as $$
declare job public.batch_launch_jobs;
begin
  if p_action is null or p_action not in ('pause', 'resume', 'cancel') then raise exception 'Ungueltige Upload-Aktion.'; end if;
  select * into job from public.batch_launch_jobs where id = p_job_id and client_id = p_client_id for update;
  if not found then raise exception 'Upload nicht gefunden.'; end if;
  if job.status in ('completed', 'review', 'cancelled') then raise exception 'Dieser Upload kann nicht fortgesetzt oder geaendert werden.'; end if;
  return query update public.batch_launch_jobs set
    queue_enabled = true,
    control_status = case p_action when 'resume' then 'run' when 'pause' then 'pause' else 'cancel' end,
    status = case when job.lease_until > now() then job.status
      when p_action = 'resume' then 'pending' when p_action = 'pause' then 'paused' else 'cancelled' end,
    queued_at = case when p_action = 'resume' and (job.lease_until is null or job.lease_until <= now()) then now() else queued_at end,
    retry_after = case when p_action = 'resume' then null else retry_after end,
    retry_count = case when p_action = 'resume' then 0 else retry_count end,
    error = case when p_action = 'resume' then null else error end
    where id = job.id returning *;
end;
$$;

revoke all on function public.defer_batch_upload_step(uuid, uuid, uuid, jsonb, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.defer_batch_upload_step(uuid, uuid, uuid, jsonb, text, timestamptz)
  to service_role;

create or replace view public.batch_upload_overview with (security_invoker = true) as
with positions as (
  select id, row_number() over (
    order by (retry_after is not null and retry_after > now()), coalesce(retry_after, queued_at), queued_at, id
  ) as queue_position
  from public.batch_launch_jobs
  where queue_enabled and control_status = 'run' and status in ('pending', 'running')
)
select j.id, j.client_id, c.name as client_name, j.ad_account_id, a.name as account_name,
  a.meta_account_id, j.drive_folder_id, j.name, j.status, j.control_status, j.queue_enabled,
  j.created_at, j.updated_at, j.queued_at, j.error, j.lease_until,
  j.state->>'step' as step, j.state->>'adsetId' as adset_id,
  coalesce((j.payload->'input'->>'activate')::boolean, false) as activate,
  coalesce((j.state->>'activated')::boolean, false) as activated,
  coalesce((j.state->>'activationStarted')::boolean, false) as activation_started,
  jsonb_array_length(j.payload->'input'->'groups') as ad_count,
  jsonb_array_length(j.payload->'files') as file_count,
  (select count(*) from jsonb_each(j.state->'ads') x where x.value->>'adId' is not null) as ads_done,
  (select count(*) from jsonb_each(j.state->'media') x where x.value->>'imageHash' is not null or x.value->>'ready' = 'true') as files_done,
  p.queue_position,
  j.retry_after,
  j.retry_count
from public.batch_launch_jobs j
join public.clients c on c.id = j.client_id
join public.meta_ad_accounts a on a.id = j.ad_account_id
left join positions p on p.id = j.id;

revoke all on public.batch_upload_overview from public, anon, authenticated;
grant select on public.batch_upload_overview to service_role;

create or replace function batch_upload_private.wake_batch_upload_queue(p_force boolean default false) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare runtime public.batch_upload_runtime; request_id bigint;
begin
  update public.batch_upload_runtime set scheduler_seen_at = now() where singleton returning * into runtime;
  update public.batch_launch_jobs
  set status = case when control_status = 'pause' then 'paused' else 'cancelled' end,
    lease_token = null, lease_until = null
  where queue_enabled and control_status in ('pause', 'cancel') and status in ('pending', 'running')
    and (lease_until is null or lease_until < now());
  if not runtime.enabled or (runtime.lease_until > now() and not p_force) then return null; end if;
  if not p_force and not exists(
    select 1 from public.batch_launch_jobs
    where queue_enabled and control_status = 'run' and status in ('pending', 'running')
      and (retry_after is null or retry_after <= now())
  ) then return null; end if;
  select net.http_post(
    url := 'https://herbads.vercel.app/api/cron/batches/uploads',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'batch_upload_worker_token')),
    body := '{}'::jsonb, timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;

revoke all on function batch_upload_private.wake_batch_upload_queue(boolean)
  from public, anon, authenticated, service_role;
