export const customerPhotoAspect = 3 / 4;
export const tazkiraPhotoAspect = 85.6 / 53.98;
type Size = { width: number; height: number };

/** Card-shaped guide in actual preview pixels, shared by the overlay and crop. */
export function tazkiraPhotoGuide(preview: Size) {
  if (
    ![preview.width, preview.height].every((n) => Number.isFinite(n) && n > 0)
  )
    throw new Error("cameraUnavailable");
  const width = Math.min(
    preview.width * 0.88,
    preview.height * 0.8 * tazkiraPhotoAspect,
  );
  const height = width / tazkiraPhotoAspect;
  return {
    x: (preview.width - width) / 2,
    y: (preview.height - height) / 2,
    width,
    height,
  };
}

/** Camera preview uses centered aspect-fill; include hidden photo edges. */
export function tazkiraPhotoCrop(photo: Size, preview: Size) {
  if (![photo.width, photo.height].every((n) => Number.isInteger(n) && n > 0))
    throw new Error("cameraUnavailable");
  const guide = tazkiraPhotoGuide(preview);
  const scale = Math.max(
    preview.width / photo.width,
    preview.height / photo.height,
  );
  const offsetX = (photo.width * scale - preview.width) / 2;
  const offsetY = (photo.height * scale - preview.height) / 2;
  const originX = Math.floor((guide.x + offsetX) / scale);
  const originY = Math.floor((guide.y + offsetY) / scale);
  return {
    originX,
    originY,
    width: Math.min(photo.width - originX, Math.round(guide.width / scale)),
    height: Math.min(photo.height - originY, Math.round(guide.height / scale)),
  };
}
