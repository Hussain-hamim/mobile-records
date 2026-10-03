import { useEffect, useRef, useState } from "react";
import { Image, Linking, Modal, Platform, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useApp } from "../state/app-context";
import type { Person } from "../domain/models";
import type { MrzResult } from "../domain/mrz";
import type { ScanPhoto } from "../domain/tazkira";
import { mrzGuide, mrzPhotoRegion } from "../domain/mrz-capture";
import {
  canReadMrz,
  cropScan,
  deleteScans,
  editScan,
  recognizeMrz,
} from "../services/scanning";
import {
  onlineScanAvailable,
  recognizeMrzOnline,
} from "../services/tazkira-online";
import { Button, Card, Field, Heading, Notice, Row, Screen, Txt } from "./ui";
import type { TextKey } from "../i18n/strings";
const mrzKeys = ["name", "idNumber", "gender", "nationality"] as const;
type MrzFields = Pick<Person, (typeof mrzKeys)[number]>;
export function TazkiraScanner({
  onClose,
  onPerson,
}: {
  onClose: () => void;
  onPerson: (fields: Partial<Person>) => void;
}) {
  const { t, membership, demo } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);
  const preview = useRef({ width: 0, height: 0 });
  const [ready, setReady] = useState(false),
    [torch, setTorch] = useState(false);
  const [photo, setPhoto] = useState<ScanPhoto | null>(null);
  const [fields, setFields] = useState<MrzFields | null>(null);
  const edited = useRef(new Set<(typeof mrzKeys)[number]>());
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [consent, setConsent] = useState(false),
    [onlineBusy, setOnlineBusy] = useState(false);
  const [onlineStatus, setOnlineStatus] = useState({
    shopId: "",
    enabled: false,
  });
  const shopId = membership?.shopId;
  const onlineReady =
    !demo && shopId === onlineStatus.shopId && onlineStatus.enabled;
  const active = useRef(true),
    working = useRef(false),
    files = useRef<string[]>([]);
  const upload = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      upload.current?.abort();
      if (!working.current) void deleteScans(files.current).catch(() => {});
    };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    if (shopId && !demo)
      void onlineScanAvailable(shopId, controller.signal).then((enabled) => {
        if (!controller.signal.aborted) setOnlineStatus({ shopId, enabled });
      });
    return () => controller.abort();
  }, [shopId, demo]);
  async function run(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (active.current) {
        try {
          setError(
            t((e instanceof Error ? e.message : "mrzNotFound") as TextKey),
          );
        } catch {
          setError(t("mrzNotFound"));
        }
      }
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
      else await deleteScans(files.current).catch(() => {});
    }
  }
  async function close() {
    active.current = false;
    upload.current?.abort();
    if (!working.current) await deleteScans(files.current).catch(() => {});
    onClose();
  }
  function applyRead(result: MrzResult | null) {
    if (!active.current || !result) return;
    if (!result.ok) {
      setError(t(result.error));
      return;
    }
    setFields((current) => ({
      ...result.fields,
      ...Object.fromEntries(
        [...edited.current].map((key) => [key, current?.[key] ?? ""]),
      ),
    }));
  }
  async function read(scan = photo) {
    if (scan)
      applyRead(await recognizeMrz(scan.uri, undefined, () => active.current));
  }
  async function capture() {
    const size = { ...preview.current };
    if (!size.width || !size.height) throw Error("cameraUnavailable");
    const result = await camera.current?.takePictureAsync({
      quality: 1,
      exif: false,
      skipProcessing: false,
    });
    if (!result) return;
    files.current.push(result.uri);
    if (!active.current) return;
    const selected = await cropScan(
      result.uri,
      result.width,
      result.height,
      mrzPhotoRegion(result, size),
    );
    files.current.push(selected.uri);
    await deleteScans([result.uri]);
    files.current = files.current.filter((uri) => uri !== result.uri);
    if (!active.current) return;
    setPhoto(selected);
    setTorch(false);
    await read(selected);
  }
  async function edit(action: "rotate" | "crop") {
    if (!photo) return;
    const result = await editScan(photo.uri, photo.width, photo.height, action);
    files.current.push(result.uri);
    await deleteScans([photo.uri]);
    files.current = files.current.filter((uri) => uri !== photo.uri);
    if (active.current) {
      setPhoto(result);
      setConsent(false);
    }
  }
  async function retake() {
    await deleteScans(files.current);
    files.current = [];
    if (!active.current) return;
    setPhoto(null);
    setFields(null);
    edited.current.clear();
    setReady(false);
    setConsent(false);
  }
  async function online() {
    if (!photo || !shopId || !onlineReady) return;
    const controller = new AbortController();
    upload.current = controller;
    setOnlineBusy(true);
    setConsent(false);
    try {
      const result = await recognizeMrzOnline(
        photo.uri,
        shopId,
        controller.signal,
      );
      if (!controller.signal.aborted) applyRead(result);
    } finally {
      upload.current = null;
      if (active.current) setOnlineBusy(false);
    }
  }
  async function accept() {
    if (!fields) return;
    await deleteScans(files.current);
    files.current = [];
    if (active.current) {
      onPerson(fields);
      onClose();
    }
  }
  return (
    <Modal animationType="slide" onRequestClose={() => void close()}>
      <Screen resetKey={photo ? "result" : "camera"}>
        <Heading
          title={t("scanId")}
          action={
            <Button
              label={t("close")}
              small
              secondary
              onPress={() => void close()}
            />
          }
        />
        <Notice
          message={t(onlineReady ? "mrzOnlinePrivacy" : "photoPrivacy")}
        />
        <Notice message={error} tone="error" />
        {Platform.OS !== "android" || !canReadMrz ? (
          <Notice message={t("mrzNativeRequired")} />
        ) : !permission?.granted ? (
          <Button
            label={t(
              permission?.canAskAgain === false
                ? "openSettings"
                : "allowCamera",
            )}
            onPress={() =>
              void (permission?.canAskAgain === false
                ? Linking.openSettings()
                : requestPermission())
            }
          />
        ) : !photo ? (
          <>
            <View
              onLayout={(e) => {
                preview.current = e.nativeEvent.layout;
              }}
              style={{
                height: 360,
                borderRadius: 20,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              <CameraView
                ref={camera}
                style={{ flex: 1 }}
                facing="back"
                enableTorch={torch}
                onCameraReady={() => setReady(true)}
                onMountError={() => setError(t("cameraUnavailable"))}
              />
              <View
                pointerEvents="none"
                style={{ position: "absolute", inset: 0 }}
              >
                <View
                  style={{
                    height: `${mrzGuide.y * 100}%`,
                    backgroundColor: "rgba(0,0,0,.62)",
                  }}
                />
                <View
                  style={{
                    height: `${mrzGuide.height * 100}%`,
                    flexDirection: "row",
                  }}
                >
                  <View
                    style={{
                      width: `${mrzGuide.x * 100}%`,
                      backgroundColor: "rgba(0,0,0,.62)",
                    }}
                  />
                  <View
                    style={{ flex: 1, borderWidth: 2, borderColor: "#fff" }}
                  />
                  <View
                    style={{
                      width: `${mrzGuide.x * 100}%`,
                      backgroundColor: "rgba(0,0,0,.62)",
                    }}
                  />
                </View>
                <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,.62)" }} />
              </View>
            </View>
            <Notice message={t("idHint")} />
            <Button
              label={t("captureMrz")}
              loading={busy}
              disabled={!ready}
              onPress={() => void run(capture)}
            />
            <View style={{ height: 12 }} />
            <Button
              small
              secondary
              label={t(torch ? "torchOff" : "torchOn")}
              disabled={busy}
              onPress={() => setTorch((value) => !value)}
            />
          </>
        ) : (
          <>
            <Txt muted size={12}>
              {t("mrzCropPreview")}
            </Txt>
            <Image
              source={{ uri: photo.uri }}
              style={{
                width: "100%",
                height: 180,
                marginVertical: 12,
                borderRadius: 12,
              }}
              resizeMode="contain"
            />
            <Row>
              <Button
                small
                secondary
                label={t("rotate")}
                disabled={busy}
                onPress={() => void run(() => edit("rotate"))}
              />
              <Button
                small
                secondary
                label={t("crop")}
                disabled={busy}
                onPress={() => void run(() => edit("crop"))}
              />
              <Button
                small
                secondary
                label={t("retake")}
                disabled={busy}
                onPress={() => void run(retake)}
              />
            </Row>
            <View style={{ height: 12 }} />
            <Button
              label={t("readMrz")}
              loading={busy}
              onPress={() => void run(() => read())}
            />
            {onlineReady ? (
              <>
                <View style={{ height: 12 }} />
                <Button
                  small
                  secondary
                  label={t("tryMrzOnline")}
                  disabled={busy}
                  onPress={() => setConsent(true)}
                />
              </>
            ) : null}
            {consent ? (
              <Card>
                <Notice message={t("mrzOnlineConsent")} />
                <Button
                  label={t("sendMrzGoogle")}
                  disabled={busy}
                  onPress={() => void run(online)}
                />
                <Button
                  secondary
                  label={t("cancel")}
                  disabled={busy}
                  onPress={() => setConsent(false)}
                />
              </Card>
            ) : null}
            {onlineBusy ? (
              <Button
                secondary
                label={t("cancel")}
                onPress={() => upload.current?.abort()}
              />
            ) : null}
          </>
        )}
        {fields ? (
          <>
            <Heading title={t("review")} />
            <Notice message={t("mrzReview")} />
            {mrzKeys.map((key) => (
              <Field
                key={key}
                label={t(key)}
                value={fields[key] ?? ""}
                numeric={key === "idNumber"}
                onChangeText={(value) => {
                  if (busy) return;
                  edited.current.add(key);
                  setFields((current) =>
                    current ? { ...current, [key]: value } : current,
                  );
                }}
              />
            ))}
            <Button
              label={t("apply")}
              loading={busy}
              onPress={() => void run(accept)}
            />
          </>
        ) : null}
        <View style={{ height: 16 }} />
        <Button secondary label={t("mrzManual")} onPress={() => void close()} />
      </Screen>
    </Modal>
  );
}
