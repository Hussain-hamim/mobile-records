import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import { fetch } from "expo/fetch";
import type { PhotoJob } from "../domain/online-photos";
import { MAX_PHOTO_BYTES } from "../domain/online-photos";
import type { PhotoScope, PhotoSlot } from "../domain/local-photos";
import { photoScopeKey } from "../domain/local-photos";
import { loadLocalPhotos } from "./local-photos";
import type { PhotoUpload } from "./online-photo-api";
const directory = (scope: Pick<PhotoScope, "shopId" | "userId">) =>
  new Directory(
    Paths.document,
    "photo-upload-journal",
    photoScopeKey({ ...scope, recordId: "queue" }),
  );
export function jobFile(job: PhotoJob, preview = false) {
  return new File(directory(job), `${job.id}${preview ? "-preview" : ""}.jpg`);
}
let serial: Promise<unknown> = Promise.resolve();
let lastStamp = 0;
export async function writeJob(job: PhotoJob, requireExisting = false) {
  const task = serial
    .catch(() => {})
    .then(() => {
      const dir = directory(job);
      dir.create({ intermediates: true, idempotent: true });
      // Append a complete snapshot before removing older snapshots. Interrupted writes
      // are ignored on recovery; the previous valid snapshot remains usable.
      const old = dir
        .list()
        .filter(
          (f) =>
            f instanceof File &&
            f.name.startsWith(job.id + ".") &&
            f.name.endsWith(".json"),
        );
      if (requireExisting && !old.length) return false;
      for (const f of old)
        lastStamp = Math.max(lastStamp, Number(f.name.split(".")[1]) || 0);
      const file = new File(
        dir,
        `${job.id}.${(lastStamp = Math.max(Date.now(), lastStamp + 1))}.${Crypto.randomUUID()}.json`,
      );
      file.write(JSON.stringify(job));
      for (const f of old) {
        try {
          f.delete();
        } catch {}
      }
      return true;
    });
  serial = task;
  return await task;
}
export async function readJobs(
  scope: Pick<PhotoScope, "shopId" | "userId">,
): Promise<PhotoJob[]> {
  await serial.catch(() => {});
  const dir = directory(scope);
  if (!dir.exists) return [];
  const jobs = new Map<string, PhotoJob>();
  for (const f of dir
    .list()
    .filter((f) => f instanceof File && f.name.endsWith(".json"))
    .sort((a, b) => a.name.localeCompare(b.name))) {
    try {
      const job = JSON.parse(await (f as File).text()) as PhotoJob;
      if (
        job.shopId === scope.shopId &&
        job.userId === scope.userId &&
        /^[a-f0-9-]{36}$/.test(job.id) &&
        /^[a-f0-9-]{36}$/.test(job.recordId) &&
        ["person", "idFront"].includes(job.slot) &&
        ["waiting", "uploading", "failed"].includes(job.state)
      )
        jobs.set(job.id, job);
    } catch {}
  }
  return [...jobs.values()];
}
export async function removeJob(job: PhotoJob) {
  const task = serial
    .catch(() => {})
    .then(() => {
      const dir = directory(job);
      if (!dir.exists) return;
      for (const f of dir.list())
        if (
          f.name.startsWith(job.id + ".") ||
          f.name === `${job.id}-preview.jpg`
        )
          try {
            f.delete();
          } catch {}
    });
  serial = task;
  await task;
}
export async function localPhotoDigest(scope: PhotoScope, slot: PhotoSlot) {
  const uri = (await loadLocalPhotos(scope)).photos[slot];
  if (!uri) return null;
  const file = new File(uri);
  if (!file.exists) return null;
  if (file.size > MAX_PHOTO_BYTES) throw new Error("photoTooLarge");
  return file.info({ md5: true }).md5 ?? null;
}
export async function createJob(
  scope: PhotoScope,
  slot: PhotoSlot,
  baseRevision: number,
  reason: string,
): Promise<PhotoJob | null> {
  const set = await loadLocalPhotos(scope);
  const uri = set.photos[slot];
  if (!uri) return null;
  const source = new File(uri);
  if (!source.exists) throw new Error("photoMissing");
  if (source.size > MAX_PHOTO_BYTES) throw new Error("photoTooLarge");
  const id = Crypto.randomUUID();
  const dir = directory(scope);
  dir.create({ intermediates: true, idempotent: true });
  const main = new File(dir, id + ".jpg");
  const preview = new File(dir, id + "-preview.jpg");
  let saved: string | undefined;
  try {
    main.write(await source.bytes());
    const ctx = ImageManipulator.manipulate(main.uri);
    ctx.resize({ width: 480 });
    try {
      const img = await ctx.renderAsync();
      try {
        saved = (
          await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.75 })
        ).uri;
      } finally {
        img.release();
      }
    } finally {
      ctx.release();
    }
    preview.write(await new File(saved).bytes());
    const md5 = main.info({ md5: true }).md5,
      previewMd5 = preview.info({ md5: true }).md5;
    if (!md5 || !previewMd5 || preview.size > 524288)
      throw new Error("photoTooLarge");
    const job: PhotoJob = {
      ...scope,
      id,
      slot,
      baseRevision,
      reason,
      bytes: main.size,
      md5,
      previewBytes: preview.size,
      previewMd5,
      state: "waiting",
      attempts: 0,
      nextAttempt: 0,
    };
    await writeJob(job);
    return job;
  } catch (error) {
    if (main.exists) main.delete();
    if (preview.exists) preview.delete();
    throw error;
  } finally {
    if (saved) {
      try {
        new File(saved).delete();
      } catch {}
    }
  }
}
export async function uploadJobFile(
  job: PhotoJob,
  upload: PhotoUpload,
  preview: boolean,
  signal: AbortSignal,
) {
  const file = jobFile(job, preview);
  if (!file.exists) throw new Error("photoMissing");
  const response = await fetch(upload.url, {
    method: "PUT",
    headers: upload.headers,
    body: file,
    signal,
  });
  // A replay of a create-only upload returns 412; completion verifies the bytes.
  if (!response.ok && response.status !== 412)
    throw new Error("photoUploadFailed");
}

export async function cleanJournal(
  scope: Pick<PhotoScope, "shopId" | "userId">,
) {
  const jobs = await readJobs(scope),
    active = new Set(jobs.map((j) => j.id));
  const dir = directory(scope);
  if (!dir.exists) return;
  for (const f of dir.list()) {
    if (!(f instanceof File)) continue;
    const id = f.name.slice(0, 36);
    if (active.has(id)) continue;
    const modified = f.info().modificationTime;
    if (modified && modified < Date.now() - 24 * 60 * 60 * 1000) {
      try {
        f.delete();
      } catch {}
    }
  }
}
