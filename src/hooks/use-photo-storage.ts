import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { AppState, Platform } from "react-native";
import * as Network from "expo-network";
import type { Membership } from "../domain/models";
import type { PhotoSlot } from "../domain/local-photos";
import { photoSlots } from "../domain/local-photos";
import {
  retryPhoto,
  type PhotoJob,
  type PhotoStatus,
} from "../domain/online-photos";
import {
  completePhoto,
  listCloudPhotos,
  preparePhoto,
  storageStatus,
  photoRequest,
} from "../services/online-photo-api";
import {
  cleanJournal,
  localPhotoDigest,
  createJob,
  readJobs,
  removeJob,
  uploadJobFile,
  writeJob,
} from "../services/photo-journal";
import {
  subscribePhotoChanges,
  notifyPhotoChanges,
  stopPhotoWork,
  subscribePhotoStop,
} from "../services/photo-events";
import { backend } from "../data/backend";

export function usePhotoStorage(
  membership: Membership | null,
  ready: boolean,
  demo: boolean,
) {
  const shopId = membership?.shopId,
    userId = membership?.userId;
  const member = useMemo(
    () => (shopId && userId ? { shopId, userId } : null),
    [shopId, userId],
  );
  const [status, setStatus] = useState<PhotoStatus | null>(null),
    [jobs, setJobs] = useState<PhotoJob[]>([]),
    [error, setError] = useState("");
  const session = useRef(0),
    busy = useRef(false),
    controllers = useRef(new Map<string, AbortController>()),
    enqueueLock = useRef(Promise.resolve());
  const visibleStatus = status?.entitlement.shop_id === shopId ? status : null;
  const statusRef = useRef(visibleStatus);
  statusRef.current = visibleStatus;
  const refresh = useCallback(async () => {
    if (!member || !ready || demo) return;
    const epoch = session.current;
    try {
      await cleanJournal(member);
      const [next, pending] = await Promise.all([
        storageStatus(member.shopId),
        readJobs(member),
      ]);
      if (epoch !== session.current) return;
      setStatus(next);
      setJobs(pending);
      setError("");
    } catch {
      if (epoch === session.current) setError("photoCloudUnavailable");
    }
  }, [member, ready, demo]); // Membership profile changes don't restart uploads.
  const pump = useCallback(async () => {
    if (
      !member ||
      !ready ||
      demo ||
      Platform.OS === "web" ||
      busy.current ||
      AppState.currentState !== "active"
    )
      return;
    busy.current = true;
    const epoch = session.current;
    try {
      const pending = await readJobs(member);
      if (epoch !== session.current) return;
      setJobs(pending);
      const due = pending
        .filter((j) => j.state !== "failed" && j.nextAttempt <= Date.now())
        .slice(0, 2);
      if (!due.length) return;
      const grant = await storageStatus(member.shopId);
      if (epoch !== session.current) return;
      setStatus(grant);
      if (!grant.entitlement.enabled) return;
      await Promise.all(
        due.map(async (job) => {
          const controller = new AbortController();
          controllers.current.set(job.id, controller);
          const alive = () =>
            epoch === session.current && !controller.signal.aborted;
          const timer = setTimeout(() => controller.abort(), 120000);
          try {
            if (!alive()) return;
            if (!(await writeJob({ ...job, state: "uploading" }, true))) return;
            notifyPhotoChanges();
            const prepared = await preparePhoto(job);
            if (!alive()) return;
            if (prepared.photo.state !== "current") {
              await uploadJobFile(
                job,
                prepared.upload!,
                false,
                controller.signal,
              );
              if (!alive()) return;
              await uploadJobFile(
                job,
                prepared.preview!,
                true,
                controller.signal,
              );
              if (!alive()) return;
              await completePhoto(job);
              if (!alive()) return;
            }
            await removeJob(job);
            notifyPhotoChanges();
          } catch (e) {
            if (epoch === session.current) {
              const code =
                e instanceof Error &&
                /^(photo\w+|noAccess|conflict|recordVoided|changeReasonRequired)$/.test(
                  e.message,
                )
                  ? e.message
                  : "photoUploadFailed";
              // A cancelled/superseded job must not be resurrected.
              if (!controller.signal.aborted) {
                await writeJob(retryPhoto(job, code), true);
                notifyPhotoChanges();
                if (
                  [
                    "photoUploadFailed",
                    "photoChecksumFailed",
                    "photoUploadIncomplete",
                    "photoMissing",
                    "conflict",
                    "photoUploadExpired",
                  ].includes(code)
                )
                  void photoRequest("failed", {
                    shopId: job.shopId,
                    id: job.id,
                    code,
                  }).catch(() => {});
              }
            }
          } finally {
            clearTimeout(timer);
            controllers.current.delete(job.id);
          }
        }),
      );
    } catch {
      if (epoch === session.current) setError("photoCloudUnavailable");
    } finally {
      busy.current = false;
      const pending = await readJobs(member);
      if (epoch === session.current) setJobs(pending);
    }
  }, [member, ready, demo]);
  useEffect(() => {
    session.current++;
    const running = controllers.current;
    // These callbacks load external state asynchronously; they do not synchronously set state.
    const initial = setTimeout(() => {
      void refresh();
      void pump();
    }, 0);
    const timer = setInterval(() => void pump(), 15000);
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void refresh();
        void pump();
      } else stopPhotoWork();
    });
    const net = Network.addNetworkStateListener((state) => {
      if (state.isConnected) {
        void refresh();
        void pump();
      }
    });
    const stop = subscribePhotoStop(() => {
      session.current++;
      for (const c of controllers.current.values()) c.abort();
    });
    const changed = subscribePhotoChanges(() => {
      const epoch = session.current;
      if (member)
        void readJobs(member).then((j) => {
          if (epoch === session.current) setJobs(j);
        });
    });
    return () => {
      stopPhotoWork();
      clearTimeout(initial);
      clearInterval(timer);
      app.remove();
      net.remove();
      stop();
      changed();
      for (const c of running.values()) c.abort();
    };
  }, [refresh, pump, member]);
  const enqueue = useCallback(
    (recordId: string, slot?: PhotoSlot, reason = "", baseRevision = 0) => {
      const task = enqueueLock.current
        .catch(() => {})
        .then(async () => {
          if (!member || demo || !ready) return;
          const grant =
            statusRef.current ??
            (await storageStatus(member.shopId).catch(() => null));
          if (!grant?.entitlement.enabled && !grant?.entitlement.enabled_at)
            return;
          const epoch = session.current;
          for (const key of slot ? [slot] : photoSlots) {
            const old = (await readJobs(member)).filter(
              (j) => j.recordId === recordId && j.slot === key,
            );
            const digest = await localPhotoDigest({ ...member, recordId }, key);
            if (!digest) continue;
            if (
              old.some(
                (j) =>
                  j.md5 === digest &&
                  !(j.error === "conflict" && baseRevision > j.baseRevision),
              )
            )
              continue;
            // Finalize and backfill never enqueue a second copy of an already published image.
            const cloud = await listCloudPhotos(member.shopId, recordId).catch(
              () => null,
            );
            if (
              cloud?.photos.some(
                (p) =>
                  p.state === "current" && p.slot === key && p.md5 === digest,
              )
            )
              continue;
            if (
              !slot &&
              cloud?.heads.some((h) => h.slot === key && h.revision > 0)
            )
              continue;
            for (const j of old) {
              controllers.current.get(j.id)?.abort();
              await removeJob(j);
            }
            if (epoch !== session.current) return;
            try {
              await createJob(
                { ...member, recordId },
                key,
                baseRevision,
                reason,
              );
            } catch (e) {
              setError(e instanceof Error ? e.message : "photoUploadFailed");
            }
          }
          notifyPhotoChanges();
          void pump();
        })
        .catch((e) =>
          setError(
            e instanceof Error && e.message === "photoTooLarge"
              ? e.message
              : "photoUploadFailed",
          ),
        );
      enqueueLock.current = task;
      return task;
    },
    [member, ready, demo, pump],
  );
  const discard = useCallback(
    async (recordId: string, slot?: PhotoSlot) => {
      if (!member) return;
      for (const job of await readJobs(member))
        if (job.recordId === recordId && (!slot || job.slot === slot)) {
          controllers.current.get(job.id)?.abort();
          await removeJob(job);
        }
      notifyPhotoChanges();
    },
    [member],
  );
  async function retry() {
    if (!member) return;
    for (const job of await readJobs(member))
      if (
        ["photoUploadExpired", "photoChecksumFailed"].includes(job.error ?? "")
      ) {
        const digest = await localPhotoDigest(
          { ...member, recordId: job.recordId },
          job.slot,
        );
        if (digest !== job.md5) continue;
        await createJob(
          { ...member, recordId: job.recordId },
          job.slot,
          job.baseRevision,
          job.reason,
        );
        await removeJob(job);
      } else if (job.error !== "conflict")
        await writeJob({
          ...job,
          state: "waiting",
          attempts: 0,
          nextAttempt: 0,
          error: undefined,
        });
    await refresh();
    void pump();
  }
  async function backfill() {
    if (
      !member ||
      !backend ||
      Platform.OS === "web" ||
      !statusRef.current?.entitlement.enabled
    )
      return;
    const epoch = session.current;
    let cursor = "";
    for (;;) {
      let query = backend
        .from("records")
        .select("id")
        .eq("shop_id", member.shopId)
        .order("id")
        .limit(50);
      if (cursor) query = query.gt("id", cursor);
      const { data, error } = await query;
      if (error) throw new Error("photoCloudUnavailable");
      if (epoch !== session.current) return;
      for (const record of data ?? []) {
        const grant = statusRef.current?.entitlement;
        const queued = (await readJobs(member)).reduce(
          (n, j) => n + j.bytes + j.previewBytes,
          0,
        );
        if (!grant?.enabled || grant.used_bytes + queued >= grant.quota_bytes) {
          setError("photoStorageFull");
          return;
        }
        const cloud = await listCloudPhotos(member.shopId, record.id);
        if (epoch !== session.current) return;
        for (const slot of photoSlots)
          if (!cloud.heads.some((h) => h.slot === slot && h.revision > 0))
            await enqueue(record.id, slot, "Backfill from this device");
        cursor = record.id;
      }
      if (!data || data.length < 50) break;
    }
    await refresh();
    void pump();
  }
  async function requestActivation() {
    if (member) {
      await photoRequest("request", { shopId: member.shopId });
      await refresh();
    }
  }
  return {
    status: visibleStatus,
    jobs: jobs.filter((j) => j.shopId === shopId && j.userId === userId),
    error,
    refresh,
    enqueue,
    discard,
    retry,
    backfill,
    requestActivation,
    pump,
  };
}
