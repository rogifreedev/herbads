# Batch Check: Create on Meta

The action on a missing Drive batch opens `/clients/[clientId]/batches/create?folderId=...`.
One batch creates one adset in an active existing campaign. The destination picker hides inactive campaigns, and creation rechecks the live status. Every selected motif becomes one ad.
New adset names are generated as `DD.MM.YYYY_<Drive batch name>` using the current date in `Europe/Berlin`, enforced server-side. Resumed jobs keep their original name.
The adset and every ad are initially created with `status: PAUSED`. Paused is the default final state. Users may explicitly choose activation and confirm the account, campaign and budget in a separate dialog. Only after all media, creatives and ads exist are the new ads enabled and, last, their new adset. The existing campaign is never modified or activated.

## Configuration

- `GOOGLE_DRIVE_API_KEY`: the same public/shared Drive folders used by Batch Check.
- `META_SYSTEM_USER_ACCESS_TOKEN`: server-only token with `ads_management` and access to the selected account and Facebook page.
- `META_API_VERSION`: optional Graph version override; batch creation defaults to `v25.0`.
- Supabase migration `20260915193915_add_batch_meta_launches.sql` adds account presets, resumable jobs and the copy statistics function. Tables and RPC are service-role only; API routes use the existing employee authentication middleware and validate account/client ownership.
- Migration `20260915200639_add_batch_adset_favorites.sql` adds account-scoped favorite adset references, also service-role only. Favoriting never changes an object on Meta. Favorites refer to current source adsets rather than stale configuration snapshots.

Account presets store daily budget, countries and language IDs. Existing active/paused adsets from any campaign in the same ad account can be selected as templates and favorited. Selecting a template or explicitly reapplying it copies its daily budget, countries and language IDs and clears the selected account preset; selecting an account preset then overrides those three settings. Changing the destination campaign preserves a manually selected source template.

Facebook and Instagram identities are account-scoped dropdowns loaded independently through `/launch/identities`. The server authorizes the client/account pair before reading Meta's `promote_pages` and `instagram_accounts` edges. Results are cached for one minute per account, API version and token; manual refresh and creation bypass the cache. No tokens are returned to the browser. Creation rechecks identity availability before any Meta write or job insertion.

Source identities are selected when available, with legacy Instagram IDs mapped to current IG User IDs. A single available identity is selected only when the source has none; multiple choices are never guessed. Manual selections, including an explicit empty Instagram selection, survive late template responses and retries. Unavailable source identities remain visibly marked and block creation until corrected. Switching accounts discards stale responses and manual selections. Loading, errors and empty lists are explicit; the launch prerequisites link to the relevant dropdown or refresh control.

Adset budget is omitted for campaigns with campaign-level budgets. Other settings, including pixel, conversion event, age, placements, bidding and DSA identity, come from the selected source adset. Geographic details and exclusions are retained when the source countries are unchanged. Country overrides replace geography explicitly. Unsupported app, catalog, messaging and dynamic-creative templates fail validation before creation. Expired schedules, source status and source name are not copied.

The reference-adset dropdown searches names, Meta IDs and source campaign names directly inside the popup. Favorites appear first. Templates from paused campaigns remain available even though destination campaigns must be active.

## Media and Text

- PNG/JPEG images up to 30 MiB; MP4/QuickTime videos up to 4 GiB.
- Up to 100 media files, 150 folders and 8 nested levels per batch. Limits fail explicitly; unsupported files are listed separately.
- Matching first uses normalized relative paths/motif names and dimensions, including bracketed formats, underscores and multiplication signs. One unambiguous 1:1 or 4:5 feed asset plus one 9:16 asset becomes one placement-customized creative. Non-format folder boundaries and motif numbers remain significant.
- Unmatched images receive a server-side visual comparison using OpenCV ORB features, RANSAC geometry and spatial coverage. Only a strong, mutually unique match in the same normalized folder scope becomes a visual suggestion. Shared logos/product cutouts alone, ambiguous alternatives and unreadable candidates do not establish a match. Visual suggestions require review confirmation before creation. Videos still require filename matching or manual pairing; a single video thumbnail cannot establish clip identity.
- The visual pass uses bounded Google Drive thumbnail downloads, at most 625 comparisons and a 35-second work budget. Unavailable/limited comparisons show a warning and leave files separate. Successful results are cached for five minutes in a bounded server-memory cache keyed by file IDs, paths, versions and dimensions. No additional AI provider is called. Originals uploaded to Meta are unchanged.
- Each selected file can occur only once. Image/video mixtures within one ad are rejected.
- Text suggestions aggregate the last 30 days for currently active ads, ranked by purchases and then spend. Where an ad contains multiple text variants, its performance is not attributable to a single variant; the UI states this explicitly.
- Up to five primary texts, headlines and descriptions are imported from an explicit source ad in the reference adset. All alternatives are editable and retained in the Meta creative; an optional individual primary text overrides the body alternatives for that ad only.

