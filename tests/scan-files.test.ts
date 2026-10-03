import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

// Exercise the real service with a delayed native move, as on Android SDK 57.
function scanService(move: (source: string, target: string) => Promise<void>) {
  class File {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((p) => (typeof p === "string" ? p : p.uri))
        .join("/");
    }
    create() {}
    move(target: File) {
      return move(this.uri, target.uri);
    }
  }
  const exports = {} as { keepScan: (uri: string) => Promise<string> };
  const source = readFileSync(
    new URL("../src/services/scanning.ts", import.meta.url),
    "utf8",
  );
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText,
    {
      exports,
      require: (name: string) => {
        if (name === "expo-file-system")
          return { File, Directory: File, Paths: { cache: "file:///cache" } };
        if (name === "expo-modules-core")
          return { requireOptionalNativeModule: () => null };
        return {};
      },
    },
  );
  return exports;
}

test("scan URI is not handed to cleanup or OCR until the native move finishes", async () => {
  const files = new Set(["file:///cache/Camera/photo.jpg"]);
  let finishMove!: () => void;
  const service = scanService(
    (source, target) =>
      new Promise<void>((resolve) => {
        finishMove = () => {
          assert.ok(
            files.has(source),
            "camera source must survive until the move completes",
          );
          files.delete(source);
          files.add(target);
          resolve();
        };
      }),
  );
  let handedOff = false;
  const capture = service
    .keepScan("file:///cache/Camera/photo.jpg")
    .then((uri) => {
      handedOff = true;
      files.delete("file:///cache/Camera/photo.jpg");
      assert.ok(files.has(uri), "OCR receives an existing file");
      return uri;
    });
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(handedOff, false);
  finishMove();
  assert.match(await capture, /record-scans\/.+\.jpg$/);
});

test("native move failure reaches the scanner error handler without returning a missing URI", async () => {
  let failMove!: (error: Error) => void;
  const service = scanService(
    () =>
      new Promise<void>((_resolve, reject) => {
        failMove = reject;
      }),
  );
  const failure = new Error("NoSuchFileException");
  const rejected = assert.rejects(
    service.keepScan("file:///cache/Camera/missing.jpg"),
    failure,
  );
  failMove(failure);
  await rejected;
});
