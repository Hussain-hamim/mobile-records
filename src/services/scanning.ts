import { requireOptionalNativeModule } from "expo-modules-core";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
const native = requireOptionalNativeModule<{
  recognize(
    uri: string,
    mode: string,
  ): Promise<{ text: string; confidence: number }>;
}>("RecordOcr");
export const canRecognize = !!native;
const scans = () => new Directory(Paths.cache, "record-scans");
export async function cleanupScans() {
  for (const name of [
    "record-scans",
    "Camera",
    "ImageManipulator",
    "form-exports",
  ]) {
    const folder = new Directory(Paths.cache, name);
    if (folder.exists) folder.delete();
  }
}
export async function keepScan(uri: string) {
  const folder = scans();
  folder.create({ idempotent: true, intermediates: true });
  const target = new File(
    folder,
    Date.now() + "-" + Math.random().toString(36).slice(2) + ".jpg",
  );
  new File(uri).move(target);
  return target.uri;
}
export async function deleteScans(uris: string[]) {
  for (const uri of new Set(uris)) {
    const file = new File(uri);
    if (file.exists && uri.startsWith(Paths.cache.uri)) file.delete();
  }
}
export async function editScan(
  uri: string,
  width: number,
  height: number,
  action: "rotate" | "crop",
) {
  const context = ImageManipulator.manipulate(uri);
  if (action === "rotate") context.rotate(90);
  else
    context.crop({
      originX: Math.round(width * 0.05),
      originY: Math.round(height * 0.05),
      width: Math.round(width * 0.9),
      height: Math.round(height * 0.9),
    });
  const image = await context.renderAsync();
  try {
    const result = await image.saveAsync({
      format: SaveFormat.JPEG,
      compress: 1,
    });
    return { ...result, uri: await keepScan(result.uri) };
  } finally {
    image.release();
    context.release();
  }
}
export async function recognize(uri: string, mode: "id" | "imei") {
  if (!native) throw new Error("nativeRequired");
  return native.recognize(uri, mode);
}
