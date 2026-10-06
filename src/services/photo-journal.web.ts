import type { PhotoJob } from "../domain/online-photos";
import type { PhotoScope, PhotoSlot } from "../domain/local-photos";
import type { PhotoUpload } from "./online-photo-api";
export async function writeJob(_job: PhotoJob, _requireExisting = false) {
  return false;
}
export async function readJobs(
  _scope: Pick<PhotoScope, "shopId" | "userId">,
): Promise<PhotoJob[]> {
  return [];
}
export async function removeJob(_job: PhotoJob) {}
export async function createJob(
  _scope: PhotoScope,
  _slot: PhotoSlot,
  _baseRevision: number,
  _reason: string,
): Promise<PhotoJob | null> {
  return null;
}
export async function uploadJobFile(
  _job: PhotoJob,
  _upload: PhotoUpload,
  _preview: boolean,
  _signal: AbortSignal,
) {
  throw new Error("localPhotosNativeOnly");
}

export async function localPhotoDigest(
  _scope: PhotoScope,
  _slot: PhotoSlot,
): Promise<string | null> {
  return null;
}
export async function cleanJournal(
  _scope: Pick<PhotoScope, "shopId" | "userId">,
) {}
