alter table public.batch_launch_jobs
  add column queue_enabled boolean not null default false,
  add column control_status text not null default 'run' check (control_status in ('run', 'pause', 'cancel')),
  add column queued_at timestamptz not null default now();
alter table public.batch_launch_jobs drop constraint batch_launch_jobs_status_check;
alter table public.batch_launch_jobs add constraint batch_launch_jobs_status_check
  check (status in ('pending', 'running', 'paused', 'cancelled', 'failed', 'review', 'completed'));
create index batch_upload_fifo_idx on public.batch_launch_jobs(queued_at, id)
  where queue_enabled and control_status = 'run' and status in ('pending', 'running');

create table public.batch_upload_runtime (
  singleton boolean primary key default true check (singleton),
  enabled boolean not null default false,
  worker_token_hash text,
  lease_token uuid,
  lease_until timestamptz,
  scheduler_seen_at timestamptz,
  heartbeat_at timestamptz,
  last_error text
);
insert into public.batch_upload_runtime(singleton) values (true);
alter table public.batch_upload_runtime enable row level security;
revoke all on public.batch_upload_runtime from public, anon, authenticated;
grant select, update on public.batch_upload_runtime to service_role;

create function public.authorize_batch_upload_worker(p_secret text) returns boolean
language sql stable security invoker set search_path = '' as $$
  select coalesce(length(p_secret) = 64 and worker_token_hash = encode(extensions.digest(p_secret, 'sha256'), 'hex'), false)
  from public.batch_upload_runtime where singleton;
$$;

create function public.claim_batch_upload_queue(p_token uuid) returns boolean
language sql security invoker set search_path = '' as $$
  with claimed as (
    update public.batch_upload_runtime
    set lease_token = p_token, lease_until = now() + interval '180 seconds', heartbeat_at = now(), last_error = null
    where singleton and enabled and (lease_until is null or lease_until < now())
    returning 1
  ) select exists(select 1 from claimed);
$$;

create function public.release_batch_upload_queue(p_token uuid, p_error text default null) returns void
language sql security invoker set search_path = '' as $$
  update public.batch_upload_runtime set lease_token = null, lease_until = null, heartbeat_at = now(), last_error = left(p_error, 1000)
  where singleton and lease_token = p_token;
$$;

-- Both leases and FIFO selection are checked in one transaction. Never skip a busy head job.
create function public.claim_batch_upload_step(p_client_id uuid, p_job_id uuid, p_queue_token uuid, p_token uuid)
returns setof public.batch_launch_jobs language plpgsql security invoker set search_path = '' as $$
declare head public.batch_launch_jobs;
begin
  perform 1 from public.batch_upload_runtime where singleton and enabled and lease_token = p_queue_token and lease_until > now() for update;
  if not found then return; end if;
  select * into head from public.batch_launch_jobs
    where queue_enabled and control_status = 'run' and status in ('pending', 'running')
    order by queued_at, id limit 1 for update;
  if not found or head.id <> p_job_id or head.client_id <> p_client_id or head.lease_until > now() then return; end if;
  return query update public.batch_launch_jobs set lease_token = p_token, lease_until = now() + interval '180 seconds', status = 'running', error = null
    where id = head.id returning *;
end;
$$;

-- A worker saving progress must not overwrite a concurrent pause/cancel request.
create function public.persist_batch_upload_step(p_client_id uuid, p_job_id uuid, p_token uuid, p_state jsonb, p_status text, p_error text, p_release boolean)
returns boolean language sql security invoker set search_path = '' as $$
  with saved as (
    update public.batch_launch_jobs set state = p_state, error = p_error,
      status = case
        when p_status in ('completed', 'review', 'failed') then p_status
        when control_status = 'cancel' then 'cancelled'
        when control_status = 'pause' then 'paused'
        else p_status end,
      lease_token = case when p_release then null else lease_token end,
      lease_until = case when p_release then null else lease_until end
    where id = p_job_id and client_id = p_client_id and lease_token = p_token
    returning 1
  ) select exists(select 1 from saved);
$$;

create function public.control_batch_upload(p_client_id uuid, p_job_id uuid, p_action text)
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
    error = case when p_action = 'resume' then null else error end
    where id = job.id returning *;
end;
$$;

revoke all on function public.authorize_batch_upload_worker(text), public.claim_batch_upload_queue(uuid),
  public.release_batch_upload_queue(uuid, text), public.claim_batch_upload_step(uuid, uuid, uuid, uuid),
  public.persist_batch_upload_step(uuid, uuid, uuid, jsonb, text, text, boolean), public.control_batch_upload(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.authorize_batch_upload_worker(text), public.claim_batch_upload_queue(uuid),
  public.release_batch_upload_queue(uuid, text), public.claim_batch_upload_step(uuid, uuid, uuid, uuid),
  public.persist_batch_upload_step(uuid, uuid, uuid, jsonb, text, text, boolean), public.control_batch_upload(uuid, uuid, text)
  to service_role;

create view public.batch_upload_overview with (security_invoker = true) as
with positions as (
  select id, row_number() over (order by queued_at, id) as queue_position
  from public.batch_launch_jobs where queue_enabled and control_status = 'run' and status in ('pending', 'running')
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
  p.queue_position
from public.batch_launch_jobs j
join public.clients c on c.id = j.client_id
join public.meta_ad_accounts a on a.id = j.ad_account_id
left join positions p on p.id = j.id;
revoke all on public.batch_upload_overview from public, anon, authenticated;
grant select on public.batch_upload_overview to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create schema batch_upload_private;
revoke all on schema batch_upload_private from public, anon, authenticated;

-- Credential stays in Vault. The application verifies its hash through a service-only RPC.
do $$
declare secret text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  perform vault.create_secret(secret, 'batch_upload_worker_token');
  update public.batch_upload_runtime set worker_token_hash = encode(extensions.digest(secret, 'sha256'), 'hex') where singleton;
end;
$$;

create function batch_upload_private.wake_batch_upload_queue(p_force boolean default false) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare runtime public.batch_upload_runtime; request_id bigint;
begin
  update public.batch_upload_runtime set scheduler_seen_at = now() where singleton returning * into runtime;
  if not runtime.enabled or (runtime.lease_until > now() and not p_force) then return null; end if;
  if not p_force and not exists(select 1 from public.batch_launch_jobs where queue_enabled and control_status = 'run' and status in ('pending', 'running')) then return null; end if;
  select net.http_post(
    url := 'https://herbads.vercel.app/api/cron/batches/uploads',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' ||
      (select decrypted_secret from vault.decrypted_secrets where name = 'batch_upload_worker_token')),
    body := '{}'::jsonb, timeout_milliseconds := 120000
  ) into request_id;
  return request_id;
end;
$$;
revoke all on function batch_upload_private.wake_batch_upload_queue(boolean) from public, anon, authenticated, service_role;
select cron.schedule('herbads-batch-uploads', '10 seconds', 'select batch_upload_private.wake_batch_upload_queue();');
