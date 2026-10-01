# Bundled assets

- **Tesseract tessdata_fast**: English (`eng`) for Latin MRZ characters and printed IMEIs; Apache-2.0, see tessdata-LICENSE. The models ship in the Android module; there is no runtime model download.
- **Noto Sans Arabic**: Google Fonts, SIL Open Font License, see NotoSansArabic-OFL.txt.
- **Community TAC data**: MoazEb/tac-database, distributed by its author under MIT; see TAC-LICENSE. Community data is not an authoritative device, authenticity, or stolen-phone check. Coverage and model strings can be wrong or incomplete. Confirm every suggestion.
- **Tesseract4Android 4.9.0**: Apache-2.0 wrapper; native Tesseract/Leptonica dependencies retain their upstream notices in the dependency distribution.

`../asset-manifest.json` records exact upstream commit URLs and SHA-256 hashes. `scripts/prepare-assets.py` rebuilds the packaged TAC SQLite index and downloads language/font sources. Model/colour/storage confirmation remains the shop's responsibility.
