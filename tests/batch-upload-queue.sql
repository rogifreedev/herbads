-- Run inside a transaction and ROLLBACK. These fixtures must never be visible to the scheduler.
do $$
declare
  account public.meta_ad_accounts; first_job uuid := gen_random_uuid(); second_job uuid := gen_random_uuid();
  leader uuid := gen_random_uuid(); other_leader uuid := gen_random_uuid(); worker uuid := gen_random_uuid();
  claimed public.batch_launch_jobs; saved boolean; refused boolean;
begin
  select * into account from public.meta_ad_accounts limit 1;
  if account.id is null then raise exception 'An existing account is required for transaction fixtures'; end if;
  update public.batch_upload_runtime set enabled = true, lease_token = null, lease_until = null,
    worker_token_hash = encode(extensions.digest(repeat('a',64), 'sha256'), 'hex');
  if not public.authorize_batch_upload_worker(repeat('a',64)) or public.authorize_batch_upload_worker(repeat('b',64)) then raise exception 'Credential validation failed'; end if;
  if has_function_privilege('anon','public.claim_batch_upload_queue(uuid)','execute') or
    has_function_privilege('authenticated','public.control_batch_upload(uuid,uuid,text)','execute') or
    has_table_privilege('anon','public.batch_upload_overview','select') then raise exception 'Public queue access'; end if;
  insert into public.batch_launch_jobs(id,client_id,ad_account_id,drive_folder_id,meta_campaign_id,name,payload,queue_enabled,queued_at)
  values
    (first_job,account.client_id,account.id,first_job::text,'sql-test','QUEUE SQL TEST 1','{"input":{"groups":[]},"files":[]}',true,now()-interval '2 seconds'),
    (second_job,account.client_id,account.id,second_job::text,'sql-test','QUEUE SQL TEST 2','{"input":{"groups":[]},"files":[]}',true,now()-interval '1 second');
  if not public.claim_batch_upload_queue(leader) or public.claim_batch_upload_queue(other_leader) then raise exception 'Singleton worker lease failed'; end if;
  if exists(select 1 from public.claim_batch_upload_step(account.client_id,second_job,leader,worker)) then raise exception 'FIFO bypassed'; end if;
  if exists(select 1 from public.claim_batch_upload_step(gen_random_uuid(),first_job,leader,worker)) then raise exception 'Foreign client claimed'; end if;
  if exists(select 1 from public.claim_batch_upload_step(account.client_id,first_job,other_leader,worker)) then raise exception 'Foreign leader claimed'; end if;
  select * into claimed from public.claim_batch_upload_step(account.client_id,first_job,leader,worker);
  if claimed.id is null or claimed.status <> 'running' then raise exception 'Head not claimed'; end if;
  if exists(select 1 from public.claim_batch_upload_step(account.client_id,first_job,leader,gen_random_uuid())) then raise exception 'Busy step claimed twice'; end if;
  if public.persist_batch_upload_step(account.client_id,first_job,gen_random_uuid(),claimed.state,'running',null,true) then raise exception 'Lost lease wrote state'; end if;
  perform public.control_batch_upload(account.client_id,first_job,'pause');
  if not public.persist_batch_upload_step(account.client_id,first_job,worker,claimed.state,'running',null,true) then raise exception 'Progress not saved'; end if;
  if (select status from public.batch_launch_jobs where id=first_job) <> 'paused' then raise exception 'Worker overwrote pause'; end if;
  select * into claimed from public.claim_batch_upload_step(account.client_id,second_job,leader,worker);
  if claimed.id is null then raise exception 'Paused job blocks queue'; end if;
  perform public.control_batch_upload(account.client_id,second_job,'cancel');
  perform public.persist_batch_upload_step(account.client_id,second_job,worker,claimed.state,'running',null,true);
  if (select status from public.batch_launch_jobs where id=second_job) <> 'cancelled' then raise exception 'Worker overwrote cancel'; end if;
  refused := false;
  begin perform public.control_batch_upload(account.client_id,second_job,'resume'); exception when others then refused := true; end;
  if not refused then raise exception 'Cancelled job resumed'; end if;
  perform public.control_batch_upload(account.client_id,first_job,'resume');
  update public.batch_launch_jobs set lease_until=now()-interval '1 second',state=jsonb_set(state,'{inFlight}','"adset"') where id=first_job;
  select * into claimed from public.claim_batch_upload_step(account.client_id,first_job,leader,worker);
  if claimed.state->>'inFlight' <> 'adset' then raise exception 'Recovery lost ambiguity marker'; end if;
  perform public.persist_batch_upload_step(account.client_id,first_job,worker,claimed.state,'review','Uncertain',true);
  refused := false;
  begin perform public.control_batch_upload(account.client_id,first_job,'resume'); exception when others then refused := true; end;
  if not refused then raise exception 'Review job resumed'; end if;
  perform public.release_batch_upload_queue(other_leader,null);
  if (select lease_token from public.batch_upload_runtime) <> leader then raise exception 'Foreign leader released lock'; end if;
  perform public.release_batch_upload_queue(leader,null);
  if not public.claim_batch_upload_queue(other_leader) then raise exception 'Queue lease not released'; end if;
  -- No network request is allowed from this rollback-only test.
  update public.batch_upload_runtime set enabled=false;
  update public.batch_launch_jobs set status='running', control_status='pause', lease_token=worker,
    lease_until=now()+interval '1 minute' where id=first_job;
  update public.batch_launch_jobs set status='running', control_status='cancel', lease_token=worker,
    lease_until=now()-interval '1 second' where id=second_job;
  perform batch_upload_private.wake_batch_upload_queue();
  if (select status from public.batch_launch_jobs where id=first_job) <> 'running' then raise exception 'Live worker was interrupted'; end if;
  if (select status from public.batch_launch_jobs where id=second_job) <> 'cancelled' then raise exception 'Timed-out cancellation not reconciled'; end if;
  update public.batch_launch_jobs set lease_until=now()-interval '1 second' where id=first_job;
  perform batch_upload_private.wake_batch_upload_queue();
  if (select status from public.batch_launch_jobs where id=first_job) <> 'paused' then raise exception 'Timed-out pause not reconciled'; end if;
  if public.persist_batch_upload_step(account.client_id,first_job,worker,claimed.state,'running',null,true) then raise exception 'Reconciled worker wrote late progress'; end if;
end;
$$;
