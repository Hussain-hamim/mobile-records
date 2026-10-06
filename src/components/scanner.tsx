import { useVisualPreferences } from "./visual-effects";
import { useEffect, useRef, useState } from "react";
import { AppState, Image, Linking, Modal, Platform, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { Person } from "../domain/models";
import type { ScanPhoto } from "../domain/tazkira";
import { imeiGuide } from "../domain/imei-frame";
import {
  captureImeiRegion,
  readImeiBarcodes,
  readImeiCrop,
} from "../services/imei-scanning";
import { useApp } from "../state/app-context";
import { canRecognize, deleteScans, editScan } from "../services/scanning";
import {
  Button,
  Card,
  Chip,
  Heading,
  Notice,
  Row,
  Screen,
  Txt,
  errorText,
} from "./ui";
import { TazkiraScanner } from "./tazkira-scanner";
function ImeiScanner({
  onClose,
  onImei,
}: {
  onClose: () => void;
  onImei: (imei: string) => void;
}) {
  const { reduceMotion } = useVisualPreferences();
  const { t } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);
  const preview = useRef({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const manualRequested = useRef(false);
  const [photo, setPhoto] = useState<ScanPhoto | null>(null);
  const [imeis, setImeis] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const files = useRef<string[]>([]),
    active = useRef(true),
    processing = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      if (!processing.current) void deleteScans(files.current).catch(() => {});
    };
  }, []);
  async function run(work: () => Promise<void>) {
    if (processing.current) return;
    processing.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (active.current) setError(errorText(e, t));
    } finally {
      processing.current = false;
      if (active.current) setBusy(false);
      else await deleteScans(files.current).catch(() => {});
    }
  }
  async function close() {
    active.current = false;
    if (!processing.current) await deleteScans(files.current).catch(() => {});
    onClose();
  }
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
      if (state !== "active") {
        setReady(false);
        manualRequested.current = false;
        setBusy(false);
      }
    });
    return () => subscription.remove();
  }, []);
  useEffect(() => {
    if (
      Platform.OS !== "android" ||
      !permission?.granted ||
      !ready ||
      !foreground ||
      photo
    )
      return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const live = () => !stopped && active.current;
    async function tick() {
      if (!live()) return;
      if (processing.current) {
        timer = setTimeout(() => void tick(), 150);
        return;
      }
      processing.current = true;
      let cropped: ScanPhoto | undefined;
      let retained = false;
      try {
        const geometry = { ...preview.current };
        cropped = await captureImeiRegion(async () => {
          const result = await camera.current?.takePictureAsync({
            quality: 0.9,
            exif: false,
            skipProcessing: false,
            shutterSound: false,
          });
          if (!result) throw new Error("cameraUnavailable");
          return result;
        }, geometry);
        if (!live()) return;
        const manual = manualRequested.current;
        manualRequested.current = false;
        const values = manual
          ? await readImeiCrop(cropped.uri, live)
          : await readImeiBarcodes(cropped.uri);
        if (!live()) return;
        if (manual || values.length) {
          manualRequested.current = false;
          files.current.push(cropped.uri);
          retained = true;
          setPhoto(cropped);
          setImeis(values);
          setError(values.length ? "" : t("invalidImei"));
        } else setError("");
      } catch (e) {
        if (live()) setError(errorText(e, t));
      } finally {
        if (cropped && !retained)
          await deleteScans([cropped.uri]).catch(() => {});
        processing.current = false;
        if (!active.current) await deleteScans(files.current).catch(() => {});
        if (live()) {
          if (!manualRequested.current) setBusy(false);
          if (!retained)
            timer = setTimeout(
              () => void tick(),
              manualRequested.current ? 0 : 450,
            );
        }
      }
    }
    // Give autofocus a moment to settle before the first crop. Only one capture
    // and decoder run at a time; no full-frame barcode analyzer runs in parallel.
    timer = setTimeout(() => void tick(), 600);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [foreground, permission?.granted, photo, ready, t]);
  async function edit(action: "rotate" | "crop") {
    if (!photo) return;
    const result = await editScan(photo.uri, photo.width, photo.height, action);
    files.current.push(result.uri);
    if (active.current) {
      setPhoto(result);
      setImeis([]);
    }
  }
  async function read() {
    if (!photo) return;
    const values = await readImeiCrop(photo.uri, () => active.current);
    if (!active.current) return;
    setImeis(values);
    if (!values.length) setError(t("invalidImei"));
  }
  async function accept(imei: string) {
    await deleteScans(files.current);
    files.current = [];
    if (active.current) {
      onImei(imei);
      onClose();
    }
  }
  return (
    <Modal animationType={reduceMotion ? "none" : "slide"} onRequestClose={() => void close()}>
      <Screen>
        <Heading
          title={t("scanImei")}
          action={
            <Button
              label={t("close")}
              small
              secondary
              onPress={() => void close()}
            />
          }
        />
        <Notice message={t("photoPrivacy")} />
        <Notice message={error} tone="error" />
        {Platform.OS !== "android" ? (
          <Notice message={t("nativeRequired")} />
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
              onLayout={({ nativeEvent }) => {
                preview.current = nativeEvent.layout;
                setImeis([]);
              }}
              style={{
                height: 360,
                borderRadius: 20,
                overflow: "hidden",
                marginBottom: 16,
              }}
            >
              {foreground ? (
                <CameraView
                  ref={camera}
                  style={{ flex: 1 }}
                  facing="back"
                  animateShutter={false}
                  onCameraReady={() => setReady(true)}
                  onMountError={() => {
                    setReady(false);
                    setError(t("cameraUnavailable"));
                  }}
                />
              ) : null}
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: `${imeiGuide.x * 100}%`,
                  width: `${imeiGuide.width * 100}%`,
                  top: `${imeiGuide.y * 100}%`,
                  height: `${imeiGuide.height * 100}%`,
                  borderWidth: 2,
                  borderColor: "#fff",
                  borderRadius: 14,
                }}
              />
            </View>
            <Txt muted size={12}>
              {t("imeiAreaHint")}
            </Txt>
            <Button
              label={t("readImeiArea")}
              loading={busy}
              disabled={!ready || busy || !foreground}
              onPress={() => {
                manualRequested.current = true;
                setBusy(true);
                setError("");
              }}
            />
          </>
        ) : (
          <>
            <Image
              source={{ uri: photo.uri }}
              style={{
                width: "100%",
                height: 230,
                borderRadius: 16,
                marginBottom: 15,
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
                onPress={() =>
                  void run(async () => {
                    await deleteScans(files.current);
                    files.current = [];
                    setPhoto(null);
                    setReady(false);
                    setImeis([]);
                  })
                }
              />
            </Row>
            <Button
              label={t("recognize")}
              loading={busy}
              disabled={!canRecognize}
              onPress={() => void run(read)}
            />
            {!canRecognize ? <Notice message={t("nativeRequired")} /> : null}
          </>
        )}
        {imeis.length ? (
          <Card>
            <Txt bold>{t("review")}</Txt>
            {imeis.map((imei) => (
              <View key={imei} style={{ marginTop: 12 }}>
                <Chip
                  label={imei}
                  onPress={
                    busy ? undefined : () => void run(() => accept(imei))
                  }
                />
              </View>
            ))}
          </Card>
        ) : null}
      </Screen>
    </Modal>
  );
}
export function Scanner(props: {
  mode: "id" | "imei";
  onClose: () => void;
  onPerson: (p: Partial<Person>) => void;
  onImei: (imei: string) => void;
}) {
  return props.mode === "id" ? (
    <TazkiraScanner onClose={props.onClose} onPerson={props.onPerson} />
  ) : (
    <ImeiScanner onClose={props.onClose} onImei={props.onImei} />
  );
}
