# Bundled assets

- **Tesseract tessdata_fast**: English (`eng`) for printed IMEIs and English/Persian/Pashto (`eng`, `fas`, `pus`) for printed Tazkira details; Apache-2.0, see tessdata-LICENSE. The models ship in the Android module; there is no runtime model download.
- **DoubangoTelecom/tesseractMRZ**: fast integer MRZ model, BSD-3-Clause, see MRZ-LICENSE. Pinned revision and SHA-256 are recorded in the asset manifest; bundled in the APK with no runtime download.
- **Noto Sans Arabic**: Google Fonts, SIL Open Font License, see NotoSansArabic-OFL.txt.
- **Community TAC data**: MoazEb/tac-database, distributed by its author under MIT; see TAC-LICENSE. Community data is not an authoritative device, authenticity, or stolen-phone check. Coverage and model strings can be wrong or incomplete. Confirm every suggestion.
- **Tesseract4Android 4.9.0**: Apache-2.0 wrapper; native Tesseract/Leptonica dependencies retain their upstream notices in the dependency distribution.
- **ZKTeco ZKFinger Android SDK 2.1.24**: proprietary reader SDK for the ZK9500. JARs and native libraries are copied from `SDKzk9500/ZKFingerSDK_Andoroid/ZKFingerAndroidSDK_V2.1.zip` by `scripts/prepare-fingerprint.py`. Only the merged fingerprint template is stored.

`../asset-manifest.json` records exact upstream commit URLs and SHA-256 hashes. `scripts/prepare-assets.py` rebuilds the packaged TAC SQLite index and downloads language/font sources. Model/colour/storage confirmation remains the shop's responsibility.
