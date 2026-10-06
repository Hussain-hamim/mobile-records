import { useRecordPhotos } from "../hooks/use-record-photos";
import { photoRequest } from "../services/online-photo-api";
import { notifyPhotoChanges } from "../services/photo-events";
import { useEffect, useRef, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Pressable,
  View,
  type ViewStyle,
} from "react-native";
import {
  photoSlots,
  type LocalPhotoSet,
  type PhotoScope,
  type PhotoSlot,
} from "../domain/local-photos";
import {
  choosePhotoFolder,
  discardPickedPhoto,
  loadLocalPhotos,
  localPhotosSupported,
  photoFolderSelectionSupported,
  photoFolder,
  pickRecordPhoto,
  removeLocalPhoto,
  resetPhotoFolder,
  saveLocalPhoto,
} from "../services/local-photos";
import { useApp } from "../state/app-context";
import { customerPhotoAspect, tazkiraPhotoAspect } from "../domain/photo-frame";
import { TazkiraPhotoCapture } from "./tazkira-photo-capture";
import {
  Button,
  Card,
  Heading,
  Field,
  Disclosure,
  Icon,
  Notice,
  Row,
  Screen,
  Txt,
  colors,
  errorText,
} from "./ui";

import type { Transaction, Amendment } from "../domain/models";
import { PhotoEditor } from "./photo-editor";
import { formatDate } from "../domain/format";

