"""Local-only MRZ regression probe. Requires Pillow, JDK, and tesseract 5.

Usage: python3 scripts/evaluate-mrz.py /private/path/image.png --expected /private/path/mrz.txt
No images or recognition text are written or printed. Use consented samples only.
The desktop probe tests the packaged model and actual native skew estimator;
it does not measure Android camera latency or reproduce Android's bitmap codec.
"""
import argparse, io, json, pathlib, shutil, subprocess, tempfile, time
from PIL import Image, ImageEnhance, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('image', type=pathlib.Path)
parser.add_argument('--expected', required=True, type=pathlib.Path)
args = parser.parse_args()
expected = [''.join(line.split()) for line in args.expected.read_text().splitlines() if line.strip()]
if len(expected) != 3 or any(len(line) != 30 for line in expected):
    raise SystemExit('Expected input must have three 30-character lines')
for tool in ['tesseract', 'javac', 'java']:
    if not shutil.which(tool): raise SystemExit('Missing local tool: ' + tool)
image = Image.open(args.image).convert('RGB')
models = ROOT / 'modules/record-ocr/android/src/main/assets/tessdata'
variants = {
    'original': image,
    'half-size': image.resize((image.width//2, image.height//2)),
    'dim': ImageEnhance.Brightness(image).enhance(0.65),
    'soft-blur': image.filter(ImageFilter.GaussianBlur(0.7)),
    **{f'tilt-{n:+}': image.rotate(n, expand=True, fillcolor='white') for n in [-6,-3,3,6]},
}
with tempfile.TemporaryDirectory(prefix='mrz-probe-') as folder:
    probe = pathlib.Path(folder) / 'MrzProbe.java'
    probe.write_text('''import expo.modules.recordocr.MrzDeskew;
public class MrzProbe {
  public static void main(String[] args) throws Exception {
    System.out.println(MrzDeskew.angle(System.in.readAllBytes(), Integer.parseInt(args[0]), Integer.parseInt(args[1])));
  }
}''')
    subprocess.run(['javac', '-d', folder, str(ROOT/'modules/record-ocr/android/src/main/java/expo/modules/recordocr/MrzDeskew.java'), str(probe)], check=True, capture_output=True)
    for label, picture in variants.items():
        for model in ['eng', 'mrz']:
            start = time.monotonic()
            success = False
            for attempt in range(2 if model == 'mrz' else 1):
                prepared = picture
                if attempt:
                    w = min(900, picture.width)
                    small = picture.resize((w, max(1,picture.height*w//picture.width))).convert('L')
                    measured = subprocess.run(['java','-cp',folder,'MrzProbe',str(small.width),str(small.height)],input=small.tobytes(),capture_output=True,check=True)
                    prepared = picture.rotate(float(measured.stdout),expand=True,fillcolor='white')
                buf = io.BytesIO(); prepared.save(buf,format='PNG')
                command = ['tesseract','stdin','stdout','--tessdata-dir',str(models),'-l',model,'--psm','6','-c','tessedit_char_whitelist=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789<']
                if attempt: command += ['-c','thresholding_method=2']
                result = subprocess.run(command,input=buf.getvalue(),capture_output=True,check=True)
                lines = [''.join(line.split()) for line in result.stdout.decode().splitlines() if line.strip()]
                success = lines == expected
                if success: break
            print(json.dumps({'variant':label,'model':model,'exact':success,'passes':attempt+1,'elapsedMs':round((time.monotonic()-start)*1000)}),flush=True)
