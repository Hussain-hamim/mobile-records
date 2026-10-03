const { withProjectBuildGradle } = require("expo/config-plugins");

// Expo SQLite builds SQLCipher from source but otherwise uses AGP's default NDK.
// Reuse the SDK-selected root NDK for native libraries instead of installing two.
module.exports = function withAndroidToolchain(config) {
  return withProjectBuildGradle(config, (c) => {
    const marker = "// mobile-records: shared Android NDK";
    if (!c.modResults.contents.includes(marker)) {
      c.modResults.contents += `
${marker}
subprojects { subproject ->
  subproject.plugins.withId("com.android.library") {
    subproject.android.ndkVersion = rootProject.ext.ndkVersion
  }
}
`;
    }
    return c;
  });
};
