"""Download pinned public OCR/font/TAC sources; write checksums and attribution.
Run once with network access. Runtime scanning never downloads or uploads ID data.
"""
import csv, hashlib, io, json, pathlib, sqlite3, urllib.request
ROOT = pathlib.Path(__file__).resolve().parents[1]
manifest = []
def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'MobileRecords-assets'}), timeout=90) as response:
        return response.read()
def revision(repo):
    return json.loads(fetch('https://api.github.com/repos/' + repo + '/commits?per_page=1'))[0]['sha']
def save(repo, rev, source, destination):
    url = 'https://raw.githubusercontent.com/' + repo + '/' + rev + '/' + urllib.parse.quote(source)
    data = fetch(url)
    path = ROOT / destination
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(data)
    manifest.append({'source': url, 'path': destination, 'sha256': hashlib.sha256(data).hexdigest()})
    print(destination, len(data), flush=True)
    return data
ocr = revision('tesseract-ocr/tessdata_fast')
for lang in ['eng']:
    save('tesseract-ocr/tessdata_fast', ocr, lang + '.traineddata', 'modules/record-ocr/android/src/main/assets/tessdata/' + lang + '.traineddata')
save('tesseract-ocr/tessdata_fast', ocr, 'LICENSE', 'assets/licenses/tessdata-LICENSE')
fonts = revision('google/fonts')
save('google/fonts', fonts, 'ofl/notosansarabic/NotoSansArabic[wdth,wght].ttf', 'assets/fonts/NotoSansArabic.ttf')
save('google/fonts', fonts, 'ofl/notosansarabic/OFL.txt', 'assets/licenses/NotoSansArabic-OFL.txt')
tac = revision('MoazEb/tac-database')
data = save('MoazEb/tac-database', tac, 'tac_full.csv', 'assets/data/tac-source.csv')
save('MoazEb/tac-database', tac, 'LICENSE', 'assets/licenses/TAC-LICENSE')
db_path = ROOT / 'assets/data/tac.db'
if db_path.exists(): db_path.unlink()
db = sqlite3.connect(db_path)
db.execute('CREATE TABLE tac(tac TEXT PRIMARY KEY, brand TEXT NOT NULL, model TEXT NOT NULL)')
reader = csv.DictReader(io.StringIO(data.decode('utf-8-sig')))
for row in reader:
    row = {k.lower().strip(): v.strip() for k,v in row.items() if k}
    code = row.get('tac', '').zfill(8)
    if len(code) == 8 and code.isdigit():
        db.execute('INSERT OR IGNORE INTO tac VALUES(?,?,?)', (code, row.get('brand',''), row.get('specs', row.get('model',''))))
db.commit()
print('TAC entries:', db.execute('SELECT count(*) FROM tac').fetchone()[0])
db.close()
(ROOT / 'assets/data/tac-source.csv').unlink()
(ROOT / 'assets/asset-manifest.json').write_text(json.dumps(manifest, indent=2))
