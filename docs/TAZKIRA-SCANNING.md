# MRZ scanning: offline first, optional online retry

## Using the scanner

1. Open **Scan e-ID MRZ**. Place all three MRZ lines from the back of the e-Tazkira inside the clear frame, including every `<` character. Hold steady and avoid glare; the light toggle is optional.
2. Tap **Capture & read MRZ**. The image is cropped to the guide before recognition and the full camera photo is deleted. Every local pass and any optional online retry uses only that selected MRZ image.
3. Review the name, full ID number, gender and nationality. All MRZ checks must pass before fields are suggested. Names are the Latin text encoded in the MRZ. Numbers always use English digits. No birth-date century, relatives or addresses are inferred.
4. Rotate, trim, retake or retry offline as needed. Manual edits survive a retry on the same image; retaking starts a new scan. **Enter details manually** returns to the record form.
5. Accept reviewed fields or close. Temporary camera and crop files are removed; startup cleans force-stop leftovers.

The full-card printed reader, four-corner editor and guided front/back flow are no longer used. Existing saved person fields remain compatible and can still be entered manually in the main form.

If configured later, **Try MRZ online (optional)** appears below the offline retry. Its confirmation explains that only the current MRZ crop goes to Google. Online text passes the same strict local MRZ parser; arbitrary printed details and unchecked IDs never become suggestions. There are no automatic uploads. The button and setup notices are hidden when online reading is unavailable.

## Online status: disabled by default

No Supabase project or Google credentials are configured in this workspace. Online reading remains optional and disabled by default. The implementation and migration are ready for later setup; nothing has been deployed to a remote project.

The app checks the authenticated backend's `status` action without sending an image. Missing configuration, demo mode, failed authentication or an unavailable network hide the optional button. Reopen the scanner after configuration/network changes to refresh availability.

### Configure later

1. Create/use a **dedicated** Google Cloud project, enable billing and the **Cloud Vision API**. Create an API key restricted to Cloud Vision. Keep it exclusively in backend secrets. Do not put it in `EXPO_PUBLIC_*`, the APK, source control, chat, or app settings.
2. Configure `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in the app environment. Never use a service-role key in the app.
3. Link the correct Supabase project and apply migrations, including `20261003101348_tazkira_ocr_usage.sql`, in migration order. Review existing pending migrations before pushing to an existing project. The quota table contains only request ID, user ID, shop ID and timestamp; no image, OCR text, ID number or image fingerprint.
4. Set Edge Function secrets `GOOGLE_VISION_API_KEY` and `TAZKIRA_ONLINE_ENABLED=false`. Supabase supplies `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the hosted runtime. Prefer the dashboard's secrets editor so values do not enter shell history.
5. Deploy `read-tazkira`. Its `verify_jwt=false` setting is intentional: the handler checks every bearer token with `auth.getUser`, rejects anonymous users, and checks active shop membership plus the password-change requirement. The publishable key alone grants no access.
6. Run the endpoint checks below using synthetic images. Only then change `TAZKIRA_ONLINE_ENABLED=true` and reopen the scanner. Disable that flag to turn online reading off without rebuilding the app.

Google charges per image/feature. Use only `DOCUMENT_TEXT_DETECTION`; each MRZ retry counts as one read. The current allowance is 1,000 units monthly. The backend conservatively stops at **900 reserved requests in any rolling 32 days**, shared across every shop and device using this backend, and limits each user to **10 per minute**. Failed/disconnected provider calls count too. A unique request ID cannot be dispatched twice. Reservations are serialized inside Postgres before the network call. Other uses of the same Google project are not covered by this counter; this is why a dedicated project is required. Hosting and other Google resources have their own pricing.

Reference: [Vision pricing](https://cloud.google.com/vision/pricing), [language support](https://docs.cloud.google.com/vision/docs/languages), [data usage](https://docs.cloud.google.com/vision/docs/data-usage). The current scanner reads the Latin MRZ code, not Dari/Pashto printed labels.

### API and retention

`POST /functions/v1/read-tazkira` requires a user bearer token. Status: `{action:"status",shopId}` → `{enabled:boolean}`. Read: `{action:"read",mode:"mrz",shopId,requestId,language:"en",image}` where `image` is raw JPEG base64 and `mode` must be `mrz`. The provider uses English hints for the Latin MRZ alphabet regardless of app language.

The reply is `{document:{text,width,height,words:[{text,confidence,box,line}]}}`; boxes are `[left,top,right,bottom]` pixel coordinates and confidence is 0–100. Only its MRZ text is parsed, in memory, with the same checksum-validating parser as native MRZ OCR. This intermediate result never enters saved customer/transaction schemas.

Decoded uploads are limited to 4 MiB; request bodies to 6 MiB. Only inline JPEGs are accepted, never arbitrary file paths/URLs. Provider timeout is 20 seconds; the client aborts after 25 seconds and supports explicit cancellation. Cancellation cannot undo a request Google already received, so its reservation remains consumed. Images/text are not stored in Supabase Storage, tables or application logs. Responses use `Cache-Control: no-store`. Google states synchronous Vision image data is processed in memory; provider request metadata may be retained under its terms.

## Verification and acceptance

Run `npm run lint`, `npm run typecheck`, `npm test`, and `deno check supabase/functions/read-tazkira/index.ts` separately (app TypeScript excludes Edge Functions).

Automated checks cover MRZ geometry and check digits, English digits, cancellation, the scan-file race, backend authentication, disabled configuration, malformed/oversized requests, rejection of full-card requests, duplicates, provider failures, timeout, SQL permissions and concurrent quota boundaries.

The earlier full-card synthetic tests are historical and do not establish current MRZ accuracy. Before production, use consented real electronic cards and record only aggregate exact MRZ field matches, no-result count and elapsed time. Include glare, tilt, missing edges, rotation, retake, cancellation and all three UI languages. Verify airplane-mode operation and private-cache cleanup after accept/cancel/restart. Never commit identity samples. Live Google testing remains pending configuration; no real identity images were uploaded.
