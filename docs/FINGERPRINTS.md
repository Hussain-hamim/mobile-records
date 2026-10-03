# Fingerprint enrollment and lookup

The Android development build uses the bundled ZKTeco SDK locally. The reader must be attached to the **phone**, through an OTG adapter. Both `1b55:0120` and `1b55:0124` are supported. Settings → Check fingerprint reader opens the same hardware session used for capture; permission, missing hardware, unsupported USB devices, and startup failures have separate messages.

Home, Customers and Records offer labelled lookup. A unique customer match opens their profile and complete loaded transaction history, even when it is empty. New record lookup fills customer details without replacing phone information or bypassing staff confirmation. Unknown and ambiguous scans do not navigate or create customers.

Each customer has up to two entries (primary and optional backup). Enrollment checks three impressions, merges them, and requires a fourth verification. Duplicate matches offer the existing customer. All comparisons use the SDK's local score threshold of 70; this is not a percentage or an independently measured accuracy guarantee. Multiple qualifying customer IDs are treated as ambiguous.

The bundled reader returns zero on idle/no-image callbacks. Enrollment requires 400 ms of consecutive zero callbacks, no more than 250 ms apart, before accepting the next impression. Image callbacks, nonzero errors and failed extraction reset the interval. One successful image permits only one extraction. Zero can also mean unsuccessful capture; this debounce must be validated with held and difficult fingers on physical hardware. It is not a hardware-certified finger-presence signal.

Only owners may replace/remove an existing entry, with a reason. Staff can fill empty slots. The additive migration `20261003120001_fingerprint_profiles.sql` backfills the previous template into a primary entry, enforces roles through a database trigger, maintains audit metadata without old template contents, and prevents legacy updates from restoring removed templates. Profile changes never alter finalized record snapshots. Fingerprint enrollment is optional. Purchases and sales can be saved without a fingerprint or skip reason; customers without templates remain Not enrolled. Existing skip reasons retain their staff/time metadata, and enrollment can be added later from the customer profile.

## Verification status (2026-10-03)

- 54 automated tests passed, including capture-gate Java tests, legacy conversion, both entry IDs, owner/staff rules, skip metadata, stale drafts, PostgreSQL trigger enforcement and shop isolation.
- TypeScript and Expo lint passed. Android arm64 development APK built and installed on Xiaomi 2109119DG.
- Android USB inspection confirmed ZK9500 enumeration and app permission. Idle capture status was observed as zero. Permission-dialog pausing and unplug/retry handling were corrected.
- Browser demo verified profile → purchase → skip reason → save → View customer, preserving customer details and displaying both records in history. Browser cannot validate USB or biometric matching.
- Hosted migration deployment and connected sync validation remain pending a configured Supabase project.
- Physical enrollment/lookup validation and the following benchmark are **pending**. No measured reliability claim is made yet.

## Physical acceptance matrix

Use consenting testers and anonymous tester labels. Do not retain raw fingerprints or templates in test reports.

| Test | Expected result | Status |
|---|---|---|
| Three impressions + verification | Each impression requires a lift; only verified enrollment is saved | Pending |
| Hold the finger in place | Progress advances at most once | Pending |
| Different finger / failed extraction | No false progress; reposition message | Pending |
| Duplicate enrollment | Existing customer's profile offered | Pending |
| Primary and backup lookup | Same correct customer; no duplicate navigation | Pending |
| Unknown / ambiguous fingerprint | Manual search, retry or new record offered; no automatic profile | Pending |
| Deny/accept USB permission | Actionable error or successful connection; permission prompt does not cancel itself | Pending |
| Unplug, reconnect, repeated retries | Session released; retry works without restarting the app | Pending |
| Close, background, logout, shop change | No late result; no cross-shop templates remain loaded | Pending |
| Online enrollment and restart | Supabase persistence, local matching after loading, visible version conflicts | Automated storage checks passed; device pending |
| Owner remove/replace, staff add | UI and server apply matching permissions; no old template in audit | Automated server checks passed; device pending |

Run at least 20 attempts per enrolled finger across several testers, plus unregistered-finger attempts. Record each attempt's anonymous tester label, finger slot, expected-match yes/no, correct/no-match/wrong-match outcome, latency in milliseconds, and lighting/contact or reader interruption notes. Calculate correct matches / registered attempts and latency median/p95 from those observations. Investigate every wrong-customer result before pilot delivery.

## Supabase persistence (current)

Signed-in customer profiles and transaction drafts now save directly to Supabase. The save must succeed before enrollment is accepted by the form. Internet is required to save and to reload profiles; matching remains local using the active shop's loaded templates. Raw images are never persisted. Both primary and backup entries use the existing shop-scoped customer representation and permission rules.

Demo mode is temporary memory on both Android and web and resets on reload. Earlier builds used encrypted SQLite. Those databases and their keys are left untouched for recovery, but the application no longer opens or writes them. Previously unsynced demo/local enrollments are not automatically imported into Supabase.
