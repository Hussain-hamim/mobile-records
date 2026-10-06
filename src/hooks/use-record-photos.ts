import { useCallback, useEffect, useState } from "react";
import { useApp } from "../state/app-context";
import { resolvedPhotos } from "../services/resolved-photos";
import { listCloudPhotos } from "../services/online-photo-api";
import { subscribePhotoChanges } from "../services/photo-events";
import type { PhotoList } from "../domain/online-photos";
import type { LocalPhotoSet } from "../domain/local-photos";
export function useRecordPhotos(recordId: string, saved: boolean) {
  const app = useApp();
  const shopId = app.membership?.shopId,
    userId = app.membership?.userId;
  const [cloud, setCloud] = useState<PhotoList>({ heads: [], photos: [] }),
    [images, setImages] = useState<LocalPhotoSet["photos"]>({});
  const [error, setError] = useState("");
  const load = useCallback(
    async (isCurrent: () => boolean) => {
      if (!shopId || !userId || !saved || app.demo) return;
      try {
        const list = await listCloudPhotos(shopId, recordId);
        if (!isCurrent()) return;
        setCloud(list);
        const resolved = await resolvedPhotos(
          { shopId, userId, recordId },
          list,
        );
        if (isCurrent()) {
          setImages(resolved.photos);
          setError("");
        }
      } catch {
        if (isCurrent()) setError("photoCloudUnavailable");
      }
    },
    [shopId, userId, recordId, saved, app.demo],
  );
  useEffect(() => {
    let current = true;
    let sequence = 0;
    const run = () => {
      const id = ++sequence;
      void load(() => current && sequence === id);
    };
    run();
    const off = subscribePhotoChanges(run);
    return () => {
      current = false;
      off();
    };
  }, [load]);
  return { cloud, images, error };
}
