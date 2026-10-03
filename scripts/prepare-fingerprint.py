"""Copy ZKTeco ZKFinger Android SDK binaries into the fingerprint module.

Source zip: SDKzk9500/ZKFingerSDK_Andoroid/ZKFingerAndroidSDK_V2.1.zip
Only the JARs and the two ABI native libraries are extracted. The sample app
and SVN metadata stay out of the module.
"""
import pathlib
import zipfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
ZIP = ROOT / "SDKzk9500/ZKFingerSDK_Andoroid/ZKFingerAndroidSDK_V2.1.zip"
PREFIX = "ZKFingerAndroidSDK_V2.1.24/libs/"
ANDROID = ROOT / "modules/record-fingerprint/android"
JARS = [
    "zkandroidcore.jar",
    "zkandroidfpreader.jar",
    "zkandroidfingerservice.jar",
]
LIBS = [
    "armeabi-v7a/libzkfinger10.so",
    "armeabi-v7a/libzksensorcore.so",
    "armeabi-v7a/libslkidcap.so",
    "armeabi-v7a/libzkalg12.so",
    "arm64-v8a/libzkfinger10.so",
    "arm64-v8a/libzksensorcore.so",
    "arm64-v8a/libslkidcap.so",
    "arm64-v8a/libzkalg12.so",
]


def main():
    if not ZIP.exists():
        raise SystemExit("Missing ZKFinger SDK zip: " + str(ZIP))
    with zipfile.ZipFile(ZIP) as archive:
        for name in JARS:
            target = ANDROID / "libs" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(PREFIX + name))
            print(target.relative_to(ROOT), target.stat().st_size)
        for name in LIBS:
            target = ANDROID / "src/main/jniLibs" / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(archive.read(PREFIX + name))
            print(target.relative_to(ROOT), target.stat().st_size)


if __name__ == "__main__":
    main()