type RecordPhotosProps = {
  recordId: string;
  direction: "buy" | "sell";
  editable?: boolean;
  savedRecord?: Transaction;
  onBusyChange?: (busy: boolean) => void;
  tileStyle?: ViewStyle;
};
export function RecordPhotos(props: RecordPhotosProps) {
  const { membership } = useApp();
  if (!membership) return null;
  return (
    <RecordPhotoContent
      key={`${membership.shopId}.${membership.userId}.${props.recordId}`}
      {...props}
    />
  );
}
function RecordPhotoContent({
  recordId,
  direction,
  editable = false,
  savedRecord,
  onBusyChange,
  tileStyle,
}: RecordPhotosProps) {
  const app = useApp(),
    { membership, t } = app;
  const scope: PhotoScope = {
    shopId: membership!.shopId,
    userId: membership!.userId,
    recordId,
  };
  const remote = useRecordPhotos(recordId, !!savedRecord);
  const [photos, setPhotos] = useState<LocalPhotoSet>({ photos: {} });
  const [selected, setSelected] = useState<PhotoSlot | null>(null);
  const [capturingCard, setCapturingCard] = useState(false);
  const [pending, setPending] = useState<{
    uri: string;
    sourceUri: string;
    action: "adjust" | "replace";
  } | null>(null);
  const [editorUri, setEditorUri] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [photoRevision, setPhotoRevision] = useState(0);
  const [baseId, setBaseId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const active = useRef(true),
    working = useRef(false),
    temporary = useRef(new Set<string>());
  const { shopId, userId } = scope;
  useEffect(() => {
    active.current = true;
    let current = true;
    void loadLocalPhotos({ shopId, userId, recordId })
      .then((p) => {
        if (current) setPhotos(p);
      })
      .catch((e) => {
        if (current) setError(errorText(e, t));
      });
    const files = temporary.current;
    return () => {
      current = false;
      active.current = false;
      if (!working.current)
        for (const uri of files) void discardPickedPhoto(uri).catch(() => {});
    };
  }, [shopId, userId, recordId, t]);
  const displayPhotos = { ...photos.photos, ...remote.images };
  for (const head of remote.cloud.heads)
    if (!head.photo_id) delete displayPhotos[head.slot];
  for (const job of app.onlinePhotos.jobs)
    if (
      job.recordId === recordId &&
      job.error !== "conflict" &&
      photos.photos[job.slot]
    )
      displayPhotos[job.slot] = photos.photos[job.slot];
  const label = (slot: PhotoSlot) =>
    t(
      slot === "person"
        ? direction === "buy"
          ? "sellerPhoto"
          : "buyerPhoto"
        : "idFrontPhoto",
    );
  function clearTemporary() {
    for (const uri of temporary.current)
      void discardPickedPhoto(uri).catch(() => {});
    temporary.current.clear();
    setPending(null);
    setEditorUri(null);
  }
  function close() {
    clearTemporary();
    setSelected(null);
    setRemoveConfirm(false);
  }
  async function run(work: () => Promise<LocalPhotoSet | null>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    onBusyChange?.(true);
    try {
      const next = await work();
      if (active.current && next) {
        setPhotos(next);
        if (selected) {
          if (next.photos[selected])
            await app.onlinePhotos.enqueue(
              recordId,
              selected,
              reason,
              photoRevision,
            );
          else await app.onlinePhotos.discard(recordId, selected);
        }
        clearTemporary();
        setSelected(null);
      }
    } catch (e) {
      if (active.current) setError(errorText(e, t));
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
      else
        for (const uri of temporary.current)
          void discardPickedPhoto(uri).catch(() => {});
      onBusyChange?.(false);
    }
  }
  function stage(uri: string) {
    if (!active.current) {
      void discardPickedPhoto(uri);
      return;
    }
    temporary.current.add(uri);
    setPending({ uri, sourceUri: uri, action: "replace" });
  }
  async function add(source: "camera" | "library") {
    const uri = await pickRecordPhoto(source);
    if (uri) stage(uri);
    return null;
  }
  function options(action: NonNullable<Amendment["photoChange"]>["action"]) {
    return {
      preserveHistory: !!savedRecord,
      sourceUri: pending?.sourceUri,
      beforeCommit: savedRecord
        ? async () => {
            if (membership?.role !== "owner") throw new Error("photoOwnerOnly");
            if (!reason.trim()) throw new Error("changeReasonRequired");
            if (action === "remove" && photoRevision > 0) {
              await photoRequest("remove", {
                shopId,
                recordId,
                slot: selected,
                baseRevision: photoRevision,
                reason,
              });
              notifyPhotoChanges();
            }
            await app.amend(savedRecord, reason, baseId, "photo", {
              slot: selected!,
              action,
            });
          }
        : undefined,
    };
  }
  const canEdit = editable && (!savedRecord || membership?.role === "owner");
  const previewUri =
    pending?.uri ?? (selected ? displayPhotos[selected] : undefined);
  return (
    <>
      <View style={{ marginBottom: 10 }}>
        <Row style={{ gap: 8 }}>
          {photoSlots.map((slot) => (
            <Pressable
              key={slot}
              accessibilityRole="button"
              accessibilityLabel={label(slot)}
              disabled={busy}
              onPress={() => {
                setSelected(slot);
                setPhotoRevision(
                  remote.cloud.heads.find((h) => h.slot === slot)?.revision ??
                    0,
                );
                setError("");
                setReason("");
                setRemoveConfirm(false);
                setBaseId(
                  app.amendments
                    .filter((a) => a.recordId === recordId)
                    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                    .at(-1)?.id ?? null,
                );
              }}
              style={{ flex: 1, minWidth: 0 }}
            >
              <View
                style={[
                  {
                    height: 156,
                    backgroundColor: colors.paper,
                    borderWidth: 1,
                    borderColor: colors.line,
                    borderRadius: 12,
                    overflow: "hidden",
                    justifyContent: "center",
                    alignItems: "center",
                  },
                  tileStyle,
                ]}
              >
                {displayPhotos[slot] ? (
                  <Image
                    source={{ uri: displayPhotos[slot] }}
                    resizeMode="contain"
                    style={{ width: "100%", height: "100%" }}
                  />
                ) : (
                  <Icon
                    name={
                      slot === "person"
                        ? "account-outline"
                        : "card-account-details-outline"
                    }
                    size={23}
                    color={colors.green}
                  />
                )}
              </View>
              <Txt
                size={10}
                muted
                style={{ textAlign: "center", marginTop: 3 }}
              >
                {label(slot)}
              </Txt>
              {displayPhotos[slot] ? (
                <Txt size={10} muted style={{ textAlign: "center" }}>
                  {(() => {
                    const job = app.onlinePhotos.jobs.find(
                      (j) => j.recordId === recordId && j.slot === slot,
                    );
                    if (job)
                      return t(
                        job.state === "failed"
                          ? "photoUploadFailed"
                          : job.state === "uploading"
                            ? "photoUploading"
                            : "photoWaiting",
                      );
                    return t(
                      remote.cloud.photos.some(
                        (p) => p.slot === slot && p.state === "current",
                      )
                        ? "photoSavedOnline"
                        : "photoLocalOnly",
                    );
                  })()}
                </Txt>
              ) : null}
            </Pressable>
          ))}
        </Row>
        <Txt size={11} muted style={{ marginTop: 8 }}>
          {app.onlinePhotos.status?.entitlement.enabled
            ? t(
                savedRecord
                  ? app.onlinePhotos.jobs.some((j) => j.recordId === recordId)
                    ? "photoWaiting"
                    : remote.cloud.photos.some((p) => p.state === "current")
                      ? "photoSavedOnline"
                      : "photoStorageStatus"
                  : "photoAfterSave",
              )
            : t(
                remote.cloud.photos.some((p) => p.state === "current")
                  ? "photoSavedOnline"
                  : "photoStorageStatus",
              )}
        </Txt>
      </View>
      {app.onlinePhotos.error ? (
        <Notice
          message={errorText(new Error(app.onlinePhotos.error), t)}
          tone="error"
        />
      ) : null}
      {selected ? (
        <Modal
          animationType="slide"
          onRequestClose={() => {
            if (!busy && !editorUri) {
              if (capturingCard) setCapturingCard(false);
              else close();
            }
          }}
        >
          {capturingCard ? (
            <TazkiraPhotoCapture
              onClose={() => setCapturingCard(false)}
              onAccept={async (uri) => {
                stage(uri);
                setCapturingCard(false);
              }}
            />
          ) : (
            <Screen>
              <Heading
                title={label(selected)}
                action={
                  !editorUri ? (
                    <Button
                      small
                      secondary
                      disabled={busy}
                      label={t("close")}
                      onPress={close}
                    />
                  ) : undefined
                }
              />
              {editorUri ? (
                <PhotoEditor
                  uri={editorUri}
                  onCancel={() => setEditorUri(null)}
                  onAccept={(uri) => {
                    temporary.current.add(uri);
                    setPending({
                      uri,
                      sourceUri:
                        pending?.sourceUri ??
                        photos.sources?.[selected] ??
                        displayPhotos[selected]!,
                      action: pending?.action ?? "adjust",
                    });
                    setEditorUri(null);
                  }}
                />
              ) : (
                <>
                  <Txt muted size={12}>
                    {t("localPhotoHint")}
                  </Txt>
                  {!localPhotosSupported ? (
                    <Notice message={t("localPhotosNativeOnly")} />
                  ) : null}
                  {savedRecord ? (
                    <Notice message={t("photoOwnerOnly")} />
                  ) : null}
                  <Notice message={error} tone="error" />
                  {previewUri ? (
                    <Image
                      source={{ uri: previewUri }}
                      resizeMode="contain"
                      style={{
                        width: "100%",
                        aspectRatio:
                          selected === "person"
                            ? customerPhotoAspect
                            : tazkiraPhotoAspect,
                        maxHeight: 400,
                        backgroundColor: colors.paper,
                        borderRadius: 12,
                        marginVertical: 18,
                      }}
                      onError={() => setError(t("photoMissing"))}
                    />
                  ) : (
                    <View
                      style={{
                        height: 180,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Icon
                        name="image-outline"
                        size={72}
                        color={colors.line}
                      />
                      <Txt muted>{t("noLocalPhoto")}</Txt>
                    </View>
                  )}
                  {canEdit ? (
                    <>
                      {savedRecord ? (
                        <Field
                          label={t("reason")}
                          value={reason}
                          onChangeText={setReason}
                          maxLength={500}
                        />
                      ) : null}
                      {pending ? (
                        <>
                          <Button
                            secondary
                            label={t("photoEdit")}
                            disabled={busy}
                            onPress={() => setEditorUri(pending.uri)}
                          />
                          <Button
                            label={t("useThisImage")}
                            loading={busy}
                            disabled={busy || (!!savedRecord && !reason.trim())}
                            onPress={() =>
                              void run(async () => {
                                const next = await saveLocalPhoto(
                                  scope,
                                  selected,
                                  pending.uri,
                                  options(
                                    displayPhotos[selected]
                                      ? pending.action
                                      : "add",
                                  ),
                                );
                                return next;
                              })
                            }
                          />
                          <Button
                            secondary
                            label={t("cancel")}
                            disabled={busy}
                            onPress={clearTemporary}
                          />
                        </>
                      ) : (
                        <>
                          {displayPhotos[selected] ? (
                            <Button
                              secondary
                              label={t("adjustView")}
                              disabled={busy}
                              onPress={() =>
                                setEditorUri(
                                  photos.sources?.[selected] ??
                                    displayPhotos[selected]!,
                                )
                              }
                            />
                          ) : null}
                          <Row>
                            <View style={{ flex: 1 }}>
                              <Button
                                icon="camera-outline"
                                label={t(
                                  displayPhotos[selected]
                                    ? "replacePhoto"
                                    : "capture",
                                )}
                                disabled={busy || !localPhotosSupported}
                                onPress={() => {
                                  if (selected === "idFront")
                                    setCapturingCard(true);
                                  else void run(() => add("camera"));
                                }}
                              />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Button
                                secondary
                                icon="image-outline"
                                label={t("photoFromDevice")}
                                disabled={busy || !localPhotosSupported}
                                onPress={() => void run(() => add("library"))}
                              />
                            </View>
                          </Row>
                          {displayPhotos[selected] ? (
                            removeConfirm ? (
                              <>
                                <Button
                                  label={t("confirmChanges")}
                                  loading={busy}
                                  disabled={
                                    busy || (!!savedRecord && !reason.trim())
                                  }
                                  onPress={() =>
                                    void run(() =>
                                      removeLocalPhoto(
                                        scope,
                                        selected,
                                        options("remove"),
                                      ),
                                    )
                                  }
                                />
                                <Button
                                  secondary
                                  label={t("cancel")}
                                  disabled={busy}
                                  onPress={() => setRemoveConfirm(false)}
                                />
                              </>
                            ) : (
                              <Button
                                secondary
                                label={t("removePhoto")}
                                disabled={busy}
                                onPress={() => setRemoveConfirm(true)}
                              />
                            )
                          ) : null}
                        </>
                      )}
                      {error === t("photoCameraPermission") ||
                      error === t("photoLibraryPermission") ? (
                        <Button
                          secondary
                          label={t("openSettings")}
                          onPress={() => void Linking.openSettings()}
                        />
                      ) : null}
                    </>
                  ) : null}
                  {savedRecord ? (
                    <Txt muted size={12}>
                      {t("photoRetention")}
                    </Txt>
                  ) : null}
                  {photos.history?.some((h) => h.slot === selected) ? (
                    <Disclosure title={t("photoHistory")} icon="history">
                      {photos.history
                        .filter((h) => h.slot === selected)
                        .map((h, i) => (
                          <View key={i} style={{ marginVertical: 10 }}>
                            <Txt muted size={11}>
                              {formatDate(
                                h.removedAt,
                                app.language,
                                app.gregorian,
                              )}
                            </Txt>
                            <Image
                              source={{ uri: h.uri }}
                              resizeMode="contain"
                              style={{ width: "100%", height: 220 }}
                            />
                          </View>
                        ))}
                    </Disclosure>
                  ) : null}
                </>
              )}
            </Screen>
          )}
        </Modal>
      ) : error ? (
        <Notice message={error} tone="error" />
      ) : null}
    </>
  );
}

export function PhotoFolderSettings() {
  const { membership } = useApp();
  if (!membership) return null;
  return (
    <PhotoFolderContent key={`${membership.shopId}.${membership.userId}`} />
  );
}

function PhotoFolderContent() {
  const { membership, t } = useApp();
  const scope: PhotoScope = {
    shopId: membership!.shopId,
    userId: membership!.userId,
    recordId: "settings",
  };
  const [folder, setFolder] = useState<string | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const shopId = scope.shopId,
    userId = scope.userId;
  useEffect(() => {
    let active = true;
    void photoFolder({ shopId, userId, recordId: "settings" })
      .then((value) => {
        if (active) setFolder(value);
      })
      .catch((e) => {
        if (active) setError(errorText(e, t));
      });
    return () => {
      active = false;
    };
  }, [shopId, userId, t]);
  async function change(reset: boolean) {
    setBusy(true);
    setError("");
    try {
      if (reset) {
        await resetPhotoFolder(scope);
        setFolder(null);
      } else setFolder(await choosePhotoFolder(scope));
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card>
      <Txt bold>{t("photoFolderTitle")}</Txt>
      <Txt muted size={12} style={{ marginVertical: 10 }}>
        {t(
          photoFolderSelectionSupported
            ? "photoFolderHint"
            : localPhotosSupported
              ? "photoFolderIosHint"
              : "localPhotosNativeOnly",
        )}
      </Txt>
      {localPhotosSupported ? (
        <Txt size={11}>
          {folder
            ? decodeURIComponent(folder)
            : t(
                photoFolderSelectionSupported
                  ? "photoFolderDefault"
                  : "photoFolderIosLocation",
              )}
        </Txt>
      ) : null}
      <Notice message={error} tone="error" />
      {photoFolderSelectionSupported ? (
        <Row style={{ marginTop: 12 }}>
          <Button
            small
            secondary
            icon="folder-outline"
            label={t("choosePhotoFolder")}
            disabled={busy || !localPhotosSupported}
            onPress={() => void change(false)}
          />
          {folder ? (
            <Button
              small
              secondary
              label={t("photoFolderReset")}
              disabled={busy}
              onPress={() => void change(true)}
            />
          ) : null}
        </Row>
      ) : null}
    </Card>
  );
}
