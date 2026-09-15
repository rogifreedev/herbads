# Batch Check: Create on Meta

The action on a missing Drive batch opens `/clients/[clientId]/batches/create?folderId=...`.
One batch creates one adset in an existing campaign. Every selected motif becomes one ad.
The adset and every ad are initially created with `status: PAUSED`. Paused is the default final state. Users may explicitly choose activation and confirm the account, campaign and budget in a separate dialog. Only after all media, creatives and ads exist are the new ads enabled and, last, their new adset. The existing campaign is never modified or activated.

## Configuration

- `GOOGLE_DRIVE_API_KEY`: the same public/shared Drive folders used by Batch Check.
- `META_SYSTEM_USER_ACCESS_TOKEN`: server-only token with `ads_management` and access to the selected account and Facebook page.
- `META_API_VERSION`: optional Graph version override; batch creation defaults to `v25.0`.
- Supabase migration `20260915193915_add_batch_meta_launches.sql` adds account presets, resumable jobs and the copy statistics function. Tables and RPC are service-role only; API routes use the existing employee authentication middleware and validate account/client ownership.
- Migration `20260915200639_add_batch_adset_favorites.sql` adds account-scoped favorite adset references, also service-role only. Favoriting never changes an object on Meta. Favorites refer to current source adsets rather than stale configuration snapshots.

Account presets store daily budget, countries and language IDs. Existing active/paused adsets from any campaign in the same ad account can be selected as templates and favorited. Selecting a template or explicitly reapplying it copies its daily budget, countries and language IDs and clears the selected account preset; selecting an account preset then overrides those three settings. Changing the destination campaign preserves a manually selected source template.

Adset budget is omitted for campaigns with campaign-level budgets. Other settings, including pixel, conversion event, age, placements, bidding and DSA identity, come from the selected source adset. Geographic details and exclusions are retained when the source countries are unchanged. Country overrides replace geography explicitly. Unsupported app, catalog, messaging and dynamic-creative templates fail validation before creation. Expired schedules, source status and source name are not copied.

## Media and Text

- PNG/JPEG images up to 30 MiB; MP4/QuickTime videos up to 4 GiB.
- Up to 100 media files, 150 folders and 8 nested levels per batch. Limits fail explicitly; unsupported files are listed separately.
- Matching uses normalized relative paths/motif names and dimensions. One unambiguous 1:1 or 4:5 feed asset plus one 9:16 asset becomes one placement-customized creative. It does not visually recognize differently named images. Ambiguous or differently numbered exports stay separate and can be paired in the preview.
- Each selected file can occur only once. Image/video mixtures within one ad are rejected.
- Text suggestions aggregate the last 30 days for currently active ads, ranked by purchases and then spend. Where an ad contains multiple text variants, its performance is not attributable to a single variant; the UI states this explicitly.
- One editable batch text is used by default, with optional individual primary text per ad.

## Recovery and Safety

The browser advances one persistent server step at a time. Videos use resumable, bounded Drive-to-Meta chunks and are processed before creative creation. Reloading/reopening the batch displays the last job; the user resumes it explicitly. Closing the browser does not run the remaining job in the background.

An atomic database lease serializes concurrent workers. The unique account/folder/campaign key prevents duplicate jobs. A creation marker is persisted before each adset, creative or ad write. If Meta's response is uncertain or a worker dies before saving the returned ID, the job stops in `review`; it does not automatically repeat that write. Explicit Meta rejections and safe upload failures can be retried. Review states need operator investigation in Ads Manager; this version does not reconcile them automatically. Creation failures leave the adset paused. There is no automatic deletion.

Direct activation requires an already active campaign. The confirmed campaign budget is checked against live Meta data before job creation and again before the final activation. A paused campaign or changed budget stops activation. Activation updates use known object IDs and can be retried without duplication. Before enabling the adset, a durable activation marker is stored: if the response or persistence fails, the UI warns that the adset might already be active and incurring costs. Successful activation is not a guarantee of delivery; Meta review still applies.

Completing a job stores the resulting Meta IDs and marks the original Batch Check entry as found/paused or active, according to the chosen and completed action.

## Verification

```sh
npm test
npm run typecheck
npm run build
node scripts/batch-launch-smoke.mjs
```

The browser smoke test runs isolated Supabase and Meta API fixtures with `next dev --webpack`. It checks account presets, favorite persistence/isolation, cross-campaign templates, budgets, pairing, per-ad text, interruption/reload/resume, cancelled/confirmed activation and desktop/mobile layout. It cannot create real Meta objects. Screenshots are written to the OS temporary directory, or `SMOKE_OUTPUT_DIR`.

The initial implementation was verified against real read-only Drive data and Supabase queries, plus preset create/update/delete and denied anonymous access. A real Meta creation test is still required in a configured environment; no production ads were created during development.
