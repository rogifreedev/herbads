-- Rollback-only fixtures, no queue jobs and no external API requests.
begin;
do $$
declare
  client uuid; account_a uuid := gen_random_uuid(); account_b uuid := gen_random_uuid();
  account uuid; adset uuid; job uuid; payload jsonb; result_count integer;
  ids uuid[] := '{}'; external_id text;
begin
  select id into client from public.clients limit 1;
  if client is null then raise exception 'Existing client required'; end if;
  if has_function_privilege('anon','public.get_adset_output(date,date)','execute') or
     has_function_privilege('authenticated','public.get_adset_output(date,date)','execute') or
     not has_function_privilege('service_role','public.get_adset_output(date,date)','execute') then
    raise exception 'Report function permissions incorrect';
  end if;
  insert into public.meta_ad_accounts(id,client_id,meta_account_id,name)
    values (account_a,client,account_a::text,'Output SQL A'),(account_b,client,account_b::text,'Output SQL B');
  for i in 1..8 loop
    account := case when i=8 then account_b else account_a end;
    adset := gen_random_uuid(); job := gen_random_uuid(); ids := array_append(ids,job);
    external_id := case when i=8 then '2' else i::text end;
    insert into public.meta_ad_sets(id,client_id,ad_account_id,meta_adset_id,name,status,effective_status)
      values (adset,client,account,external_id,'Output fixture',case when i=2 then 'PAUSED' else 'ACTIVE' end,'ACTIVE');
    payload := '{"files":[{"id":"feed","kind":"image"},{"id":"story","kind":"image"},{"id":"unused","kind":"video"}],"input":{"groups":[{"feedFileId":"feed","storyFileId":"story"}]}}';
    if i=2 then payload := '{"files":[{"id":"feed","kind":"video"},{"id":"story","kind":"video"},{"id":"unused","kind":"image"}],"input":{"groups":[{"feedFileId":"feed","storyFileId":"story"}]}}'; end if;
    if i=3 then payload := jsonb_set(payload,'{files,1,kind}','"video"'); end if;
    if i=6 then payload := '{"files":[],"input":{"groups":[]}}'; end if;
    if i<>7 then
      insert into public.batch_launch_jobs(id,client_id,ad_account_id,drive_folder_id,meta_campaign_id,name,status,payload,state,queue_enabled)
        values(job,client,account,job::text,'output-test','Output fixture','completed',payload,jsonb_build_object('adsetId',external_id),false);
    end if;
    if i=2 then
      insert into public.batch_launch_jobs(client_id,ad_account_id,drive_folder_id,meta_campaign_id,name,status,payload,state,queue_enabled,created_at)
        values(client,account,gen_random_uuid()::text,'output-test','Duplicate record','completed',payload,jsonb_build_object('adsetId',external_id),false,now()+interval '1 second');
    end if;
    if i<>5 then
      insert into public.creative_insights_daily(client_id,ad_account_id,adset_id,date,impressions,spend)
        values(client,account,adset,case when i=1 then date '2026-09-30' when i=6 then date '2026-10-31' else date '2026-10-01' end,
          case when i in (3,4) then 0 else 10 end,case when i=3 then 1 else 0 end);
    end if;
    if i in (1,2) then
      insert into public.creative_insights_daily(client_id,ad_account_id,adset_id,date,impressions)
        values(client,account,adset,'2026-10-02',100);
    end if;
  end loop;
  select count(*) into result_count from public.get_adset_output('2026-10-01','2026-10-07') where account_id in (account_a,account_b);
  if result_count<>3 then raise exception 'Expected 3 first deliveries, got %',result_count; end if;
  if (select media_type from public.get_adset_output(null,null) where job_id=ids[2]) <> 'video' then raise exception 'Video pair or unused media classification failed'; end if;
  if (select media_type from public.get_adset_output(null,null) where job_id=ids[3]) <> 'mixed' then raise exception 'Mixed classification failed'; end if;
  if (select media_type from public.get_adset_output(null,null) where job_id=ids[1]) <> 'static' then raise exception 'Image pair classification failed'; end if;
  if (select media_type from public.get_adset_output(null,null) where job_id=ids[6]) <> 'unknown' then raise exception 'Unknown media classification failed'; end if;
  select count(*) into result_count from public.get_adset_output('2026-10-01','2026-10-31') where account_id in (account_a,account_b);
  if result_count<>4 then raise exception 'Inclusive end date failed'; end if;
  select count(*) into result_count from public.get_adset_output(null,null) where account_id in (account_a,account_b);
  if result_count<>5 then raise exception 'All time, provenance, no-delivery exclusion or deduplication failed'; end if;
end $$;
rollback;
