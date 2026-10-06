"""Verify a standalone APK's manifest, bundled assets and native libraries."""
import hashlib
import os
from pathlib import Path
import struct
import subprocess
import sys
import zipfile

apk = Path(sys.argv[1]).resolve()
root = Path(__file__).resolve().parent.parent
sdk = Path(os.environ.get("ANDROID_HOME") or os.environ["ANDROID_SDK_ROOT"])
aapt = sdk / "build-tools" / os.environ.get("ANDROID_BUILD_TOOLS", "36.0.0") / "aapt"
badging = subprocess.check_output([str(aapt), "dump", "badging", str(apk)], text=True)
assert "application-debuggable" not in badging, "APK must not be debuggable"
assert "package: name='com.radefy.mobilerecords'" in badging, "Unexpected app ID"

with zipfile.ZipFile(apk) as archive:
    names = archive.namelist()
    assert "assets/index.android.bundle" in names, "Missing embedded JS bundle"
    assert len(archive.read("assets/index.android.bundle")) > 10000, "Empty JS bundle"
    assert not any(".credentials/" in n or n.endswith((".p12", ".keystore", ".env.local")) for n in names)
    media_hashes = {
        hashlib.sha256(archive.read(n)).hexdigest()
        for n in names if n.endswith((".mp3", ".ttf"))
    }
    for asset in [
        "sounds/fingerSuccess.mp3", "sounds/registerSuccessTone.mp3", "sounds/wrongfinger.mp3",
        "fonts/BahijBaraem-Regular.ttf", "fonts/NotoSansArabic.ttf",
    ]:
        assert hashlib.sha256((root / "assets" / asset).read_bytes()).hexdigest() in media_hashes, f"Missing asset: {asset}"
    for model in ["mrz", "eng", "pus", "fas"]:
        assert f"assets/tessdata/{model}.traineddata" in names, f"Missing OCR model: {model}"
    for abi in ["arm64-v8a", "armeabi-v7a"]:
        for library in ["libzkfinger10.so", "libzkalg12.so", "libzksensorcore.so", "libslkidcap.so"]:
            assert f"lib/{abi}/{library}" in names, f"Missing {abi}/{library}"
    for name in names:
        if not name.startswith("lib/arm64-v8a/") or not name.endswith(".so"):
            continue
        elf = archive.read(name)
        assert elf[:5] == b"\x7fELF\x02", f"Invalid ELF: {name}"
        offset = struct.unpack_from("<Q", elf, 32)[0]
        size, count = struct.unpack_from("<HH", elf, 54)
        for i in range(count):
            header = offset + i * size
            if struct.unpack_from("<I", elf, header)[0] == 1:
                assert struct.unpack_from("<Q", elf, header + 48)[0] >= 16384, f"16 KB ELF alignment missing: {name}"
    dex = b"".join(archive.read(n) for n in names if n.endswith(".dex"))
    for native in [b"Lexpo/modules/audio/AudioModule;", b"Lexpo/modules/recordfingerprint/RecordFingerprintModule;", b"Lexpo/modules/recordocr/RecordOcrModule;"]:
        assert native in dex, "Required native module is missing"

print("PASS: non-debuggable standalone APK, embedded JS, three sounds, fonts, OCR models, both ARM scanner SDKs, native modules and 16 KB ELF alignment.")
