import { Directory, File, Paths } from "expo-file-system";
import { fetch } from "expo/fetch";
import type { PhotoScope } from "../domain/local-photos";
import { photoScopeKey } from "../domain/local-photos";
import { loadLocalPhotos } from "./local-photos";
import { listCloudPhotos, readCloudPhoto } from "./online-photo-api";
import type { CloudPhoto, PhotoList } from "../domain/online-photos";
import { readJobs } from "./photo-journal";
import { backend } from "../data/backend";
export async function resolvedPhotos(scope: PhotoScope, cloud?: PhotoList) {
  const session = await backend?.auth.getSession();
  if (session?.data.session?.user.id !== scope.userId)
    throw new Error("noAccess");
  const local = await loadLocalPhotos(scope);
  const result = { ...local, photos: { ...local.photos } };
  const list = cloud ?? (await listCloudPhotos(scope.shopId, scope.recordId));
  const pending = (await readJobs(scope)).filter(
    (j) => j.recordId === scope.recordId,
  );
  for (const head of list.heads) {
    if (pending.some((j) => j.slot === head.slot && j.error !== "conflict")) continue;
    if (!head.photo_id) {
      delete result.photos[head.slot];
      continue;
    }
    const photo = list.photos.find((p) => p.id === head.photo_id);
    if (!photo) continue;
    const uri = local.photos[head.slot];
    try {
      if (uri && new File(uri).info({ md5: true }).md5 === photo.md5) continue;
    } catch {}
    result.photos[head.slot] = await downloadPhoto(scope, photo);
  }
  return result;
}
export async function downloadPhoto(scope: PhotoScope, photo: CloudPhoto) {
  if (scope.shopId !== photo.shop_id || scope.recordId !== photo.record_id)
    throw new Error("noAccess");
  const dir = new Directory(Paths.cache, "online-photos", photoScopeKey(scope));
  dir.create({ intermediates: true, idempotent: true });
  const file = new File(dir, photo.id + ".jpg");
  // Reauthorize even for cached files; removed staff must not keep server access.
  const access = await readCloudPhoto(scope.shopId, photo.id);
  if (
    file.exists &&
    file.size === photo.bytes &&
    file.info({ md5: true }).md5 === photo.md5
  )
    return file.uri;
  const response = await fetch(access.url, {
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error("photoCloudUnavailable");
  const bytes = await response.bytes();
  if (bytes.length !== photo.bytes) throw new Error("photoChecksumFailed");
  file.write(bytes);
  if (file.info({ md5: true }).md5 !== photo.md5) {
    file.delete();
    throw new Error("photoChecksumFailed");
  }
  return file.uri;
}
