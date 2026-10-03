# Admin portal

Open `/admin` on the running web app (currently `http://localhost:8082/admin`). Platform administrators use email/password sign-in; mobile shop users continue using phone numbers and administrator-issued one-time codes.

## Managing shops

- **Add a shop:** enter its name and the owner's international phone number. The server creates the shop/owner and returns a one-time code for private delivery.
- **Shops & accounts:** search shops, select one, and inspect its owner/staff access and activation state.
- **Generate code:** issue a new eight-digit code, valid for one hour. This invalidates the old code without signing out existing devices. Use **View current code** to reopen an unused, unexpired code after closing the dialog or reloading the page. Codes are rechecked before copying and while the dialog is open. Codes issued before recoverable storage was added need to be regenerated once.
- **Suspend / restore:** provide a reason before changing membership access. Changes are audited and server-enforced. Offline devices discover revoked access on reconnect.
- **Activity:** see recent code and access events. Codes and biometric data are excluded.

The portal presents operational counts and account metadata, not customer identity documents or fingerprint contents. Shop owners manage their staff through the mobile app.

## Authentication and deployment

Only active entries in `private.platform_administrators` authorize platform operations. An email/password account alone is insufficient. Create future administrators through trusted Supabase administration and add their Auth UUID to that allowlist; never use editable user metadata for authorization.

The requested initial administrator account is configured in hosted Auth. Its temporary password is not embedded in source or build output. Replace temporary credentials before public deployment.

The browser uses only the public project URL/publishable key and a separate session stored in `sessionStorage`. Reloads in the same tab preserve sign-in. Sign out when finished, especially on shared computers. All privileged work happens in the `admin-accounts` Edge Function with a verified user token and allowlist check. No service-role key enters the browser.

Apply `20261003114346_admin_portal_management.sql` after the account/login-code migrations and deploy the current `admin-accounts` function. Its new actions are `overview`, `list-shops`, `shop-detail`, and `set-access`; existing `onboard` and `issue-code` actions remain supported. Access changes require a boolean `active`, `shopId`, `userId`, and nonempty `reason`. SQL RPCs are restricted to the service role.

The temporary provisioning function used during setup has been replaced with an inert HTTP 410 handler and JWT gateway checks enabled.

Apply `20261003120044_recoverable_login_codes.sql` and deploy both `admin-accounts` and `manage-account` for recoverable codes. The new `view-code` action requires platform-administrator access. An AES-256-GCM encrypted copy is stored alongside the verification hash, using a domain-separated HKDF key derived from the server-only code secret. The ciphertext is bound to the account and phone. Consumed/locked codes are erased from the recoverable field; expired or revoked codes are never returned. Existing legacy hashes remain valid but cannot be recovered. Rotating the server secret requires issuing new codes.
