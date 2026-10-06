const { withAppBuildGradle } = require("expo/config-plugins");

// Local releases are signed after compilation with apksigner. Never silently
// distribute a production APK signed with Expo's public debug certificate.
module.exports = function withLocalRelease(config) {
  return withAppBuildGradle(config, (c) => {
    const contents = c.modResults.contents;
    const releaseDebugSigning = /(release\s*\{[\s\S]*?)signingConfig signingConfigs\.debug/;
    if (releaseDebugSigning.test(contents)) {
      c.modResults.contents = contents.replace(
        releaseDebugSigning,
        "$1signingConfig null // Signed by scripts/build-android-release.mjs",
      );
    } else if (!contents.includes("Signed by scripts/build-android-release.mjs")) {
      throw new Error("Release signing template changed; review before building.");
    }
    return c;
  });
};
