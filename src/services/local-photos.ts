import { Directory, File, Paths } from "expo-file-system";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { randomUUID } from "expo-crypto";
import { Platform } from "react-native";
import { secureStorage } from "../data/secure";
import {
  isLocalPhotoFolder,
  photoCapabilities,
  encodePhotoManifest,
  decodePhotoManifest,
  photoScopeKey,
  type LocalPhotoSet,
  type PhotoScope,
  type PhotoSlot,
  type PhotoSaveOptions,
} from "../domain/local-photos";
const capabilities = photoCapabilities(Platform.OS);
export const localPhotosSupported = capabilities.attachments;
export const photoFolderSelectionSupported = capabilities.folderSelection;
let pending: Promise<unknown> = Promise.resolve();
const serial = <T>(work: () => Promise<T>) => {
  const next = pending.catch(() => {}).then(work);
  pending = next;
  return next;
};
const manifestKey = (scope: PhotoScope) =>
  "record-photos." + photoScopeKey(scope);
const folderKey = (scope: PhotoScope) =>
  "photo-folder." + photoScopeKey({ ...scope, recordId: "settings" });
export async function loadLocalPhotos(
  scope: PhotoScope,
): Promise<LocalPhotoSet> {
  const raw = await secureStorage.getItem(manifestKey(scope));
  const set = decodePhotoManifest(raw, scope, Paths.document.uri);
  const keep = new Set([
    ...Object.values(set.photos),
    ...Object.values(set.sources ?? {}),
  ]);
  const history = (set.history ?? []).filter((entry) => {
    if (Date.now() - Date.parse(entry.removedAt) < 30 * 86400000) return true;
    if (keep.has(entry.uri)) return false;
    try {
      const file = new File(entry.uri);
      if (file.exists) file.delete();
      return false;
    } catch {
      return true;
    }
  });
  if (history.length !== (set.history ?? []).length) {
    set.history = history;
    await secureStorage.setItem(
      manifestKey(scope),
      encodePhotoManifest(set, scope),
    );
  }
  return set;
}
export async function photoFolder(scope: PhotoScope) {
  if (!photoFolderSelectionSupported) return null;
  const folder = await secureStorage.getItem(folderKey(scope));
  if (folder && !isLocalPhotoFolder(folder))
    throw new Error("photoFolderLocalOnly");
  return folder;
}
export async function choosePhotoFolder(scope: PhotoScope) {
  if (!photoFolderSelectionSupported) throw new Error("photoFolderUnsupported");
  try {
    const selected = await Directory.pickDirectoryAsync();
    if (!isLocalPhotoFolder(selected.uri))
      throw new Error("photoFolderLocalOnly");
    await secureStorage.setItem(folderKey(scope), selected.uri);
    return selected.uri;
  } catch (error) {
    if (/cancel/i.test(String(error))) return photoFolder(scope);
    throw error;
  }
}
export async function resetPhotoFolder(scope: PhotoScope) {
  await secureStorage.removeItem(folderKey(scope));
}
export async function pickRecordPhoto(source: "camera" | "library") {
  if (!localPhotosSupported) throw new Error("localPhotosNativeOnly");
  let picker: typeof import("expo-image-picker");
  try {
    picker = await import("expo-image-picker");
  } catch {
    throw new Error("photoBuildRequired");
  }
  try {
    if (source === "camera") {
      const permission = await picker.requestCameraPermissionsAsync();
      if (!permission.granted) throw new Error("photoCameraPermission");
    }
    // The system picker grants access to the selected asset, including limited
    // iOS libraries. Do not demand full photo-library permission.
    const options = {
      mediaTypes: ["images"] as "images"[],
      quality: 1,
      exif: false,
      base64: false,
    };
    const result =
      source === "camera"
        ? await picker.launchCameraAsync(options)
        : await picker.launchImageLibraryAsync(options);
    if (result.canceled) return null;
    if (!result.assets?.[0]?.uri) throw new Error("photoPickFailed");
    return result.assets[0].uri;
  } catch (error) {
    const message = String(error);
    if (/cancel/i.test(message)) return null;
    if (/permission|denied|restricted/i.test(message))
      throw new Error(
        source === "camera"
          ? "photoCameraPermission"
          : "photoLibraryPermission",
      );
    throw new Error("photoPickFailed");
  }
}
function deleteCache(uri: string) {
  if (uri.startsWith(Paths.cache.uri)) {
    const file = new File(uri);
    if (file.exists) file.delete();
  }
}
export const discardPickedPhoto = async (uri: string) => {
  deleteCache(uri);
};
export function saveLocalPhoto(
  scope: PhotoScope,
  slot: PhotoSlot,
  uri: string,
  options: PhotoSaveOptions = {},
) {
  return serial(async () => {
    let normalized: string | undefined;
    let target: File | undefined;
    let sourceTarget: File | undefined;
    let committed = false;
    try {
      const current = await loadLocalPhotos(scope);
      let directory: Directory;
      if (current.folder) {
        directory = new Directory(current.folder);
        if (!isLocalPhotoFolder(current.folder))
          directory.create({ intermediates: true, idempotent: true });
      } else {
        const chosen = await photoFolder(scope);
        if (chosen) {
          const parent = new Directory(chosen);
          const name = "MR-" + photoScopeKey(scope);
          // A failed first write can leave the scoped SAF directory behind.
          // Reuse it rather than creating a provider-renamed duplicate.
          directory =
            parent
              .list()
              .find(
                (entry): entry is Directory =>
                  entry instanceof Directory &&
                  decodeURIComponent(entry.uri).endsWith("/" + name),
              ) ?? parent.createDirectory(name);
        } else {
          directory = new Directory(
            Paths.document,
            "record-photos",
            photoScopeKey(scope),
          );
          directory.create({ intermediates: true, idempotent: true });
        }
      }
      const context = ImageManipulator.manipulate(uri);
      try {
        const image = await context.renderAsync();
        try {
          normalized = (
            await image.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 })
          ).uri;
        } finally {
          image.release();
        }
      } finally {
        context.release();
      }
      target = directory.createFile(
        slot + "-" + randomUUID() + ".jpg",
        "image/jpeg",
      );
      // SDK 57 copy(overwrite) deletes an existing SAF document before writing,
      // invalidating its content URI. Write into the freshly created document.
      target.write(await new File(normalized).bytes());
      if (!target.exists || !target.size) throw new Error("photoSaveFailed");
      let sourceUri = options.sourceUri;
      if (
        sourceUri &&
        sourceUri !== uri &&
        sourceUri !== current.sources?.[slot] &&
        sourceUri !== current.photos[slot]
      ) {
        const sourceContext = ImageManipulator.manipulate(sourceUri);
        try {
          const sourceImage = await sourceContext.renderAsync();
          try {
            const saved = await sourceImage.saveAsync({
              format: SaveFormat.JPEG,
              compress: 0.95,
            });
            try {
              sourceTarget = directory.createFile(
                slot + "-" + randomUUID() + ".jpg",
                "image/jpeg",
              );
              sourceTarget.write(await new File(saved.uri).bytes());
              if (!sourceTarget.size) throw new Error("photoSaveFailed");
            } finally {
              deleteCache(saved.uri);
            }
          } finally {
            sourceImage.release();
          }
        } finally {
          sourceContext.release();
        }
        sourceUri = sourceTarget.uri;
      } else if (
        !sourceUri ||
        (sourceUri === uri &&
          sourceUri !== current.sources?.[slot] &&
          sourceUri !== current.photos[slot])
      )
        sourceUri = target.uri;
      const history = [...(current.history ?? [])];
      const oldFiles = new Set(
        [current.photos[slot], current.sources?.[slot]].filter(
          (p): p is string => !!p && p !== sourceUri,
        ),
      );
      if (options.preserveHistory)
        for (const previous of oldFiles)
          history.push({
            slot,
            uri: previous,
            removedAt: new Date().toISOString(),
          });
      const next: LocalPhotoSet = {
        folder: directory.uri,
        photos: { ...current.photos, [slot]: target.uri },
        sources: { ...current.sources, [slot]: sourceUri },
        history,
      };
      // Server records authorization before the local pointer changes. A storage
      // failure may leave an authorization event, never an unaudited replacement.
      await options.beforeCommit?.();
      await secureStorage.setItem(
        manifestKey(scope),
        encodePhotoManifest(next, scope),
      );
      committed = true;
      if (!options.preserveHistory)
        for (const previous of oldFiles) {
          try {
            const file = new File(previous);
            if (file.exists) file.delete();
          } catch {}
        }
      return next;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const actionable = ["conflict", "noAccess", "photoOwnerOnly", "changeReasonRequired", "recordVoided"].find(key => message.includes(key));
      throw new Error(actionable ?? "photoSaveFailed");
    } finally {
      if (!committed && sourceTarget) {
        try {
          sourceTarget.delete();
        } catch {}
      }
      if (!committed && target) {
        try {
          target.delete();
        } catch {}
      }
      if (normalized) {
        try {
          deleteCache(normalized);
        } catch {}
      }
      try {
        if (committed) deleteCache(uri);
      } catch {}
    }
  });
}
export function removeLocalPhoto(
  scope: PhotoScope,
  slot: PhotoSlot,
  options: PhotoSaveOptions = {},
) {
  return serial(async () => {
    const current = await loadLocalPhotos(scope);
    const oldFiles = new Set(
      [current.photos[slot], current.sources?.[slot]].filter(
        (v): v is string => !!v,
      ),
    );
    const next: LocalPhotoSet = {
      ...current,
      photos: { ...current.photos },
      sources: { ...current.sources },
      history: [...(current.history ?? [])],
    };
    delete next.photos[slot];
    delete next.sources![slot];
    if (options.preserveHistory)
      for (const uri of oldFiles)
        next.history!.push({ slot, uri, removedAt: new Date().toISOString() });
    await options.beforeCommit?.();
    try {
      await secureStorage.setItem(
        manifestKey(scope),
        encodePhotoManifest(next, scope),
      );
    } catch {
      throw new Error("photoRemoveFailed");
    }
    if (!options.preserveHistory)
      for (const uri of oldFiles) {
        try {
          const file = new File(uri);
          if (file.exists) file.delete();
        } catch {
          await secureStorage.setItem(
            manifestKey(scope),
            encodePhotoManifest(current, scope),
          );
          throw new Error("photoRemoveFailed");
        }
      }
    return next;
  });
}

export function discardDraftPhotos(scope: PhotoScope) {
  return serial(async () => {
    const set = await loadLocalPhotos(scope);
    const files = new Set([
      ...Object.values(set.photos),
      ...Object.values(set.sources ?? {}),
      ...(set.history ?? []).map((h) => h.uri),
    ]);
    for (const uri of files) {
      if (uri) {
        const f = new File(uri);
        if (f.exists) f.delete();
      }
    }
    await secureStorage.removeItem(manifestKey(scope));
  });
}
