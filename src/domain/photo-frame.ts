export const recordPhotoAspect = 1;
export const customerPhotoAspect = recordPhotoAspect;
export const tazkiraPhotoAspect = recordPhotoAspect;
type Size = { width: number; height: number };

/** Square guide in actual preview pixels, shared by the overlay and crop. */
export function recordPhotoGuide(preview: Size) {
  if (
    ![preview.width, preview.height].every((n) => Number.isFinite(n) && n > 0)
  )
    throw new Error("cameraUnavailable");
  const width = Math.min(preview.width * 0.88, preview.height * 0.8);
  const height = width;
  return {
    x: (preview.width - width) / 2,
    y: (preview.height - height) / 2,
    width,
    height,
  };
}

/** Camera preview uses centered aspect-fill; include hidden photo edges. */
export function recordPhotoCrop(photo: Size, preview: Size) {
  if (![photo.width, photo.height].every((n) => Number.isInteger(n) && n > 0))
    throw new Error("cameraUnavailable");
  const guide = recordPhotoGuide(preview);
  const scale = Math.max(
    preview.width / photo.width,
    preview.height / photo.height,
  );
  const offsetX = (photo.width * scale - preview.width) / 2;
  const offsetY = (photo.height * scale - preview.height) / 2;
  const originX = Math.ceil((guide.x + offsetX) / scale);
  const originY = Math.ceil((guide.y + offsetY) / scale);
  const edge = Math.min(
    Math.floor((guide.x + guide.width + offsetX) / scale) - originX,
    Math.floor((guide.y + guide.height + offsetY) / scale) - originY,
    photo.width - originX,
    photo.height - originY,
  );
  if (edge < 1) throw new Error("cameraUnavailable");
  return { originX, originY, width: edge, height: edge };
}
