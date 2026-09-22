-- Always wrapped in ROLLBACK by scripts/test-batch-upload-sql.mjs --retry.
do $$
declare
  account public.meta_ad_accounts;
  folder text := gen_random_uuid()::text;
  original uuid := gen_random_uuid();
  current_id uuid := gen_random_uuid();
  unsafe_state jsonb;
  current_status text;
  refused boolean;
begin
  select * into account from public.meta_ad_accounts limit 1;
  if account.id is null then raise exception 'Account required for test fixtures'; end if;
  insert into public.batch_launch_jobs(id,client_id,ad_account_id,drive_folder_id,meta_campaign_id,name,payload,status,control_status,state)
  values(original,account.client_id,account.id,folder,'retry-test','RETRY TEST','{}','cancelled','cancel',
    '{"media":{"image":{"imageHash":"existing"}},"ads":{"first":{"creativeId":"200"}},"adsetId":"100","step":"ad"}');
  insert into public.batch_launch_jobs(id,client_id,ad_account_id,drive_folder_id,meta_campaign_id,name,payload)
  values(current_id,account.client_id,account.id,folder,'retry-test','NEW TEST','{}');
  if (select count(*) from public.batch_launch_jobs where drive_folder_id=folder) <> 2 then
    raise exception 'Cancelled history did not survive';
  end if;
  foreach current_status in array array['pending','running','paused','failed','review','completed'] loop
    update public.batch_launch_jobs set status=current_status where id=current_id;
    refused := false;
    begin
      insert into public.batch_launch_jobs(client_id,ad_account_id,drive_folder_id,meta_campaign_id,name,payload)
      values(account.client_id,account.id,folder,'retry-test','DUPLICATE TEST','{}');
    exception when unique_violation then refused := true;
    end;
    if not refused then raise exception 'Duplicate accepted for %',current_status; end if;
  end loop;
  update public.batch_launch_jobs set status='cancelled' where id=current_id;
  for unsafe_state in select value from jsonb_array_elements('[
    {"ads":{},"inFlight":"ad:first"},
    {"ads":{},"activationStarted":true},
    {"ads":{},"activated":true},
    {"ads":{"first":{"adId":"300"}}}
  ]') loop
    update public.batch_launch_jobs set state=unsafe_state where id=current_id;
    refused := false;
    begin
      insert into public.batch_launch_jobs(client_id,ad_account_id,drive_folder_id,meta_campaign_id,name,payload)
      values(account.client_id,account.id,folder,'retry-test','UNSAFE TEST','{}');
    exception when unique_violation then refused := true;
    end;
    if not refused then raise exception 'Unsafe cancelled attempt released: %',unsafe_state; end if;
  end loop;
  update public.batch_launch_jobs set state='{"ads":{}}',lease_token=gen_random_uuid() where id=current_id;
  refused := false;
  begin
    insert into public.batch_launch_jobs(client_id,ad_account_id,drive_folder_id,meta_campaign_id,name,payload)
    values(account.client_id,account.id,folder,'retry-test','LEASED TEST','{}');
  exception when unique_violation then refused := true;
  end;
  if not refused then raise exception 'Leased cancelled attempt released'; end if;
  if has_table_privilege('anon','public.batch_launch_jobs','insert') or
    has_table_privilege('authenticated','public.batch_launch_jobs','insert') then
    raise exception 'Public job writes allowed';
  end if;
end;
$$;
select 'PASS: cancelled retry, history, duplicate protection, ambiguity, leases and privileges' as result;
