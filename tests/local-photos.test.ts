import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { imeiPhotoRegion } from "../src/domain/imei-frame";
import {
  isLocalPhotoFolder,
  photoScopeKey,
  photoCapabilities,
  encodePhotoManifest,
  decodePhotoManifest,
} from "../src/domain/local-photos";
import { mrzPixelCrop } from "../src/domain/mrz-capture";
const scope = { shopId: "shop-1", userId: "user-1", recordId: "record-1" };
const relative = `record-photos/${photoScopeKey(scope)}`;
test("native photo support is separate from Android folder selection", () => {
  assert.deepEqual(photoCapabilities("ios"), {
    attachments: true,
    folderSelection: false,
  });
  assert.deepEqual(photoCapabilities("android"), {
    attachments: true,
    folderSelection: true,
  });
  for (const platform of ["web", "windows"])
    assert.deepEqual(photoCapabilities(platform), {
      attachments: false,
      folderSelection: false,
    });
});
test("private manifests survive reloads and a changed iOS Documents root for every slot", () => {
  const set = {
    folder: `file:///old/Documents/${relative}/`,
    photos: {
      person: `file:///old/Documents/${relative}/person-abc.jpg`,
      idFront: `file:///old/Documents/${relative}/idFront-def.jpg`,
      idBack: `file:///old/Documents/${relative}/idBack-ghi.jpg`,
    },
  };
  const encoded = encodePhotoManifest(set, scope);
  assert.doesNotMatch(encoded, /file:|old\/Documents/);
  const reloaded = decodePhotoManifest(
    encoded,
    scope,
    "file:///new/Documents/",
  );
  assert.deepEqual(
    reloaded,
    JSON.parse(JSON.stringify(set).replaceAll("/old/", "/new/")),
  );
  // Existing absolute-URI manifests get the same resolution without moving files.
  assert.deepEqual(
    decodePhotoManifest(JSON.stringify(set), scope, "file:///new/Documents"),
    reloaded,
  );
});
test("Android SAF folder and document URIs are preserved exactly", () => {
  const base =
    "content://com.android.externalstorage.documents/tree/primary%3APictures/document/";
  const folder =
    base + encodeURIComponent(`primary:Pictures/MR-${photoScopeKey(scope)}`);
  const set = { folder, photos: { person: folder + "%2Fperson-abc.jpg" } };
  for (const raw of [JSON.stringify(set), encodePhotoManifest(set, scope)])
    assert.deepEqual(
      decodePhotoManifest(raw, scope, "file:///data/documents/"),
      set,
    );
});
test("invalid and cross-account references cannot be loaded or deleted", () => {
  for (const uri of [
    `${relative}/../person-abc.jpg`,
    `${relative}/%2e%2e/person-abc.jpg`,
    `${relative}/person-abc.jpg/other`,
    `${relative}/idBack-abc.jpg`,
    `https://example.com/${relative}/person-abc.jpg`,
    `record-photos/shop-2.user-1.record-1/person-abc.jpg`,
  ])
    assert.throws(
      () =>
        decodePhotoManifest(
          JSON.stringify({ photos: { person: uri } }),
          scope,
          "file:///docs/",
        ),
      /photoManifestInvalid/,
    );
  const raw = encodePhotoManifest(
    { photos: { person: `${relative}/person-abc.jpg` } },
    scope,
  );
  for (const change of [
    { userId: "user-2" },
    { shopId: "shop-2" },
    { recordId: "record-2" },
  ])
    assert.throws(() =>
      decodePhotoManifest(raw, { ...scope, ...change }, "file:///docs/"),
    );
  assert.throws(() => decodePhotoManifest("broken", scope, "file:///docs/"));
  assert.deepEqual(decodePhotoManifest(null, scope, "file:///docs/"), {
    photos: {},
  });
});
test("IMEI photo crop maps the bracket through a center-filled preview, including landscape photos", () => {
  for (const photo of [
    { width: 3000, height: 4000 },
    { width: 4000, height: 3000 },
  ]) {
    const preview = { width: 300, height: 360 };
    const crop = mrzPixelCrop(photo, imeiPhotoRegion(photo, preview));
    const scale = Math.max(
      preview.width / photo.width,
      preview.height / photo.height,
    );
    const hiddenX = (photo.width * scale - preview.width) / 2,
      hiddenY = (photo.height * scale - preview.height) / 2;
    assert.ok(Math.abs(crop.originX * scale - hiddenX - 24) < 1);
    assert.ok(Math.abs(crop.originY * scale - hiddenY - 90) < 1);
    assert.ok(Math.abs(crop.width * scale - 252) < 1);
    assert.ok(Math.abs(crop.height * scale - 180) < 1);
    assert.ok(crop.width < photo.width && crop.height < photo.height);
  }
});
test("local photo references separate accounts, shops and records and reject path traversal", () => {
  const s = { shopId: "shop-1", userId: "user-1", recordId: "record-1" };
  const key = photoScopeKey(s);
  for (const changes of [
    { shopId: "shop-2" },
    { userId: "user-2" },
    { recordId: "record-2" },
  ])
    assert.notEqual(photoScopeKey({ ...s, ...changes }), key);
  for (const recordId of ["../outside", "", "a/b", "a.b", "a%2Fb"])
    assert.throws(() => photoScopeKey({ ...s, recordId }));
  assert.equal(
    isLocalPhotoFolder(
      "content://com.android.externalstorage.documents/tree/primary%3APictures",
    ),
    true,
  );
  assert.equal(
    isLocalPhotoFolder(
      "content://com.google.android.apps.docs.storage/tree/cloud",
    ),
    false,
  );
  assert.equal(isLocalPhotoFolder("https://example.com/photos"), false);
});
test("local attachments have no cloud, OCR upload or record payload dependency", () => {
  const service = readFileSync(
    new URL("../src/services/local-photos.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    service,
    /\bfetch\s*\(|backend|supabase|scanUpload|recognize/,
  );
  const model = readFileSync(
    new URL("../src/domain/models.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(model, /LocalPhotoSet|PhotoScope|PhotoSlot/);
  const cleanup = readFileSync(
    new URL("../src/services/scanning.ts", import.meta.url),
    "utf8",
  ).split("export async function keepScan")[0];
  assert.doesNotMatch(cleanup, /record-photos/);
});
