import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("native capture gate rejects held touches, duplicate extraction and sparse errors", {
  skip: spawnSync("javac", ["-version"]).status !== 0 ? "JDK required" : false,
}, () => {
  const output = mkdtempSync(join(tmpdir(), "fingerprint-gate-"));
  try {
    execFileSync("javac", ["-d", output,
      "modules/record-fingerprint/android/src/main/java/expo/modules/recordfingerprint/CaptureGate.java",
      "tests/native/CaptureGateTest.java"], { timeout: 30000 });
    assert.match(execFileSync("java", ["-cp", output, "CaptureGateTest"], {
      encoding: "utf8", timeout: 30000,
    }), /passed/);
  } finally { rmSync(output, { recursive: true, force: true }); }
});
