import assert from "node:assert/strict";
import { test } from "node:test";
import {
  tazkiraPhotoAspect,
  tazkiraPhotoCrop,
  tazkiraPhotoGuide,
} from "../src/domain/photo-frame";

test("card guide fits small and wide previews and keeps the same card proportions", () => {
  for (const preview of [
    { width: 280, height: 373 },
    { width: 680, height: 460 },
    { width: 600, height: 180 },
  ]) {
    const guide = tazkiraPhotoGuide(preview);
    assert.ok(guide.x > 0 && guide.y > 0);
    assert.ok(guide.x + guide.width < preview.width);
    assert.ok(guide.y + guide.height < preview.height);
    assert.ok(Math.abs(guide.width / guide.height - tazkiraPhotoAspect) < 1e-8);
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
      const guide = tazkiraPhotoGuide(preview);
      const crop = tazkiraPhotoCrop(photo, preview);
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
      () => tazkiraPhotoGuide({ width: invalid, height: 400 }),
      /cameraUnavailable/,
    );
    assert.throws(
      () =>
        tazkiraPhotoCrop(
          { width: 3024, height: invalid },
          { width: 300, height: 400 },
        ),
      /cameraUnavailable/,
    );
  }
});
