import { randomBytes, createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
// Expo loads only public configuration into the bundle. Never print secrets.
process.env.NODE_ENV = "production";
const { load } = await import("@expo/env");
load(root);
for (const name of ["EXPO_PUBLIC_SUPABASE_URL", "EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY"])
  if (!process.env[name]) throw new Error(`Missing ${name}`);

const java = process.env.JAVA_HOME;
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
if (!java || !sdk) throw new Error("Set JAVA_HOME and ANDROID_HOME before building.");
const buildTools = join(sdk, "build-tools", process.env.ANDROID_BUILD_TOOLS || "36.0.0");
const privateDir = join(root, ".credentials");
const keystore = join(privateDir, "android-release.p12");
const credentialsFile = join(privateDir, "android-release.json");
mkdirSync(privateDir, { recursive: true, mode: 0o700 });
chmodSync(privateDir, 0o700);
if (existsSync(keystore) !== existsSync(credentialsFile))
  throw new Error("Incomplete signing credentials. Restore the matching key and JSON; do not replace the key.");
const env = { ...process.env, NODE_ENV: "production", ANDROID_SDK_ROOT: sdk };
const run = (command, args, options = {}) => execFileSync(command, args, { cwd: root, env, stdio: "inherit", ...options });
if (!existsSync(credentialsFile)) {
  const credentials = { alias: "mobile-records", password: randomBytes(32).toString("hex") };
  const signingEnv = { ...env, MOBILE_RECORDS_SIGNING_PASSWORD: credentials.password };
  run(join(java, "bin/keytool"), [
    "-genkeypair", "-noprompt", "-storetype", "PKCS12", "-keystore", keystore,
    "-alias", credentials.alias, "-keyalg", "RSA", "-keysize", "3072", "-validity", "10000",
    "-dname", "CN=Mobile Records, O=Radefy Systems, C=AF",
    "-storepass:env", "MOBILE_RECORDS_SIGNING_PASSWORD", "-keypass:env", "MOBILE_RECORDS_SIGNING_PASSWORD",
  ], { env: signingEnv });
  writeFileSync(credentialsFile, JSON.stringify(credentials, null, 2) + "\n", { mode: 0o600, flag: "wx" });
}
chmodSync(keystore, 0o600);
chmodSync(credentialsFile, 0o600);
const credentials = JSON.parse(readFileSync(credentialsFile, "utf8"));

run(join(root, "node_modules/.bin/expo"), ["prebuild", "--platform", "android", "--no-install"]);
run(join(root, "android/gradlew"), [
  ":app:assembleRelease", "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a", "--console=plain",
], { cwd: join(root, "android") });

const { expo } = JSON.parse(readFileSync(join(root, "app.json"), "utf8"));
const outputDir = join(root, "releases");
mkdirSync(outputDir, { recursive: true });
const apk = join(outputDir, `mobile-records-${expo.version}-${expo.android.versionCode}-release.apk`);
const unsigned = join(root, "android/app/build/outputs/apk/release/app-release-unsigned.apk");
if (!existsSync(unsigned)) throw new Error("Expected an unsigned release APK. Refusing to sign an unexpected artifact.");
run(join(buildTools, "zipalign"), ["-f", "-P", "16", "4", unsigned, apk]);
run(join(buildTools, "apksigner"), [
  "sign", "--ks", keystore, "--ks-key-alias", credentials.alias,
  "--ks-pass", "env:MOBILE_RECORDS_SIGNING_PASSWORD", "--key-pass", "env:MOBILE_RECORDS_SIGNING_PASSWORD", apk,
], { env: { ...env, MOBILE_RECORDS_SIGNING_PASSWORD: credentials.password } });
run(join(buildTools, "apksigner"), ["verify", "--verbose", "--print-certs", apk]);
run(join(buildTools, "zipalign"), ["-c", "-P", "16", "4", apk]);
run("python3", [join(root, "scripts/verify-android-release.py"), apk]);
const hash = createHash("sha256").update(readFileSync(apk)).digest("hex");
writeFileSync(apk + ".sha256", `${hash}  ${apk.split("/").pop()}\n`);
console.log(`\nSigned release APK: ${apk}\nBack up .credentials privately; it is required to sign future updates.`);
