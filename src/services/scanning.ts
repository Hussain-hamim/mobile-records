import { requireOptionalNativeModule } from "expo-modules-core";
import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import {
  documentCandidates,
  consolidateCandidates,
  mrzBand,
  validCorners,
  type CardCorners,
  type ScanPhoto,
  type OcrDocument,
  type ScanCandidate,
} from "../domain/tazkira";
import { readAfghanMrz } from "../domain/mrz";
import type { Language } from "../domain/models";
import { extractPrintedPerson } from "../domain/printed-id";
import {
  readMrzImage,
  fullImage,
  mrzPixelCrop,
  type MrzRegion,
} from "../domain/mrz-capture";
const native = requireOptionalNativeModule<{
  rectifyCard?(uri: string, corners: number[][]): Promise<ScanPhoto>;
  readPrintedPass?(
    uri: string,
    language: string,
    pass: number,
  ): Promise<OcrDocument>;
  recognize(
    uri: string,
    mode: string,
  ): Promise<{ text: string; confidence: number }>;
  readMrzPass?(uri: string, pass: number, region: MrzRegion): Promise<string>;
  readPrintedId?(
    uri: string,
    language: string,
  ): Promise<{ text: string; confidence: number }>;
}>("RecordOcr");
export const canRecognize = !!native;
export const canReadMrz = !!native?.readMrzPass;
export const canReadPrintedId = !!native?.readPrintedId;
export async function recognizePrintedId(uri: string, language: Language) {
  if (!native?.readPrintedId) throw new Error("printedIdNativeRequired");
  const result = await native.readPrintedId(uri, language);
  if (result.confidence < 45) throw new Error("printedIdNotFound");
  const fields = extractPrintedPerson(result.text, language);
  if (!Object.keys(fields).length) throw new Error("printedIdNotFound");
  return fields;
}
const scans = () => new Directory(Paths.cache, "record-scans");
export async function cleanupScans() {
  for (const name of [
    "record-scans",
    "Camera",
    "ImageManipulator",
    "ImagePicker",
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
  // SDK 57 moves asynchronously. Keep the source alive until the move finishes,
  // and let capture's error handler receive failures before cleanup or OCR runs.
  await new File(uri).move(target);
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
  return transformScan(uri, (context) => {
    if (action === "rotate") context.rotate(90);
    else context.crop(mrzPixelCrop({ width, height }, [0.05, 0.05, 0.9, 0.9]));
  });
}

export async function cropScan(
  uri: string,
  width: number,
  height: number,
  region: MrzRegion,
  maxDimension?: number,
) {
  const crop = mrzPixelCrop({ width, height }, region);
  return transformScan(uri, (context) => {
    context.crop(crop);
    if (maxDimension && Math.max(crop.width, crop.height) > maxDimension) {
      context.resize(
        crop.width >= crop.height
          ? { width: maxDimension }
          : { height: maxDimension },
      );
    }
  });
}

async function transformScan(
  uri: string,
  transform: (context: ReturnType<typeof ImageManipulator.manipulate>) => void,
) {
  const context = ImageManipulator.manipulate(uri);
  try {
    transform(context);
    const image = await context.renderAsync();
    try {
      const result = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: 1,
      });
      try {
        return { ...result, uri: await keepScan(result.uri) };
      } catch (error) {
        await deleteScans([result.uri]);
        throw error;
      }
    } finally {
      image.release();
    }
  } finally {
    context.release();
  }
}
export async function recognize(uri: string, mode: "imei") {
  if (!native) throw new Error("nativeRequired");
  return native.recognize(uri, mode);
}
export async function recognizeMrz(
  uri: string,
  region: MrzRegion = fullImage,
  isActive: () => boolean = () => true,
) {
  const reader = native;
  if (!reader?.readMrzPass) throw new Error("mrzNativeRequired");
  return readMrzImage(
    async (pass, crop) => {
      const start = Date.now();
      const text = await reader.readMrzPass!(uri, pass, crop);
      if (__DEV__)
        console.info("[MRZ] recognition pass", {
          pass,
          elapsedMs: Date.now() - start,
          lineLengths: text
            .split(/\r?\n/)
            .map((line) => line.replace(/\s/g, "").length)
            .filter(Boolean),
        });
      return text;
    },
    region,
    isActive,
  );
}

export const canReadCard =
  !!native?.rectifyCard && !!native?.readPrintedPass && canReadMrz;
export async function rectifyCard(
  uri: string,
  corners: CardCorners,
): Promise<ScanPhoto> {
  if (!validCorners(corners)) throw new Error("invalidCardCorners");
  if (!native?.rectifyCard) throw new Error("printedIdNativeRequired");
  return native.rectifyCard(
    uri,
    corners.map((p) => [p.x, p.y]),
  );
}
export async function recognizeCard(
  uri: string,
  language: Language,
  side: "front" | "back",
  isActive: () => boolean,
): Promise<ScanCandidate[]> {
  if (!native?.readPrintedPass) throw new Error("printedIdNativeRequired");
  const candidates: ScanCandidate[] = [];
  let original: OcrDocument | undefined;
  for (const pass of [0, 1, 2]) {
    if (!isActive()) return [];
    const doc = await native.readPrintedPass(uri, language, pass);
    if (!isActive()) return [];
    if (pass === 0) original = doc;
    candidates.push(...documentCandidates(doc, language, "offline"));
  }
  if (side === "back" && original && isActive()) {
    const raw = readAfghanMrz([original.text]);
    const result = raw.ok
      ? raw
      : await recognizeMrz(uri, mrzBand(original), isActive);
    if (result?.ok)
      for (const [key, value] of Object.entries(result.fields)) {
        candidates.push({
          key: key as ScanCandidate["key"],
          value,
          source: "offline",
          confidence: 100,
          mrzChecked: true,
        });
      }
  }
  return isActive() ? consolidateCandidates(candidates, language) : [];
}
export async function scanUpload(uri: string) {
  const file = new File(uri);
  if (!file.exists || !uri.startsWith(Paths.cache.uri))
    throw new Error("onlineReadFailed");
  if (file.size > 4 * 1024 * 1024) throw new Error("scanTooLarge");
  return file.base64();
}
