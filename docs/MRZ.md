# Offline Afghan e-ID MRZ reader

The tazkira scanner reads the three lines with `<` characters on the back of the electronic ID. It does not read the chip or use an API. Photographing an MRZ still needs optical character recognition: the native module uses its bundled English Tesseract model with a Latin MRZ character whitelist, followed by a deterministic local parser. General Pashto/Persian/English label extraction has been removed, along with the unused Pashto/Persian recognition models. The app's three UI languages remain available.

## Data and validation

`src/domain/mrz.ts` implements the TD1 three-line/30-character structure and 7/3/1 check digits described by [ICAO Doc 9303 Part 3](https://www.icao.int/sites/default/files/publications/DocSeries/9303_p3_cons_en.pdf) and [Part 5](https://www.icao.int/sites/default/files/publications/DocSeries/9303_p5_cons_en.pdf). Birth, expiry, document and composite checks must all pass; calendar month/day and character classes are checked. Century, age, validity and identity are not inferred.

The Afghan split-number mapping is based on the card supplied for this task: eight digits followed by a filler in the document-number field, its check digit, and five digits followed by ten fillers in the first optional-data field. The composite check covers those five digits. The resulting 13 digits are displayed as `0000-0000-00000`, preserving leading zeroes. This is an observed country-specific layout, not a claim that all Afghan issuances use it. Standard TD1 extended document numbers are also accepted when they yield a checksum-valid 13-digit number. Other layouts remain manual rather than yielding a truncated ID.

Only the name and ID number become editable suggestions. Names have no check digit, use Latin transliteration and can be shortened by the card issuer. Staff must compare them to the card before accepting. Birth/expiry/sex/nationality/optional data are used transiently for parsing and validation, not added to the customer model. No relatives or addresses are guessed. No missing fillers or ambiguous glyphs are silently repaired. Conflicting successful reads require a retake.

## Native lifecycle

An updated Android build is required because `RecordOcr.readMrz` is a new native method. Older builds and the browser show a manual-entry fallback. Native changes cannot be delivered through JavaScript hot reload alone.

The reader tries automatic page segmentation, the lower part of a full-back photo, and a close-up block. It bounds bitmap size, serializes recognition/model installation, recycles image buffers and the engine, and never creates crop files. Model installation copies an asset from the APK into no-backup storage and requires no connection, including first use. All recognition text exists in memory only. Captures/rotation/trim files are app-private and removed after acceptance/cancellation; cancelling an in-progress read waits for native work to finish before cleanup and discards its result. Startup cleanup covers force-stop leftovers. No ID samples are added to the repository or test fixtures.

## Verification and remaining device checks

Automated tests use synthetic IDs and the published ICAO check-digit example. They cover the Afghan split and standard extended formats, leading zeroes, changes to every numeric position, malformed/missing lines, unsupported documents, conflicting reads and minimal output fields.

Run the [Android acceptance checklist](ANDROID-ACCEPTANCE.md) on a rebuilt app. In airplane mode from first launch, measure recognition against consented real samples (including the supplied card); check glare, camera orientation, denied permission, retry, crop, cancel, restart, file cleanup and network traffic. Parser tests alone do not establish camera recognition accuracy.
