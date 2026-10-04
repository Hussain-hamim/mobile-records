import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as frame from "../src/domain/imei-frame";
import * as validation from "../src/domain/validation";
const source = readFileSync(
  new URL("../src/services/imei-scanning.ts", import.meta.url),
  "utf8",
);
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
function harness() {
  const state = {
    cropFailure: false,
    barcodeFailure: false,
    barcodes: [] as { data: string; raw?: string; cornerPoints?: unknown[] }[],
    ocr: "",
    seen: [] as string[],
    deleted: [] as string[],
    region: [] as number[],
    textCalls: 0,
  };
  const exports = {};
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === "../domain/imei-frame") return frame;
      if (name === "../domain/validation") return validation;
      if (name === "expo-camera")
        return {
          async scanFromURLAsync(uri: string) {
            state.seen.push(uri);
            if (state.barcodeFailure) throw new Error("decoder failed");
            return state.barcodes;
          },
        };
      if (name === "./scanning")
        return {
          canRecognize: true,
          async cropScan(
            _uri: string,
            _w: number,
            _h: number,
            region: number[],
          ) {
            state.region = region;
            if (state.cropFailure) throw new Error("crop failed");
            return { uri: "file:///cache/crop.jpg", width: 1500, height: 800 };
          },
          async deleteScans(uris: string[]) {
            state.deleted.push(...uris);
          },
          async recognize(uri: string) {
            state.seen.push(uri);
            state.textCalls++;
            return { text: state.ocr };
          },
        };
      throw new Error(name);
    },
  });
  return {
    state,
    service: exports as typeof import("../src/services/imei-scanning"),
  };
}
test("only the bracket crop reaches decoding, never the camera frame", async () => {
  const { state, service } = harness();
  const captured = { uri: "file:///cache/full.jpg", width: 3000, height: 4000 };
  const preview = { width: 300, height: 360 };
  const crop = await service.captureImeiRegion(async () => captured, preview);
  state.barcodes = [{ data: "490154203237518", cornerPoints: [] }];
  assert.equal(
    (await service.readImeiCrop(crop.uri)).join(),
    "490154203237518",
  );
  assert.deepEqual(state.seen, [crop.uri]);
  assert.deepEqual(state.deleted, [captured.uri]);
  assert.deepEqual(state.region, frame.imeiPhotoRegion(captured, preview));
  assert.equal(state.textCalls, 0);
});
test("missing barcode corner metadata no longer drops a valid in-crop IMEI; duplicates merge", async () => {
  const { state, service } = harness();
  state.barcodes = [
    { data: "490154203237518", cornerPoints: [] },
    { data: "490154203237518" },
    { data: "display", raw: "356938035643809" },
  ];
  assert.equal(
    (await service.readImeiBarcodes("cropped")).join(),
    "490154203237518,356938035643809",
  );
});
test("printed-text fallback reads the same crop only when barcode decoding finds nothing", async () => {
  const { state, service } = harness();
  state.ocr = "IMEI: 490154203237518";
  assert.equal(
    (await service.readImeiCrop("cropped")).join(),
    "490154203237518",
  );
  assert.deepEqual(state.seen, ["cropped", "cropped"]);
  state.barcodeFailure = true;
  assert.equal(
    (await service.readImeiCrop("cropped")).join(),
    "490154203237518",
  );
});
test("crop failure does not fall back to full-frame recognition and releases the camera file", async () => {
  const { state, service } = harness();
  state.cropFailure = true;
  await assert.rejects(
    service.captureImeiRegion(
      async () => ({ uri: "full", width: 3000, height: 4000 }),
      { width: 300, height: 360 },
    ),
    /crop failed/,
  );
  assert.deepEqual(state.deleted, ["full"]);
  assert.equal(state.seen.length, 0);
});
test("cancellation prevents the expensive text fallback", async () => {
  const { state, service } = harness();
  assert.equal((await service.readImeiCrop("cropped", () => false)).length, 0);
  assert.equal(state.textCalls, 0);
});
