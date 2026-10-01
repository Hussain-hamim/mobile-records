import { useEffect, useRef, useState } from "react";
import {
  Image,
  Linking,
  Modal,
  Platform,
  View,
  ScrollView,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useApp } from "../state/app-context";
import { emptyPerson, type Person } from "../domain/models";
import { extractImeis } from "../domain/validation";
import { extractPerson } from "../domain/ocr";
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
import { PersonFields } from "./person-fields";
export function Scanner({
  mode,
  onClose,
  onPerson,
  onImei,
}: {
  mode: "id" | "imei";
  onClose: () => void;
  onPerson: (p: Partial<Person>) => void;
  onImei: (imei: string) => void;
}) {
  const { t } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView | null>(null);
  const [photo, setPhoto] = useState<{
    uri: string;
    width: number;
    height: number;
  } | null>(null);
  const [fields, setFields] = useState<Person>(emptyPerson);
  const [reviewing, setReviewing] = useState(false);
  const [imeis, setImeis] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const files = useRef<string[]>([]);
  const active = useRef(true);
  const processing = useRef(false);
  useEffect(
    () => () => {
      active.current = false;
      if (!processing.current) void deleteScans(files.current);
    },
    [],
  );
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
      else await deleteScans(files.current);
    }
  }
  async function close() {
    if (processing.current) return;
    await deleteScans(files.current);
    files.current = [];
    onClose();
  }
  async function capture() {
    const result = await camera.current?.takePictureAsync({
      quality: 1,
      exif: false,
    });
    if (!result) return;
    const uri = await keepScan(result.uri);
    files.current.push(uri);
    if (active.current) setPhoto({ ...result, uri });
  }
  async function edit(action: "rotate" | "crop") {
    if (!photo) return;
    const result = await editScan(photo.uri, photo.width, photo.height, action);
    files.current.push(result.uri);
    if (active.current) setPhoto(result);
  }
  async function read() {
    if (!photo) return;
    const result = await recognize(photo.uri, mode);
    if (!active.current) return;
    if (mode === "imei") {
      const values = extractImeis(result.text);
      setImeis(values);
      if (!values.length) setError(t("invalidImei"));
    } else {
      const found = extractPerson(result.text);
      setFields({ ...emptyPerson(), ...found });
      setReviewing(true);
      if (!Object.keys(found).length) setError(t("noText"));
    }
  }
  async function accept(imei?: string) {
    await deleteScans(files.current);
    files.current = [];
    if (imei) onImei(imei);
    else
      onPerson(
        Object.fromEntries(Object.entries(fields).filter(([, v]) => v.trim())),
      );
    onClose();
  }
  return (
    <Modal animationType="slide" onRequestClose={() => void close()}>
      <Screen>
        <Heading
          title={t(mode === "id" ? "scanId" : "scanImei")}
          action={
            <Button
              label={t("close")}
              small
              secondary
              disabled={busy}
              onPress={() => void close()}
            />
          }
        />
        <Notice message={t("photoPrivacy")} />
        <Notice message={error} tone="error" />
        {Platform.OS !== "android" ? (
          <Notice message={t("nativeRequired")} />
        ) : !permission?.granted ? (
          <Card>
            <Txt>{t("cameraPermission")}</Txt>
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
          </Card>
        ) : !photo ? (
          <View>
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
                barcodeScannerSettings={{
                  barcodeTypes: [
                    "code128",
                    "code39",
                    "ean13",
                    "qr",
                    "datamatrix",
                  ],
                }}
                onBarcodeScanned={
                  mode === "imei"
                    ? ({ data }) => {
                        const values = extractImeis(data);
                        if (values.length) {
                          setImeis(values);
                        }
                      }
                    : undefined
                }
              />
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: "8%",
                  right: "8%",
                  top: "25%",
                  height: "50%",
                  borderWidth: 2,
                  borderColor: "#fff",
                  borderRadius: 14,
                }}
              />
            </View>
            <Txt muted size={12}>
              {t(mode === "id" ? "idHint" : "scanHint")}
            </Txt>
            <View style={{ height: 12 }} />
            <Button
              label={t("capture")}
              icon="camera-outline"
              loading={busy}
              onPress={() => void run(capture)}
            />
          </View>
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
            <Row style={{ marginBottom: 14 }}>
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
                    setReviewing(false);
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
                <Chip label={imei} onPress={() => void accept(imei)} />
              </View>
            ))}
          </Card>
        ) : null}
        {reviewing ? (
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={{ height: 20 }} />
            <Txt bold>{t("review")}</Txt>
            <PersonFields value={fields} onChange={setFields} />
            <Button label={t("apply")} onPress={() => void accept()} />
          </ScrollView>
        ) : null}
      </Screen>
    </Modal>
  );
}
