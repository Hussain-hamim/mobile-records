# Local Android release

Build a standalone, signed APK without Expo Go or Metro:

```sh
JAVA_HOME=/Library/Java/JavaVirtualMachines/openjdk-17.jdk/Contents/Home \
ANDROID_HOME=/Users/hussain/Library/Android/sdk \
npm run android:release
```

Set the paths to the installed JDK 17 and Android SDK on other machines. Build tools default to `36.0.0`; `ANDROID_BUILD_TOOLS` can override that version. The build uses the configured `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the production environment or `.env.local`. Never put administrative secrets in public environment variables.

The script generates Android through Expo config plugins, builds an unsigned release with bundled JavaScript/assets, aligns the APK, signs it with the local release key, and verifies its signature and alignment. It targets `arm64-v8a` and `armeabi-v7a`, matching the architectures provided by the fingerprint SDK. Output and SHA-256 checksum are in `releases/`. Increase `expo.android.versionCode` in `app.json` for subsequent distributed updates; this local build does not use EAS remote version increments.

## Signing credentials

On the first run, the script creates `.credentials/android-release.p12` and `.credentials/android-release.json`. The JSON contains its password and alias. Both are private files, excluded from Git and the APK. Back up this directory to a secure location accessible only to the app owner. Future updates must use the same signing key; restore these files before building on another machine. Never send signing credentials with the APK. If this app is ever published using a different existing production key, use that established signing identity instead of distributing a newly signed update.

The config plugin removes the template's debug-signing fallback. Running Gradle `assembleRelease` directly produces an **unsigned** APK; use the script for the signed deliverable. Debug builds still use their normal debug key.

The production package has the same application ID as the development build and a different signing certificate. Android will not install it over the development app. Do not uninstall a populated development app merely to test this release: local photos would be lost. Use a clean device/emulator, or first arrange an explicit data-preservation/migration plan. No device is automatically uninstalled or cleared by this script.

## Delivery checks

Run lint, TypeScript, the test suite and Expo Doctor before delivery. Inspect the APK for a non-debuggable manifest, a production certificate, bundled Hermes bytecode, audio/fonts/MRZ models, and both ARM native libraries. Launch without an ADB reverse/Metro connection. Complete the physical-device matrix in [ANDROID-ACCEPTANCE.md](ANDROID-ACCEPTANCE.md) for sign-in, session restore, camera/MRZ, fingerprint hardware, audio and printing.

This release is standalone, but signed-in records still require internet and the configured backend. Government forms remain visibly marked as drafts pending final template approval. A successful build and emulator launch do not establish reliable scanner accuracy or replace acceptance testing on the supported hardware.
