# Local record photos

Record creation and record details offer two slots: buyer/seller (from the shop’s transaction direction) and Tazkira front. On Android and iPhone, tap a tile to take a photo, select one through the system picker, preview, replace, or remove it. The installed Expo SDK 57 image-picker, image-manipulator, filesystem and SecureStore modules support iPhone Expo Go; this change needs no custom iOS native module. Browser previews cannot persist attachments. Thumbnail frames are 156 points high and use contain scaling, so the full saved image is visible. Expanded previews use a portrait frame for customer photos and a landscape card frame for Tazkiras, also without cropping.

Customer photos (seller for purchases, buyer for sales) remain temporary after capture or library selection until staff taps **Use this image**. **Retake** lets staff replace the pending image; closing the photo screen discards it and keeps any previously saved attachment.

Tazkira camera capture uses a shaded overlay and four corner brackets. Only the card-shaped guide area is cropped from the processed camera photo; a review screen offers Retake or Use photo before the attachment is saved. The crop maps the measured preview back to photo pixels, including aspect-fill offsets, and limits large card copies to 1600 pixels wide without upscaling smaller captures. This is framing, not automatic card-edge detection or perspective correction. Library selections retain their full image. Capture originals and unused review copies are cleared from app cache.

## Storage and privacy

Photos are optional retained attachments, separate from temporary scanning captures. Scan cleanup does not delete them. The app never sends these attachments or their paths to Supabase or OCR services and never includes them in printed forms. Business records retain their existing cloud-backed workflow.

Default copies live under `Documents/record-photos/<shop>.<account>.<record>/`. SecureStore holds a versioned manifest with relative document paths, resolved against the current Documents directory on load. Older absolute app-private paths are rebased to that directory; Android external-folder URIs retain their original locations. References are validated against the exact account/shop/record and photo slot. Legacy back-photo references remain intact, but the back-photo slot is no longer shown. Other signed-in accounts cannot see these attachments.

Photos are decoded and saved as JPEG through ImageManipulator, which normalizes image orientation. The original library item is never modified or removed. A new copy must finish writing before its manifest is committed; draft replacements can then remove superseded copies. Saved-record replacements/removals instead retain superseded photos locally for 30 days; cleanup runs when that record is next opened. View adjustments keep their source photo. Failed writes or manifest commits retain the previous attachment. Temporary picker and normalization copies are cleaned up. Missing files can be replaced or removed from the slot.

Android Settings → Photos on this phone retains the internal-storage/SD-card folder picker. Cloud document providers are rejected. New photo sets use the selected destination; existing sets keep their original folder. Android retains the granted folder permission across restarts. Re-select the folder if its permission is revoked. Errors do not silently redirect storage.

On iPhone, Settings shows the private Documents location without a folder-selection button. App-private documents may participate in iPhone device backups; iOS backup exclusion is **not implemented**. Photos saved inside Expo Go do **not** automatically transfer to a future standalone app. Dedicated iOS backup policy and any data-transfer workflow remain release-preparation tasks. Android private storage uses the existing backup exclusions; shared folders may be accessible or backed up by other apps.

Uninstalling the app or Expo Go can remove private photos. Another staff device does not download them. Demo records are temporary: use a signed-in account and a saved cloud record to test persistence across reloads.

Camera denial offers phone settings or selection from the device. The system library picker does not require full-library permission, so limited iOS access is supported. Cancellation changes nothing. Unavailable images, restricted access and storage failures display retry guidance.

## IMEI framing

Photo capture converts the visible bracket through the center-filled preview into full-resolution image coordinates, then crops before OCR. Rotation and further cropping operate only on that cropped image. Automatic barcode scanning captures one image at a time, crops it to the bracket, and decodes only that crop. It does not use full-frame barcode callbacks or require corner metadata. Crops are limited to 1800 pixels on the longest edge; the original and unsuccessful crops are deleted promptly. Capture/decoding stops for review, backgrounding, or closing. For printed digits, **Read IMEI in frame** tries barcodes and then text recognition on the same crop. There is no full-image fallback. Physical throughput and recognition rates remain to be measured on the Xiaomi.

## Validation

Automated tests exercise the real photo service with mocked native adapters on iOS and Android: all slots, reload, original preservation, replacement/removal, missing files, disk and manifest failures, cancellation, permission errors, account isolation, and Android selected-folder/default-folder behavior. Domain tests cover relative paths, changed iOS container roots, legacy manifests, external content URIs and invalid/cross-scope references. Privacy checks ensure attachments stay outside cloud record models and scanning cleanup. These tests do not validate native camera, image codecs or real storage providers.

Physical-device checks remain pending:

- On a signed-in **iPhone with Expo Go**, test both slots using camera and library, HEIC/JPEG images, portrait/landscape and EXIF-rotated photos. Preview, replace, remove, save a record, reload Expo Go, and reopen it.
- Check denied camera permission, limited/restricted library access, picker cancellation, unavailable files, low storage, and switching between accounts/shops. Confirm a failed replacement retains the old photo.
- On **Android**, repeat camera/library/reload checks for private storage and a selected folder; revoke/regrant folder permission and reset the default. Check that old records still use their original folder.

Crop geometry tests cover portrait/landscape sensor images, different preview sizes, bounds and invalid dimensions. Physical checks must also compare all four card corners in the live guide against the saved crop on both platforms, plus retake, cancellation and background/resume. No physical iPhone or Android result is claimed for this update. OCR/MRZ/fingerprint support on iPhone and App Store preparation remain outside this change.

Saved-record edits require owner authorization and a reason. Photo change authorization metadata is synced, but images and paths remain local. See [Audited edits](AUDITED-EDITS.md) for conflict handling, retention, and the authorization/file-commit boundary.
