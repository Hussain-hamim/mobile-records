import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fullImage,
  mrzGuide,
  mrzPhotoRegion,
  mrzPixelCrop,
  readMrzImage,
  type MrzRegion,
} from "../src/domain/mrz-capture";
const valid =
  "I<AFG13991234<600123<<<<<<<<<<\n9901018F3001019AFG<<<<<<<<<<<0\nEXAMPLE<<TEST<PERSON<<<<<<<<<<";
const roi: MrzRegion = [0.1, 0.3, 0.8, 0.3];

test("guide crop maps the visible FILL_CENTER preview back to full photo pixels", () => {
  for (const [pw, ph, iw, ih] of [
    [360, 360, 3000, 4000],
    [360, 360, 4000, 3000],
    [390, 360, 3024, 4032],
    [844, 360, 4032, 3024],
  ]) {
    const region = mrzPhotoRegion(
      { width: iw, height: ih },
      { width: pw, height: ph },
    );
    const scale = Math.max(pw / iw, ph / ih);
    const [x, y, w, h] = region;
    assert.ok(
      Math.abs(x * iw * scale - (iw * scale - pw) / 2 - mrzGuide.x * pw) <
        0.001,
    );
    assert.ok(
      Math.abs(y * ih * scale - (ih * scale - ph) / 2 - mrzGuide.y * ph) <
        0.001,
    );
    assert.ok(Math.abs(w * iw * scale - mrzGuide.width * pw) < 0.001);
    assert.ok(Math.abs(h * ih * scale - mrzGuide.height * ph) < 0.001);
    assert.ok(x >= 0 && y >= 0 && x + w <= 1 && y + h <= 1);
  }
  assert.throws(
    () => mrzPhotoRegion({ width: 100, height: 100 }, { width: 0, height: 0 }),
    /cameraUnavailable/,
  );
});

test("selected photo pixels stay bounded, retain edge characters and are never resized", () => {
  for (const photo of [
    { width: 3024, height: 4032 },
    { width: 4032, height: 3024 },
    { width: 4001, height: 3001 },
  ]) {
    const region = mrzPhotoRegion(photo, { width: 360, height: 360 });
    const crop = mrzPixelCrop(photo, region);
    assert.ok(crop.originX >= 0 && crop.originY >= 0);
    assert.ok(crop.originX + crop.width <= photo.width);
    assert.ok(crop.originY + crop.height <= photo.height);
    assert.ok(crop.width >= region[2] * photo.width);
    assert.ok(crop.height >= region[3] * photo.height);
    assert.ok(crop.width < photo.width && crop.height < photo.height);
    assert.deepEqual(mrzPixelCrop(photo, fullImage), {
      originX: 0,
      originY: 0,
      ...photo,
    });
  }
  assert.deepEqual(
    mrzPixelCrop({ width: 101, height: 101 }, [0.1, 0.1, 0.8, 0.8]),
    {
      originX: 10,
      originY: 10,
      width: 81,
      height: 81,
    },
  );
});

test("invalid crop geometry fails instead of silently reading the whole image", () => {
  for (const region of [
    [-0.1, 0, 1, 1],
    [0, 0, 0, 1],
    [0.5, 0, 0.6, 1],
    [0, NaN, 1, 1],
  ] as MrzRegion[]) {
    assert.throws(
      () => mrzPixelCrop({ width: 4000, height: 3000 }, region),
      /cameraUnavailable/,
    );
  }
  assert.throws(
    () => mrzPixelCrop({ width: 0, height: 3000 }, fullImage),
    /cameraUnavailable/,
  );
});

test("successful first pass skips all slower recognition work", async () => {
  const calls: number[] = [];
  const result = await readMrzImage(async (pass, region) => {
    calls.push(pass);
    assert.deepEqual(region, roi);
    return valid;
  }, roi);
  assert.equal(result?.ok, true);
  assert.deepEqual(calls, [0]);
});

test("failed raw scan uses straightening then stops when checks pass", async () => {
  const calls: number[] = [];
  const result = await readMrzImage(async (pass) => {
    calls.push(pass);
    return pass === 1 ? valid : valid.replace("I<AFG", "1<AFG");
  }, roi);
  assert.equal(result?.ok, true);
  assert.deepEqual(calls, [0, 1]);
});

test("automatic-layout fallback stays inside the selected area", async () => {
  const calls: MrzRegion[] = [];
  const result = await readMrzImage(async (pass, region) => {
    calls.push(region);
    return pass === 2 ? valid : "";
  }, roi);
  assert.equal(result?.ok, true);
  assert.deepEqual(calls, [roi, roi, roi]);
});

test("text outside the selected area is never used to rescue a failed scan", async () => {
  const result = await readMrzImage(
    async (_pass, region) => (region[2] === 1 && region[3] === 1 ? valid : ""),
    roi,
  );
  assert.deepEqual(result, { ok: false, error: "mrzNotFound" });
});

test("cancellation discards the in-flight result and never starts another pass", async () => {
  let active = true,
    calls = 0;
  const result = await readMrzImage(
    async () => {
      calls++;
      active = false;
      return valid;
    },
    roi,
    () => active,
  );
  assert.equal(result, null);
  assert.equal(calls, 1);
  await readMrzImage(
    async () => {
      throw new Error("Should not read");
    },
    roi,
    () => false,
  );
});

test("failed checks remain failures across fallbacks; recognized digits are never repaired", async () => {
  const result = await readMrzImage(
    async (pass) => (pass === 0 ? valid.replace("00123", "00124") : ""),
    roi,
  );
  assert.deepEqual(result, { ok: false, error: "mrzInvalid" });
});
