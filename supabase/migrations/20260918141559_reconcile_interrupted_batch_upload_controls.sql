create or replace function batch_upload_private.wake_batch_upload_queue(p_force boolean default false) returns bigint
language plpgsql security invoker set search_path = '' as $$
declare runtime public.batch_upload_runtime; request_id bigint;
begin
  update public.batch_upload_runtime set scheduler_seen_at = now() where singleton returning * into runtime;
  -- Finish controls even if the worker timed out before acknowledging them.
  update public.batch_launch_jobs
  set status = case control_status when 'cancel' then 'cancelled' else 'paused' end,
    lease_token = null, lease_until = null
  where queue_enabled and control_status in ('pause', 'cancel') and status in ('pending', 'running')
    and (lease_until is null or lease_until <= now());
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
