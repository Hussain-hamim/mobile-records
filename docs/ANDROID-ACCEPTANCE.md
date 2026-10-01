# Android pilot acceptance

Run on an EAS development build, not Expo Go. The browser demo cannot validate native camera, OCR, SQLCipher, system authentication, printing, or restart persistence.

1. Configure a staging Supabase project and onboard two shops with the administrator script. Add a staff account to each. Set permanent passwords on first sign-in.
2. Complete the shop profile. Create a purchase and a sale with two distinct valid IMEIs; search by either IMEI, phone, name, and ENID number. Reuse a customer, confirm details, and verify older records remain unchanged after editing the customer/shop.
3. Enable airplane mode. Force-stop/reopen, unlock with the device lock, resume a draft, save both transaction directions, and print. Restore internet and verify one server record per local record even after repeated sync and interrupted responses.
4. Edit a customer/shop on two devices. The second stale write must show a conflict with explicit server/local resolution; no changes may disappear. Revoke staff while offline, reconnect, and verify server reads and writes stop while the pending outbox is preserved.
5. Capture front/back of consented test ENIDs under clear light, glare, rotation, and blur. Record phone model, recognition time, per-field exact matches, and manual corrections. Test Pashto, Dari and English text. No accuracy claim is approved until these samples are reviewed. Handwriting remains manual.
6. Inspect app-private cache after acceptance, cancellation, background interruption, and force-stop/relaunch. There must be no remaining scan images after cleanup. Observe network traffic: no scan image or raw OCR text should be transmitted. Confirm Android backup/transfer exclusions and the generated manifest.
7. Deny camera permission, then permanently deny it; the app must offer manual entry and a settings link. Test invalid barcodes, two IMEIs, unknown TACs, duplicate purchase/sale history, and retake/crop/rotation.
8. Compare Pashto and Dari PDF shaping and both buyer/seller mappings to a clear official form. Test long addresses and names, PDF sharing, physical printing, and corrections. Until approved, retain the DRAFT banner and missing-declaration notice.
9. Verify the database file is unreadable without its SQLCipher key; verify keys and sessions are absent from ordinary files and logs. Sign out only after pending changes sync; reopen and ensure previous account data is not exposed.

Production release gates: source-form verification, consented ENID evaluation, device tests above, connected Supabase integration tests, and owner review of translations. EAS project/signing setup and Supabase deployment remain operator steps.