## Recovery and Safety

New jobs enter a durable, global FIFO queue. The browser only reads progress and sends explicit pause/resume/cancel commands. Closing the page or the browser does not stop a queued upload. `/uploads` lists jobs across partners, with partner/status filters, pagination, progress, errors, and links to the exact stored job and Meta adset. The Batch Check navigation also links to the filtered overview.

Migration `20260918135918_add_batch_upload_queue.sql` adds service-role-only queue controls, a lightweight overview view, singleton dispatcher lease, and a Supabase `pg_cron` job running every ten seconds. The database invokes `/api/cron/batches/uploads` through `pg_net` only when work is pending and no dispatcher is busy. Its dedicated random credential remains in Vault; the route verifies the hash with a restricted RPC. There are no browser keep-alive requests, external queue providers, or additional Vercel cron-frequency requirements.

The scheduler is installed with `batch_upload_runtime.enabled = false`. After the application deployment is ready, enable the singleton explicitly in the database and verify `scheduler_seen_at`, `heartbeat_at`, and a successful `net._http_response`. To stop dispatching for maintenance, set `enabled = false`; an already running step may finish. Never expose the worker token, Vault contents, or runtime hash through API responses. Existing jobs retain their status and require explicit resume to opt into the queue; completed/review/cancelled jobs cannot be resumed. Migration `20260918141559_reconcile_interrupted_batch_upload_controls.sql` finalizes pending pause/cancel controls after an interrupted worker's lease expires, without discarding saved progress or ambiguity markers.

Each invocation runs bounded persistent steps with a 30-second start budget, leaving time for the last Drive/Meta request inside the 120-second route limit. The global lease lasts 180 seconds, so a killed invocation cannot overlap a replacement. A second, atomic job lease checks FIFO order and ownership in the same transaction. Processing videos yield until the next scheduled invocation. Metadata persistence is also chunked into five ads per step. Failed/review jobs leave the runnable queue so later batches can proceed; only an explicit resume retries a failed job. Pausing/cancelling takes effect after the current step and never deletes Meta objects or turns off already activated ads.

An atomic database lease serializes concurrent workers. The unique account/folder/campaign key prevents duplicate jobs. A creation marker is persisted before each adset, creative or ad write. If Meta's response is uncertain or a worker dies before saving the returned ID, the job stops in `review`; it does not automatically repeat that write. Explicit Meta rejections and safe upload failures can be retried. Review states need operator investigation in Ads Manager; this version does not reconcile them automatically. Creation failures leave the adset paused. There is no automatic deletion.

Direct activation requires an already active campaign. The confirmed campaign budget is checked against live Meta data before job creation and again before the final activation. A paused campaign or changed budget stops activation. Activation updates use known object IDs and can be retried without duplication. Before enabling the adset, a durable activation marker is stored: if the response or persistence fails, the UI warns that the adset might already be active and incurring costs. Successful activation is not a guarantee of delivery; Meta review still applies.

Completing a job stores the resulting Meta IDs and marks the original Batch Check entry as found/paused or active, according to the chosen and completed action.

## Verification

```sh
npm test
npm run typecheck
npm run build
node scripts/batch-launch-smoke.mjs
node scripts/test-batch-upload-sql.mjs
```

The browser smoke test runs isolated Supabase and Meta API fixtures with `next dev --webpack`. It checks account presets, favorite persistence/isolation, cross-campaign templates, budgets, pairing, copy variants, interruption/reload/resume, cancelled/confirmed activation, queue filters/controls/read-only polling and desktop/mobile layout. It cannot create real Meta objects. Screenshots are written to the OS temporary directory, or `SMOKE_OUTPUT_DIR`. Dispatcher integration tests run complete multi-batch sequences without browser requests and verify one Meta write at a time. The SQL test runs lease, FIFO, control-race, recovery, credential and privilege assertions in a transaction that is always rolled back. Before applying the migration, pass `--with-schema` to include its DDL in the rollback transaction.

The initial implementation was verified against real read-only Drive data and Supabase queries, plus preset create/update/delete and denied anonymous access. A real Meta creation test is still required in a configured environment; no production ads were created during development.
