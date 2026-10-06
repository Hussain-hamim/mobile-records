import assert from "node:assert/strict";
import { test } from "node:test";
import {
  customerPhotoAspect,
  tazkiraPhotoAspect,
  recordPhotoAspect,
  recordPhotoCrop,
  recordPhotoGuide,
} from "../src/domain/photo-frame";

test("square guide fits small and wide previews for both photo slots", () => {
  assert.equal(customerPhotoAspect, 1);
  assert.equal(tazkiraPhotoAspect, 1);
  for (const preview of [
    { width: 280, height: 373 },
    { width: 680, height: 460 },
    { width: 600, height: 180 },
  ]) {
    const guide = recordPhotoGuide(preview);
    assert.ok(guide.x > 0 && guide.y > 0);
    assert.ok(guide.x + guide.width < preview.width);
    assert.ok(guide.y + guide.height < preview.height);
    assert.ok(Math.abs(guide.width / guide.height - recordPhotoAspect) < 1e-8);
  }
});
test("crop rounds inward so saved pixels never extend outside the square", () => {
  for (const photo of [
    { width: 4032, height: 3024 },
    { width: 3024, height: 4032 },
    { width: 1921, height: 1081 },
    { width: 480, height: 640 },
  ]) {
    for (const preview of [
      { width: 375.5, height: 460 },
      { width: 900, height: 380 },
    ]) {
      const guide = recordPhotoGuide(preview);
      const crop = recordPhotoCrop(photo, preview);
      const scale = Math.max(
        preview.width / photo.width,
        preview.height / photo.height,
      );
      const x =
        crop.originX * scale - (photo.width * scale - preview.width) / 2;
      const y =
        crop.originY * scale - (photo.height * scale - preview.height) / 2;
      assert.ok(x >= guide.x - 1e-8);
      assert.ok(y >= guide.y - 1e-8);
      assert.ok(x + crop.width * scale <= guide.x + guide.width + 1e-8);
      assert.ok(y + crop.height * scale <= guide.y + guide.height + 1e-8);
      assert.equal(crop.width, crop.height);
    }
  }
});
test("saved crop maps back to the visible guide, including hidden sensor edges", () => {
  for (const photo of [
    { width: 3024, height: 4032 },
    { width: 4032, height: 3024 },
    { width: 2160, height: 3840 },
  ]) {
    for (const preview of [
      { width: 320, height: 426 },
      { width: 680, height: 460 },
    ]) {
      const guide = recordPhotoGuide(preview);
      const crop = recordPhotoCrop(photo, preview);
      const scale = Math.max(
        preview.width / photo.width,
        preview.height / photo.height,
      );
      const offsetX = (photo.width * scale - preview.width) / 2;
      const offsetY = (photo.height * scale - preview.height) / 2;
      assert.ok(Math.abs(crop.originX * scale - offsetX - guide.x) < 1);
      assert.ok(Math.abs(crop.originY * scale - offsetY - guide.y) < 1);
      assert.ok(Math.abs(crop.width * scale - guide.width) < 1);
      assert.ok(Math.abs(crop.height * scale - guide.height) < 1);
      assert.equal(crop.width, crop.height);
      assert.ok(crop.originX >= 0 && crop.originY >= 0);
      assert.ok(crop.originX + crop.width <= photo.width);
      assert.ok(crop.originY + crop.height <= photo.height);
      assert.ok(crop.width < photo.width && crop.height < photo.height);
    }
  }
});
test("missing geometry fails instead of retaining the uncropped camera image", () => {
  for (const invalid of [0, -1, NaN, Infinity]) {
    assert.throws(
      () => recordPhotoGuide({ width: invalid, height: 400 }),
      /cameraUnavailable/,
    );
    assert.throws(
      () =>
        recordPhotoCrop(
          { width: 3024, height: invalid },
          { width: 300, height: 400 },
        ),
      /cameraUnavailable/,
    );
  }
});
