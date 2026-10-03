# Administrator-issued login codes

Users enter their phone number and an 8-digit code provided privately by their administrator. There is no user password, SMS, email delivery, or phone ownership check. Code generation requires internet, and login exchanges the code for a normal Supabase session. Sessions remain in Android secure storage. Business data loads from Supabase after reload; internet is required, and there is no local record database.

## Create accounts and regenerate codes now

On a trusted administrator workstation, set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` through environment variables (never `EXPO_PUBLIC_*`), then run:

```sh
node scripts/admin.mjs onboard +93700123456 "Example Mobile Shop"
node scripts/admin.mjs issue-code +93700123456
```

The result shows the phone, code, and expiry. Deliver the code privately. The CLI `reset` alias also issues a code for compatibility. Shop owners can create staff accounts and generate fresh codes from Settings → Staff access. They cannot generate codes for owners, platform administrators, or staff who also belong to another shop.

## Browser admin portal

Open `/admin` and sign in with a provisioned platform administrator's email and password. The portal supports shop creation, shop search, account inspection, code regeneration, audited suspension/restoration, and recent activity. See [portal administration](ADMIN-PORTAL.md).

Use the deployed `admin-accounts` function with the administrator's Supabase bearer token:

- `{"action":"onboard","phone":"+93700123456","shopName":"Example Mobile Shop"}` creates an owner and shop and returns `userId`, `shopId`, `phone`, `code`, `expiresAt`.
- `{"action":"issue-code","phone":"+93700123456"}` replaces that account's code and returns `phone`, `code`, `expiresAt`.

Only users explicitly listed as active in `private.platform_administrators` can use these operations through a user session. This allowlist is managed through trusted database administration; it cannot be edited by the app or by users editing their metadata. No user is automatically promoted to platform administrator. The browser never receives a service-role key.

`manage-account` retains shop-owner authorization for staff listing, invitation, revocation, and `issue-code` with a `shopId` and staff `userId`. The password action has been removed.

## Security and lifecycle

- Codes are generated with Web Crypto using rejection sampling, expire after one hour, and can be redeemed only once. Five wrong valid-format codes exhaust the issued code.
- A row lock serializes redemption; replay and simultaneous use cannot yield two successful redemptions. Regeneration replaces the old hash and resets the attempt count.
- An HMAC-SHA256 of phone plus code verifies redemption. A separate AES-256-GCM encrypted copy allows platform administrators to reopen a still-valid code; plaintext codes are never stored in the database. `LOGIN_CODE_PEPPER` may be configured as an Edge secret; otherwise the server-only service-role key is the HMAC key. Rotating it invalidates outstanding codes.
- Code tables and RPCs are service-role-only. Audit records retain issuance/redeem/lock timestamps and actor IDs, without codes, hashes, passwords, or session tokens.
- Existing accounts are migrated when a code is issued: their legacy password is replaced with an undisclosed random secret, and a UUID-based `@mobile-records.invalid` internal email alias is assigned. No mail is sent. This app-specific project uses that alias only to exchange a successful code redemption for a Supabase session through `generateLink` and `verifyOtp` on the server. The Email Auth provider must stay enabled; the Phone provider is unnecessary.
- The legacy `account_status.must_change_password` field is retained for schema compatibility, but acts as an activation gate. Successful code exchange clears it. New accounts remain gated until activation. There is no password-change screen.
- Issuing a new code invalidates the previous code, not existing device sessions. Membership revocation still blocks server access immediately. Offline access can only observe revocation on reconnect.
- If the response is lost after redemption, the code remains consumed. Ask an administrator for a new code; never make a used code reusable.
- Public signup should remain disabled in Supabase hosted Auth. No anonymous user gets shop membership or platform administration through this flow.

## Validation

Automated database tests cover expiry, five-attempt lockout, regeneration, replay/concurrent calls, phone binding, revoked membership, and RPC/table access. The deployed test-owner flow was also checked for actual session issuance, scoped shop access, rejection of reused/replaced codes, and rejection of unauthorized platform administration. Physical Android login remains a separate device check.
