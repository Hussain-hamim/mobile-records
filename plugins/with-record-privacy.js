const {
  withAndroidManifest,
  withProjectBuildGradle,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");
module.exports = function withRecordPrivacy(config) {
  config = withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application[0].$;
    app["android:allowBackup"] = "false";
    app["android:fullBackupContent"] = "@xml/record_backup_rules";
    app["android:dataExtractionRules"] = "@xml/record_extraction_rules";
    return c;
  });
  config = withDangerousMod(config, [
    "android",
    async (c) => {
      const folder = path.join(
        c.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      await fs.mkdir(folder, { recursive: true });
      const exclusions = [
        "root",
        "file",
        "database",
        "sharedpref",
        "external",
        "device_root",
        "device_file",
        "device_database",
        "device_sharedpref",
      ]
        .map((domain) => `<exclude domain="${domain}" path="."/>`)
        .join("");
      await fs.writeFile(
        path.join(folder, "record_backup_rules.xml"),
        `<full-backup-content>${exclusions}</full-backup-content>`,
      );
      await fs.writeFile(
        path.join(folder, "record_extraction_rules.xml"),
        `<data-extraction-rules><cloud-backup>${exclusions}</cloud-backup><device-transfer>${exclusions}</device-transfer></data-extraction-rules>`,
      );
      return c;
    },
  ]);
  return withProjectBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes("https://jitpack.io"))
      c.modResults.contents +=
        '\nallprojects { repositories { maven { url "https://jitpack.io" } } }\n';
    return c;
  });
};
