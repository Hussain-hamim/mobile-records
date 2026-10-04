import { scanFromURLAsync } from "expo-camera";
import type { ScanPhoto } from "../domain/tazkira";
import { imeiPhotoRegion } from "../domain/imei-frame";
import { extractImeis } from "../domain/validation";
import { canRecognize, cropScan, deleteScans, recognize } from "./scanning";

/** The full camera frame is never passed to a barcode or text recognizer. */
export async function captureImeiRegion(
  takePicture: () => Promise<ScanPhoto>,
  preview: { width: number; height: number },
): Promise<ScanPhoto> {
  const photo = await takePicture();
  let cropped: ScanPhoto | undefined;
  try {
    cropped = await cropScan(
      photo.uri,
      photo.width,
      photo.height,
      imeiPhotoRegion(photo, preview),
      1800,
    );
    await deleteScans([photo.uri]);
    return cropped;
  } catch (error) {
    await deleteScans([photo.uri, ...(cropped ? [cropped.uri] : [])]).catch(() => {});
    throw error;
  }
}

export async function readImeiBarcodes(croppedUri: string) {
  const results = await scanFromURLAsync(croppedUri, [
    "code128",
    "code39",
    "code93",
    "qr",
    "datamatrix",
  ]);
  // Geometry from barcode callbacks is optional; the input is already restricted
  // to the guide, so missing/collapsed corner points cannot reject a valid code.
  return [
    ...new Set(
      results.flatMap((result) => extractImeis(result.raw || result.data)),
    ),
  ];
}

export async function readImeiCrop(
  croppedUri: string,
  isActive: () => boolean = () => true,
) {
  let values: string[] = [];
  try {
    values = await readImeiBarcodes(croppedUri);
  } catch {
    if (!canRecognize) throw new Error("cameraUnavailable");
  }
  if (values.length || !isActive()) return values;
  if (!canRecognize) throw new Error("nativeRequired");
  const result = await recognize(croppedUri, "imei");
  return isActive() ? extractImeis(result.text) : [];
}
