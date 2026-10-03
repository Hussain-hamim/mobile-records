import { useEffect, useRef, useState } from "react";
import { Image, Linking, Modal, Platform, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { Person } from "../domain/models";
import type { ScanPhoto } from "../domain/tazkira";
import { extractImeis } from "../domain/validation";
import { useApp } from "../state/app-context";
import {
  canRecognize,
  deleteScans,
  editScan,
  keepScan,
  recognize,
} from "../services/scanning";
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
  const { t } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);
  const [ready, setReady] = useState(false);
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
  async function capture() {
    const result = await camera.current?.takePictureAsync({
      quality: 1,
      exif: false,
      skipProcessing: false,
    });
    if (!result) return;
    files.current.push(result.uri);
    if (!active.current) return;
    const uri = await keepScan(result.uri);
    files.current.push(uri);
    if (active.current) setPhoto({ ...result, uri });
  }
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
    const result = await recognize(photo.uri, "imei");
    if (!active.current) return;
    const values = extractImeis(result.text);
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
    <Modal animationType="slide" onRequestClose={() => void close()}>
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
                onCameraReady={() => setReady(true)}
                onMountError={() => setError(t("cameraUnavailable"))}
                barcodeScannerSettings={{
                  barcodeTypes: [
                    "code128",
                    "code39",
                    "ean13",
                    "qr",
                    "datamatrix",
                  ],
                }}
                onBarcodeScanned={({ data }) => {
                  const values = extractImeis(data);
                  if (values.length) setImeis(values);
                }}
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: "8%",
                  width: "84%",
                  top: "25%",
                  height: "50%",
                  borderWidth: 2,
                  borderColor: "#fff",
                  borderRadius: 14,
                }}
              />
            </View>
            <Txt muted size={12}>
              {t("scanHint")}
            </Txt>
            <Button
              label={t("capture")}
              loading={busy}
              disabled={!ready}
              onPress={() => void run(capture)}
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
