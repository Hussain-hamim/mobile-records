import type { PhotoScope, LocalPhotoSet } from "../domain/local-photos";
import type { PhotoList } from "../domain/online-photos";
import { listCloudPhotos, readCloudPhoto } from "./online-photo-api";
import { backend } from "../data/backend";
export async function resolvedPhotos(
  scope: PhotoScope,
  cloud?: PhotoList,
): Promise<LocalPhotoSet> {
  const session = await backend?.auth.getSession();
  if (session?.data.session?.user.id !== scope.userId)
    throw new Error("noAccess");
  const list = cloud ?? (await listCloudPhotos(scope.shopId, scope.recordId));
  const photos: LocalPhotoSet["photos"] = {};
  for (const head of list.heads) {
    const photo = list.photos.find((p) => p.id === head.photo_id);
    if (!photo) continue;
    const access = await readCloudPhoto(scope.shopId, photo.id);
    const response = await fetch(access.url, { cache: "no-store" });
    if (!response.ok) throw new Error("photoCloudUnavailable");
    const blob = await response.blob();
    if (blob.size !== photo.bytes) throw new Error("photoChecksumFailed");
    photos[head.slot] = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error("photoCloudUnavailable"));
      reader.readAsDataURL(blob);
    });
  }
  return { photos };
}
