import { FunctionsHttpError } from "@supabase/supabase-js";
import { backend } from "../data/backend";
import type {
  PhotoList,
  PhotoStatus,
  PhotoJob,
  CloudPhoto,
} from "../domain/online-photos";
export async function photoRequest<T>(
  action: string,
  body: Record<string, unknown>,
): Promise<T> {
  if (!backend) throw new Error("photoCloudUnavailable");
  const { data, error } = await backend.functions.invoke("record-photos", {
    body: { action, ...body },
    timeout: 30000,
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      const detail = await error.context.json().catch(() => ({}));
      if (typeof detail.error === "string") throw new Error(detail.error);
    }
    throw new Error("photoCloudUnavailable");
  }
  return data as T;
}
export const storageStatus = (shopId: string) =>
  photoRequest<PhotoStatus>("status", { shopId });
export const listCloudPhotos = (
  shopId: string,
  recordId: string,
  history = false,
  offset = 0,
) => photoRequest<PhotoList>("list", { shopId, recordId, history, offset });
export type PhotoUpload = { url: string; headers: Record<string, string> };
export type PreparedPhoto = {
  photo: CloudPhoto;
  upload?: PhotoUpload;
  preview?: PhotoUpload;
};
export const preparePhoto = (job: PhotoJob) =>
  photoRequest<PreparedPhoto>("prepare", { ...job });
export const completePhoto = (job: PhotoJob) =>
  photoRequest<CloudPhoto>("complete", { ...job });
export const readCloudPhoto = (shopId: string, id: string, preview = false) =>
  photoRequest<{ photo: CloudPhoto; url: string }>("read", {
    shopId,
    id,
    preview,
  });
