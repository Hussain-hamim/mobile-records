import { mrzPhotoRegion } from "./mrz-capture";
export const imeiGuide = { x: 0.08, y: 0.25, width: 0.84, height: 0.5 };
export const imeiPhotoRegion = (
  photo: { width: number; height: number },
  preview: { width: number; height: number },
) => mrzPhotoRegion(photo, preview, imeiGuide);
