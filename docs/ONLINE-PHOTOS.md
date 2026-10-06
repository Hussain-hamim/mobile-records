# Optional private online photos

R2 holds immutable JPEG attachments; Supabase holds authorization, quotas, photo versions and audit metadata. Transaction snapshots never contain images, object keys or signed URLs. Every shop starts disabled. The admin portal approves an owner request with an explicit allowance; disabling keeps existing online photos readable and billable.

## Deployment

1. Enable R2 in the verified Cloudflare account. Create separate `radefy-record-photos-production` and `radefy-record-photos-staging` buckets with Standard storage. Keep r2.dev and custom-domain public access disabled.
2. Replace the credentials previously shared in chat. Create separate **Object Read & Write** credentials scoped to each bucket. Do not use account-wide credentials in the service. Store production values only in Supabase Edge Function secrets: `R2_ACCOUNT_ID`, `R2_PHOTO_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`. Never prefix these with `EXPO_PUBLIC_`.
3. Apply the additive `online_record_photos` migration. Deploy `record-photos`, `photo-cleanup`, and the updated `admin-accounts` function with their configured JWT settings. Each API validates the user or its dedicated cleanup secret itself.
4. Generate a separate random `PHOTO_CLEANUP_SECRET`. Store it in Edge Function secrets and Supabase Vault as `photo_cleanup_secret`; store the project's HTTPS URL in Vault as `photo_project_url`. Execute `supabase/ops/schedule-photo-cleanup.sql`. Monitor cron runs and non-2xx cleanup responses. Do not put literal secrets in SQL files or shell history.
5. Configure bucket CORS for GET/HEAD from the actual web app origins. Development uses `http://localhost:8081` and `http://localhost:8082`. Add the verified production origin before browser launch. CORS does not make a bucket public.
6. Verify synthetic uploads against staging, then explicitly enable one pilot shop. No existing shop is enabled by a migration. Admin enablement fails if R2 secrets have not been configured.

Use a separate Supabase staging project with the staging bucket for end-to-end tests. Never point production photo metadata at staging objects.

## Upload lifecycle

Accepted `person` and `idFront` images are copied to an app-private journal scoped by account and shop. Unedited source images, temporary MRZ captures, OCR output and fingerprint data are excluded. Preview files are generated from the accepted image. Originals must be JPEG and at most 10 MiB; previews are capped at 512 KiB. Document originals are not silently reduced to fit.

A draft can stage files, but the server refuses upload access until its transaction exists. Record saving succeeds independently of photo upload. Retry runs in the foreground on open, reconnect and a bounded timer, with at most two active jobs. Android termination stops uploads until reopening. Completed files remain in the existing local photo store. An explicit owner backfill walks records in pages, reads only this account/shop's local manifests, and skips missing files and cloud versions/tombstones.

Reservations atomically include original and preview bytes. A five-minute signed PUT binds Content-Length, Content-MD5, JPEG content type and `If-None-Match: *`. Completion checks both objects' size, checksum/ETag and JPEG signature, and rechecks current membership, entitlement and revision. Replayed requests cannot count bytes twice. A stale replacement fails instead of replacing the latest photo. Owners must supply a reason for edits; staff can upload only initial images for records they created.

Downloads are object-specific one-minute URLs; they are fetched in memory and never persisted in the journal or transaction. Native downloads use a private cache, validated by size and MD5. Browser images use ephemeral data URLs for rendering/printing. Each record loads its own metadata, not the full shop's attachment collection.

## Retention and usage

Replacement/removal retains the prior object for 30 days; retained bytes count toward the allowance. Expired pending reservations are cancelled after 24 hours and released only after objects have been deleted. Cleanup is idempotent. Bounded reconciliation compares counters with version metadata under the same shop lock as writes. Audit metadata remains after purge.

Current files have no deletion deadline when uploads are disabled. Already-issued access links remain valid until their short expiry. Local files and copies explicitly exported by a user cannot be remotely revoked. Local originals continue following the existing folder/retention behavior.

## Validation and pilot gates

- Local PGlite tests cover RLS, service-only writes, administrator entitlement control, staff restrictions, idempotency, stale revisions, revocation, quotas, retention and reconciliation.
- Native-adapter journal tests cover restart, interrupted snapshots, account separation and cancellation. Deno tests cover signature bindings and object verification; these are not substitutes for real R2 integration tests.
- Before enabling a client shop: verify real R2 create-only retries, expiry, corrupt/oversized payloads, quota contention across devices, disabling during upload, second-device/browser viewing and printing, and cleanup.
- Test on physical Android with network interruption, force stop/reopen, missing local files, replacement conflicts, backgrounding and logout. Check APK/browser artifacts and service logs for secrets/signed URLs.
- Select the pilot shop and quota explicitly; monitor failures and billed storage before wider rollout.

## Current deployment status — 2026-10-06

- Cloudflare account verified through OAuth. R2 enabled; both named buckets created in Standard storage with public r2.dev access disabled. GET/HEAD CORS configured for the two localhost origins.
- Migration `20261006074420_online_record_photos` and the three Edge Functions deployed to `pzwwrbhgzqaygwrcxjto`. Deployed RLS/service-only RPC privileges verified; zero shops enabled. Admin UI checked against the deployed API.
- All four R2 Edge Function secrets and `PHOTO_CLEANUP_SECRET` are installed and verified against the private provisioning files. The cleanup secret matches Vault; the live cleanup endpoint returned HTTP 200 with zero failures. The `record-photo-reconciliation` cron job is active every 15 minutes. Secret entry was completed through the dashboard because Supabase OAuth does not support the required secret-write scope.
- Live R2 tests passed for original/preview uploads, create-only overwrite rejection, checksum and JPEG verification, corrupt-byte rejection, expired-link rejection, authenticated downloads, localhost CORS, anonymous-access denial and deletion of the synthetic test objects.
- The user explicitly approved proceeding with the current credential scope: it can also access the staging bucket. Production/staging credential isolation is therefore not in place; narrow the credentials before wider rollout. The previously shared credentials still need revoking in Cloudflare.
- TypeScript and lint pass. 163 Node tests and two Deno R2 tests pass. Web export succeeds; no server-secret/signing markers found in its JavaScript/HTML/JSON.
- Complete app upload tests, Android device checks, production web-origin CORS, staging credentials/project configuration and the explicitly selected pilot remain rollout gates.
