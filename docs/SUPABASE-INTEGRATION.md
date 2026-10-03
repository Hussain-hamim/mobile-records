# Hosted Supabase integration

Project: `pzwwrbhgzqaygwrcxjto`  
API: `https://pzwwrbhgzqaygwrcxjto.supabase.co`  
Initial deployment verified: 2026-10-03.

## Deployed

- All nine repository migrations, including `20261003130510_cloud_record_storage.sql`, `20261003113354_admin_login_codes.sql`, `20261003114346_admin_portal_management.sql`, and both fingerprint migrations dated `20261003120000` and `20261003120001`.
- `manage-account`, `admin-accounts`, and `redeem-login-code` Edge Functions, each with its own authentication/authorization checks. See [login-code administration](LOGIN-CODES.md).
- Local `.env.local` contains the project URL and enabled publishable key only. It is gitignored. No administrative key is included in the app.
- Hosted migration versions were reconciled to the original local filenames after MCP deployment; future CLI deployments must inspect migration history and use a dry run first.

The hardening migration resets Supabase's broad default table grants to the app's required permissions. Anonymous clients have no table privileges. Authenticated users cannot truncate tables, edit memberships, delete finalized records, or bypass the existing shop policies. Service-role account management stays server-side.

## Verified

- TypeScript, lint, all 99 tests, and Android bundle export passed. The cloud-storage tests cover atomic purchases/sales, replay, failed-save rollback, draft privacy/revocation, and fresh-session template loading.
- Hosted SQL smoke test exercised two shops under the `authenticated` role: customer isolation, denied cross-shop writes, idempotent operation replay, and immediate loss of access after membership revocation. All fixtures were rolled back; no test users, shops, customers, or transactions remain.
- Account-management endpoint rejects unauthenticated requests.
- The private login-code, audit, platform-administrator, and OCR quota tables intentionally have no client RLS policies or grants; they are backend-only. See [Supabase's informational notice](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy). Hosted Auth also reports [leaked-password protection disabled](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); this setting is unchanged. The app no longer accepts user passwords and replaces legacy passwords with undisclosed random values when issuing a code.
- Missing foreign-key indexes were added. Remaining [unused-index notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index) are expected for this newly created database.

## Account flow

The phone/password UI has been replaced with administrator-issued one-time codes. Phone authentication no longer needs to be enabled in Supabase; the server exchanges the redeemed code through Supabase's email token mechanism without sending any message. Public signup still needs to be disabled in hosted settings before production use.

The test owner is `+12025550123` in `Test Mobile Shop`. No password or active code is stored in this repository. The former temporary password has been invalidated. A fresh code must be issued after logout, code consumption, expiry, or five wrong attempts.

Live tests verified a successful code-to-session exchange, scoped shop access, regeneration/replay rejection, staff-management access, and denial of platform operations to ordinary shop users. Test sessions were explicitly signed out afterward. Physical Android sign-in and online session/data restoration with this new flow remain device acceptance checks.

The browser administration portal is available at `/admin`. The requested `admin@radefy.com` account is provisioned and explicitly allowlisted; its password is not stored in the repository. Login, overview, shop listing/details/search, and anonymous-access rejection were checked against the deployed function. See [ADMIN-PORTAL.md](ADMIN-PORTAL.md). Demo mode remains local and is not uploaded.

## Document scanning

The private OCR usage schema exists as part of the checked-in migrations, but `read-tazkira` was not deployed or enabled during this integration. No Google credentials were added and no ID images were uploaded. Local MRZ and fingerprint reading remain available independently of this backend deployment.

## Direct cloud storage (2026-10-03)

The app now uses Supabase for records, customers, fingerprint templates, shop profiles, amendments and drafts, without opening the legacy local record vault. The deployed `save_cloud_changes` RPC commits each save atomically; `transaction_drafts` has four author-and-shop-scoped RLS policies and no anonymous privileges. Internet is required. Demo changes are temporary memory and reset on reload. Legacy encrypted files/keys remain untouched; previously unsynced data was not uploaded or discarded.

The deployed grants and RLS configuration were inspected. Security advisors introduced no new findings; the existing backend-only table notices and Auth password-protection warning above remain unchanged. No live account codes were generated or consumed for this change. Xiaomi device verification remains pending because ADB had no connected device.
