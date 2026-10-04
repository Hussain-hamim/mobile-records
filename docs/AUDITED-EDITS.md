# Editing and history

- Drafts can be edited or discarded. Discard waits for the active screen's autosave queue and removes its local photo attachments. Saved records cannot be deleted through the app/API.
- Current customer contact/address/occupation/workplace fields can be edited by staff. Identity fields require an owner. All profile edits require a reason and produce server-generated before/after, actor, and timestamp audit entries. Saving a transaction no longer implicitly rewrites the customer's saved profile.
- Owners correct saved records with immutable amendments. Owners can void a record after explicit confirmation and a reason. Original snapshots remain untouched. The details screen shows original data and a chronological correction history with differences. Correction reprints use their own snapshot; all reprints of a voided transaction include a void notice. Home totals exclude voids and use the latest data correction, ignoring photo events.
- Customer edits use expected versions and screen baselines. Amendments use a previous-amendment link; the server serializes each record's amendment chain and rejects stale changes. Existing cloud-only storage remains in place: reconnect to save. The legacy offline repository also queues these operation types, but this change does not reintroduce an offline signed-in mode.
- Existing fingerprint rules continue: staff can enroll empty slots; owners replace/remove with a reason. Audit displays include staff IDs and Kabul timestamps. Templates are not copied into transaction snapshots or photo audit metadata.

## Local photos

Every photo is reviewed before acceptance. Crop, rotate, reset, and zoom run locally. No retouch/erase/filter tools are provided. On a saved record, only owners can add, adjust, replace or remove an attachment; these actions require a reason. The server records a `photo` amendment containing only slot and action, alongside the existing record snapshot, before the local manifest changes. Images, file paths, and biometric templates are never included in that event.

Photo authorization and device-file writes cannot form one database transaction. A successful server authorization followed by a local storage failure may leave a **Photo change authorized** event without a completed local change. This is deliberately labeled authorization, not proof of file completion. The previous photo remains referenced when a replacement fails. Reopening the record refreshes the amendment chain before retrying.

Manifest v2 stores account/shop/record-scoped relative references for current display copies, sources, and historical copies. Legacy manifests and Android SAF folders remain supported. View adjustments preserve the current source. Replacement/removal retains superseded sources and display copies for 30 days; cleanup runs on the next load of that record's local manifest. Audit metadata remains. Retention is local to each account/device and is not a cloud backup. Original selected library photos are never deleted.

## Verification

Focused domain and PGlite database tests cover role enforcement, stale edits, audit spoofing, original snapshot preservation, immutable records, voids, idempotency and shop isolation. Native-adapter tests cover source retention, failed authorization/storage, legacy manifests, reloads and expired historical-copy cleanup. Browser demo checks cover profile edit/audit and voiding. A hosted transaction smoke test verifies staff contact edits and denied identity edits, then rolls back all synthetic fixtures.

Physical Android/iPhone checks still required: capture → crop/rotate → Use this image → reload; adjust/reset retains source; replacement/removal/history; denied permission/storage failure; Android selected-folder behavior. No new native dependency or rebuild is required.
