import type { PhotoSlot } from "./local-photos";
export interface PhotoStatus {
  entitlement: {
    shop_id: string;
    enabled: boolean;
    quota_bytes: number;
    used_bytes: number;
    reserved_bytes: number;
    enabled_at: string | null;
  };
  request: {
    id: string;
    status: "pending" | "approved" | "declined";
    note: string;
  } | null;
  pending: number;
  failed: number;
}
export interface CloudPhoto {
  id: string;
  shop_id: string;
  record_id: string;
  slot: PhotoSlot;
  uploaded_by: string;
  state: "pending" | "current" | "retained" | "purged" | "cancelled";
  bytes: number;
  md5: string;
  preview_bytes: number;
  preview_md5: string;
  base_revision: number;
  created_at: string;
  completed_at: string | null;
  delete_after: string | null;
}
export interface PhotoHead {
  slot: PhotoSlot;
  revision: number;
  photo_id: string | null;
}
export interface PhotoList {
  heads: PhotoHead[];
  photos: CloudPhoto[];
}
export interface PhotoJob {
  id: string;
  shopId: string;
  userId: string;
  recordId: string;
  slot: PhotoSlot;
  baseRevision: number;
  reason: string;
  bytes: number;
  md5: string;
  previewBytes: number;
  previewMd5: string;
  state: "waiting" | "uploading" | "failed";
  attempts: number;
  nextAttempt: number;
  error?: string;
}
export const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
export function photoState(status: PhotoStatus | null) {
  if (!status) return "photoCloudUnavailable" as const;
  if (!status.entitlement.enabled)
    return status.entitlement.enabled_at
      ? "photoUploadsPaused"
      : status.request?.status === "pending"
        ? "photoRequestPending"
        : "photoLocalOnly";
  return status.entitlement.used_bytes + status.entitlement.reserved_bytes >=
    status.entitlement.quota_bytes
    ? "photoStorageFull"
    : "photoOnlineEnabled";
}
export const terminalPhotoErrors = new Set([
  "conflict",
  "photoOwnerOnly",
  "recordVoided",
  "photoTooLarge",
  "photoChecksumFailed",
  "photoNotFound",
  "photoUploadExpired",
  "changeReasonRequired",
  "photoMissing",
]);
export function retryPhoto(
  job: PhotoJob,
  error: string,
  now = Date.now(),
): PhotoJob {
  const attempts = job.attempts + 1;
  const paused = [
    "photoUploadsPaused",
    "photoStorageFull",
    "photoRecordMissing",
    "noAccess",
    "photoCloudUnavailable",
  ].includes(error);
  return {
    ...job,
    state:
      !paused && (attempts >= 5 || terminalPhotoErrors.has(error))
        ? "failed"
        : "waiting",
    attempts: paused ? job.attempts : attempts,
    nextAttempt:
      now + (paused ? 60000 : Math.min(300000, 2000 * 2 ** attempts)),
    error,
  };
}
