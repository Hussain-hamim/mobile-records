# Web admin record review

Open `/admin`, sign in as a platform administrator, then choose a shop in **Shops & accounts**.

- **View records** under an account lists records created by that account in the selected shop. Suspended accounts remain reviewable.
- **All shop records** lists records from every account in that shop, including historical accounts.
- Purchase/sale filters use the shop's perspective. Lists load 20 records per page; dates use Kabul time.
- **View & print** opens the saved customer, phone and shop snapshots and the amendment history.
- **Record photos** shows the current uploaded customer and Tazkira front images; click either image to enlarge it. Refresh renews expired links. Local-only photos must first be uploaded from the phone.
- Select the original or a correction, choose Pashto/Dari/English and Solar Hijri/Gregorian dates, then **Print / Save PDF**. The browser's print dialog provides PDF saving.
- Photo amendments do not replace corrected transaction data. Every version of a voided record prints a VOIDED annotation.

The existing form remains marked as a draft. Admin printouts currently omit photo attachments. Printing reads transaction snapshots, never current customer/shop profiles.

## Access and scope

The `list-records` and `record-detail` actions live behind the existing platform-administrator gate in `admin-accounts`. A normal shop session cannot use these actions. Every query requires a shop UUID, optionally restricts `created_by` to an account UUID, and checks the same scope again when opening a record. Amendment reads are restricted to the selected shop and record. Photo reads verify the same record/shop/account scope and sign only current attachments with 60-second private read URLs. Removed, pending, retained and purged photos are excluded. No storage credentials, biometric templates or authentication credentials are returned. The admin portal keeps its own session; no mobile-account attachment service is invoked.

No mobile screens, database policies or stored records are changed by this feature. Backend deployment requires the updated `admin-accounts/index.ts` and `_shared/admin-records.ts` alongside its existing shared dependencies.

## Verification

Run `node --import tsx --test tests/admin-records.test.ts tests/admin-portal.test.ts`, `npm run lint`, and `npm run typecheck`.

Focused tests cover scope validation, account/shop query restrictions, pagination, missing records, full amendment pagination, anonymous/non-admin rejection, and original/corrected/void print semantics. Signed-in browser inspection and the actual printer/PDF dialog remain a manual check.
