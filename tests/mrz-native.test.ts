import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test(
  "native image straightening handles both tilt directions and blank frames",
  {
    skip:
      spawnSync("javac", ["-version"]).status !== 0
        ? "JDK needed for native pixel tests"
        : false,
  },
  () => {
    const output = mkdtempSync(join(tmpdir(), "mrz-deskew-test-"));
    try {
      execFileSync(
        "javac",
        [
          "-d",
          output,
          "modules/record-ocr/android/src/main/java/expo/modules/recordocr/MrzDeskew.java",
          "tests/native/MrzDeskewTest.java",
        ],
        { timeout: 30000 },
      );
      assert.match(
        execFileSync("java", ["-cp", output, "MrzDeskewTest"], {
          encoding: "utf8",
          timeout: 30000,
        }),
        /passed/,
      );
    } finally {
      rmSync(output, { recursive: true, force: true });
    }
  },
);
