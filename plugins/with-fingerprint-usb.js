const {
  withAndroidManifest,
  withDangerousMod,
} = require("expo/config-plugins");
const fs = require("node:fs/promises");
const path = require("node:path");
const USB_ATTACHED = "android.hardware.usb.action.USB_DEVICE_ATTACHED";
const FILTER = "fingerprint_device_filter";

module.exports = function withFingerprintUsb(config) {
  config = withAndroidManifest(config, (c) => {
    const manifest = c.modResults.manifest;
    manifest["uses-feature"] = manifest["uses-feature"] || [];
    if (
      !manifest["uses-feature"].some(
        (feature) => feature.$["android:name"] === "android.hardware.usb.host",
      )
    ) {
      manifest["uses-feature"].push({
        $: {
          "android:name": "android.hardware.usb.host",
          "android:required": "false",
        },
      });
    }
    const activity = manifest.application?.[0]?.activity?.find(
      (item) => item.$["android:name"] === ".MainActivity",
    );
    if (activity) {
      activity["intent-filter"] = activity["intent-filter"] || [];
      const attached = activity["intent-filter"].some((filter) =>
        (filter.action || []).some(
          (action) => action.$["android:name"] === USB_ATTACHED,
        ),
      );
      if (!attached) {
        activity["intent-filter"].push({
          action: [{ $: { "android:name": USB_ATTACHED } }],
        });
      }
      activity["meta-data"] = activity["meta-data"] || [];
      if (
        !activity["meta-data"].some(
          (item) => item.$["android:name"] === USB_ATTACHED,
        )
      ) {
        activity["meta-data"].push({
          $: {
            "android:name": USB_ATTACHED,
            "android:resource": "@xml/" + FILTER,
          },
        });
      }
    }
    return c;
  });
  return withDangerousMod(config, [
    "android",
    async (c) => {
      const folder = path.join(
        c.modRequest.platformProjectRoot,
        "app/src/main/res/xml",
      );
      await fs.mkdir(folder, { recursive: true });
      // Bundled ZKFingerAndroidSDK 2.1.24: Live20R (0x0120) and Live10R (0x0124).
      await fs.writeFile(
        path.join(folder, FILTER + ".xml"),
        '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <usb-device vendor-id="6997" product-id="288" />\n  <usb-device vendor-id="6997" product-id="292" />\n</resources>\n',
      );
      return c;
    },
  ]);
};
