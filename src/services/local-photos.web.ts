import type {
  LocalPhotoSet,
  PhotoScope,
  PhotoSlot,
  PhotoSaveOptions,
} from "../domain/local-photos";
export const localPhotosSupported = false;
export const photoFolderSelectionSupported = false;
export async function loadLocalPhotos(
  _scope: PhotoScope,
): Promise<LocalPhotoSet> {
  return { photos: {} };
}
export async function photoFolder(_scope: PhotoScope): Promise<string | null> {
  return null;
}
export async function choosePhotoFolder(
  _scope: PhotoScope,
): Promise<string | null> {
  throw new Error("localPhotosNativeOnly");
}
export async function resetPhotoFolder(_scope: PhotoScope) {}
export async function pickRecordPhoto(
  _source: "camera" | "library",
): Promise<string | null> {
  throw new Error("localPhotosNativeOnly");
}
export async function discardPickedPhoto(_uri: string) {}
export async function saveLocalPhoto(
  _scope: PhotoScope,
  _slot: PhotoSlot,
  _uri: string,
  _options?: PhotoSaveOptions,
): Promise<LocalPhotoSet> {
  throw new Error("localPhotosNativeOnly");
}
export async function removeLocalPhoto(
  _scope: PhotoScope,
  _slot: PhotoSlot,
  _options?: PhotoSaveOptions,
): Promise<LocalPhotoSet> {
  throw new Error("localPhotosNativeOnly");
}

export async function discardDraftPhotos(_scope: PhotoScope) {}
