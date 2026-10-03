# Afghan e-ID recognition internals

The scanner reads only the three MRZ lines on the back of an Afghan electronic Tazkira. Capture crops to the visible MRZ guide and automatically runs the offline reader. There is no full-card printed-details mode, four-corner editor or front/back wizard. An optional, explicitly confirmed online MRZ retry can be configured later; it remains disabled in this workspace. See [TAZKIRA-SCANNING.md](TAZKIRA-SCANNING.md) for usage and setup.

## Data and validation

`src/domain/mrz.ts` implements the TD1 three-line/30-character structure and 7/3/1 check digits described by [ICAO Doc 9303 Part 3](https://www.icao.int/sites/default/files/publications/DocSeries/9303_p3_cons_en.pdf) and [Part 5](https://www.icao.int/sites/default/files/publications/DocSeries/9303_p5_cons_en.pdf). Birth, expiry, document and composite checks must all pass; calendar month/day and character classes are checked. Century, age, validity and identity are not inferred.

The Afghan split-number mapping is based on the card supplied for this task: eight digits followed by a filler in the document-number field, its check digit, and five digits followed by ten fillers in the first optional-data field. The composite check covers those five digits. The resulting 13 digits are displayed as `0000-0000-00000`, preserving leading zeroes. This is an observed country-specific layout, not a claim that all Afghan issuances use it. Standard TD1 extended document numbers are also accepted when they yield a checksum-valid 13-digit number. Other layouts remain manual rather than yielding a truncated ID.

MRZ suggests only the name, full ID number, gender (`M`/`F`, omitted if unspecified), and nationality (`AFG`). Names have no check digit, use Latin transliteration and can be shortened. Birth-date century, relatives, addresses and missing characters are never inferred. Other person fields remain available for manual entry in the record form.

Online results use this same parser and must pass every check; no general printed-text fallback is used. Staff review all suggested values before applying. Retrying the same crop preserves edited fields; retaking clears the prior scan.

## Native lifecycle

The Android build must include `RecordOcr.readMrzPass` and the bundled MRZ model. The narrow guide targets all three MRZ lines, with excluded pixels dimmed. Preview coordinates are mapped back through the camera's FILL_CENTER transform at shutter time. The selected pixels are saved before deleting the original image; the asynchronous file move is always awaited. Rotation, trimming, offline passes and optional online retry all use this selected crop, never the full camera image. Missing preview geometry fails capture safely.

The first pass uses the fast integer MRZ model with block segmentation. If validation fails, the second pass estimates and corrects up to 8 degrees of tilt and uses Sauvola adaptive thresholding; the final pass tries automatic layout within the selected area. No pass widens the selection. Processing stops immediately when checks pass or the scanner closes. Checksums are not weakened and missing characters are not guessed.

The packaged model is [DoubangoTelecom/tesseractMRZ](https://github.com/DoubangoTelecom/tesseractMRZ), pinned to `1e7adfecda5f3c9ae1fb12cf6b4b8c3958c63e46` with SHA-256 in the asset manifest. Its BSD-3-Clause notice is in `assets/licenses/MRZ-LICENSE`. English remains the separate IMEI model. Model installation copies assets from the APK into no-backup storage; no connection is needed on first use.

Bitmaps, cropped regions, corrected images and recognition text stay in memory/app-private cache. Every native call recycles its bitmaps, decoder and engine. Captures/rotation/trim files are removed after acceptance/cancellation; closing during native work discards the result and deletes files when that call finishes. No further fallback starts after cancellation. Startup removes force-stop leftovers. Development diagnostics contain only pass number, elapsed time and line lengths, never names, IDs, raw MRZ, paths or images. No user ID samples are committed.

## Verification

Tests cover check digits, full Afghan ID mapping, leading zeroes, unsupported/malformed MRZs, conflicting reads, guide geometry, selected-area-only processing, cancellation and the asynchronous file-move regression. Run the Android acceptance checklist with consented real cards, glare/tilt, retry, airplane mode and cache cleanup. No real-card accuracy claim follows from synthetic tests alone. Live online testing remains pending configuration.
