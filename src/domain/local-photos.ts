export const photoSlots = ["person", "idFront"] as const;
export type PhotoSlot = (typeof photoSlots)[number];
// Preserve references from older records without offering new back-photo capture.
const storedPhotoSlots = [...photoSlots, "idBack"] as const;
type StoredPhotoSlot = (typeof storedPhotoSlots)[number];
export type LocalPhotoSet = {
  folder?: string;
  sources?: Partial<Record<StoredPhotoSlot, string>>;
  history?: { slot: StoredPhotoSlot; uri: string; removedAt: string }[];
  photos: Partial<Record<StoredPhotoSlot, string>>;
};
export type PhotoScope = { shopId: string; userId: string; recordId: string };
export function photoCapabilities(platform: string) {
  return {
    attachments: platform === "android" || platform === "ios",
    folderSelection: platform === "android",
  };
}

/** Only app-created files in this exact account/shop/record can be referenced. */
function photoReference(
  value: unknown,
  scope: PhotoScope,
  slot?: StoredPhotoSlot,
) {
  if (typeof value !== "string") throw new Error("photoManifestInvalid");
  const key = photoScopeKey(scope);
  const escapedKey = key.replaceAll(".", "\\.");
  const filename = slot ? `${slot}-[a-zA-Z0-9-]+\\.jpg` : "";
  if (isLocalPhotoFolder(value)) {
    const document = decodeURIComponent(value.split("/document/")[1] ?? "");
    if (
      document.split("/").some((part) => part === "." || part === "..") ||
      !new RegExp(`/MR-${escapedKey}${slot ? "/" + filename : "/?"}$`).test(
        document,
      )
    )
      throw new Error("photoManifestInvalid");
    return value;
  }
  // Legacy manifests stored absolute file URLs. Rebase only our scoped subtree.
  const relative = value.startsWith("file://")
    ? value.slice(value.lastIndexOf("/record-photos/") + 1)
    : value;
  const expected = `record-photos/${escapedKey}${slot ? "/" + filename : "/?"}`;
  if (!new RegExp(`^${expected}$`).test(relative))
    throw new Error("photoManifestInvalid");
  return relative;
}

export function encodePhotoManifest(set: LocalPhotoSet, scope: PhotoScope) {
  const photos: LocalPhotoSet["photos"] = {};
  for (const slot of storedPhotoSlots) {
    if (set.photos[slot] !== undefined)
      photos[slot] = photoReference(set.photos[slot], scope, slot);
  }
  return JSON.stringify({
    version: 2,
    sources: set.sources
      ? Object.fromEntries(
          Object.entries(set.sources).map(([slot, uri]) => [
            slot,
            photoReference(uri, scope, slot as StoredPhotoSlot),
          ]),
        )
      : undefined,
    history: set.history?.map((entry) => ({
      ...entry,
      uri: photoReference(entry.uri, scope, entry.slot),
    })),
    folder:
      set.folder === undefined ? undefined : photoReference(set.folder, scope),
    photos,
  });
}

export function decodePhotoManifest(
  raw: string | null,
  scope: PhotoScope,
  documentUri: string,
): LocalPhotoSet {
  if (!raw) return { photos: {} };
  try {
    const stored = JSON.parse(raw);
    if (
      !stored ||
      (stored.version !== undefined &&
        stored.version !== 1 &&
        stored.version !== 2) ||
      !stored.photos ||
      typeof stored.photos !== "object" ||
      Array.isArray(stored.photos)
    )
      throw new Error();
    const resolve = (value: unknown, slot?: StoredPhotoSlot) => {
      const reference = photoReference(value, scope, slot);
      return isLocalPhotoFolder(reference)
        ? reference
        : documentUri.replace(/\/?$/, "/") + reference;
    };
    const photos: LocalPhotoSet["photos"] = {};
    for (const slot of storedPhotoSlots) {
      if (stored.photos[slot] !== undefined)
        photos[slot] = resolve(stored.photos[slot], slot);
    }
    return {
      folder: stored.folder === undefined ? undefined : resolve(stored.folder),
      photos,
      ...(stored.sources
        ? {
            sources: Object.fromEntries(
              storedPhotoSlots
                .filter((slot) => stored.sources[slot])
                .map((slot) => [slot, resolve(stored.sources[slot], slot)]),
            ),
          }
        : {}),
      ...(stored.history
        ? {
            history: stored.history.map(
              (entry: {
                slot: StoredPhotoSlot;
                uri: string;
                removedAt: string;
              }) => {
                if (
                  !storedPhotoSlots.includes(entry.slot) ||
                  !Number.isFinite(Date.parse(entry.removedAt))
                )
                  throw new Error();
                return {
                  slot: entry.slot,
                  uri: resolve(entry.uri, entry.slot),
                  removedAt: entry.removedAt,
                };
              },
            ),
          }
        : {}),
    };
  } catch {
    throw new Error("photoManifestInvalid");
  }
}
export function photoScopeKey(scope: PhotoScope) {
  const values = [scope.shopId, scope.userId, scope.recordId];
  if (!values.every((v) => /^[a-zA-Z0-9-]{1,100}$/.test(v)))
    throw new Error("Invalid photo scope");
  return values.join(".");
}
export function isLocalPhotoFolder(uri: string) {
  // Android's local-volume provider only; do not offer cloud document providers.
  return uri.startsWith(
    "content://com.android.externalstorage.documents/tree/",
  );
}

export type PhotoSaveOptions = {
  sourceUri?: string;
  preserveHistory?: boolean;
  beforeCommit?: () => Promise<void>;
};
