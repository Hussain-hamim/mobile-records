import { readAfghanMrz, type MrzResult } from "./mrz";

export type MrzRegion = [number, number, number, number];
export const fullImage: MrzRegion = [0, 0, 1, 1];
// Fractional camera-preview coordinates, shared with the visible guide.
export const mrzGuide = { x: 0.04, y: 0.34, width: 0.92, height: 0.32 };
// The printed-details scan includes the card face, still excluding its surroundings.
export const printedIdGuide = { x: 0.04, y: 0.2, width: 0.92, height: 0.6 };

export function mrzPhotoRegion(
  photo: { width: number; height: number },
  preview: { width: number; height: number },
  guide = mrzGuide,
): MrzRegion {
  if (
    ![photo.width, photo.height, preview.width, preview.height].every(
      (n) => Number.isFinite(n) && n > 0,
    )
  )
    throw new Error("cameraUnavailable");
  // Expo Camera's default Android preview uses FILL_CENTER. Convert the guide
  // back into full-resolution photo coordinates, including hidden edge pixels.
  const scale = Math.max(
    preview.width / photo.width,
    preview.height / photo.height,
  );
  const offsetX = (photo.width * scale - preview.width) / 2;
  const offsetY = (photo.height * scale - preview.height) / 2;
  return [
    (guide.x * preview.width + offsetX) / scale / photo.width,
    (guide.y * preview.height + offsetY) / scale / photo.height,
    (guide.width * preview.width) / scale / photo.width,
    (guide.height * preview.height) / scale / photo.height,
  ];
}

// Use the same integer rectangle for the preview crop and every OCR pass.
// Reject missing geometry instead of accidentally recognizing the whole photo.
export function mrzPixelCrop(
  photo: { width: number; height: number },
  region: MrzRegion,
) {
  const [x, y, width, height] = region;
  if (
    ![photo.width, photo.height].every((n) => Number.isInteger(n) && n > 0) ||
    !region.every(Number.isFinite) ||
    x < 0 ||
    y < 0 ||
    width <= 0 ||
    height <= 0 ||
    x + width > 1 + 1e-8 ||
    y + height > 1 + 1e-8
  )
    throw new Error("cameraUnavailable");
  const originX = Math.floor(x * photo.width);
  const originY = Math.floor(y * photo.height);
  return {
    originX,
    originY,
    width:
      Math.min(photo.width, Math.ceil((x + width) * photo.width)) - originX,
    height:
      Math.min(photo.height, Math.ceil((y + height) * photo.height)) - originY,
  };
}

export async function readMrzImage(
  readPass: (pass: number, region: MrzRegion) => Promise<string>,
  region: MrzRegion = fullImage,
  isActive: () => boolean = () => true,
): Promise<MrzResult | null> {
  const candidates: string[] = [];
  let failure: MrzResult = { ok: false, error: "mrzNotFound" };
  // Raw MRZ first, then deskew + adaptive threshold, finally automatic layout.
  // Every pass stays inside the selection, including the final layout fallback.
  // Never run expensive fallbacks after a successful read or cancellation.
  for (const pass of [0, 1, 2]) {
    if (!isActive()) return null;
    const text = await readPass(pass, region);
    if (!isActive()) return null;
    candidates.push(text);
    const result = readAfghanMrz(candidates);
    if (result.ok || result.error === "mrzAmbiguous") return result;
    if (result.error !== "mrzNotFound") failure = result;
  }
  return failure;
}
