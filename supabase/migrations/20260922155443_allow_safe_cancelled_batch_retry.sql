-- Keep ambiguous, leased, partially created and completed jobs protected against duplicate launches.
-- Only a cancelled attempt without any ad can release its campaign/folder combination.
create unique index batch_launch_jobs_current_attempt_idx
  on public.batch_launch_jobs(ad_account_id, drive_folder_id, meta_campaign_id)
  where status <> 'cancelled'
    or lease_token is not null
    or state->>'inFlight' is not null
    or state->>'activationStarted' = 'true'
    or state->>'activated' = 'true'
    or jsonb_path_exists(state, '$.ads.*.adId');

alter table public.batch_launch_jobs
  drop constraint batch_launch_jobs_ad_account_id_drive_folder_id_meta_campai_key;
