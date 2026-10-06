import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { AppState, Image, Linking, StyleSheet, View } from "react-native";
import { recordPhotoAspect, recordPhotoGuide } from "../domain/photo-frame";
import { cropRecordPhoto } from "../services/capture-photo";
import { discardPickedPhoto } from "../services/local-photos";
import { useApp } from "../state/app-context";
import {
  Button,
  Heading,
  Notice,
  Row,
  Screen,
  Txt,
  colors,
  errorText,
} from "./ui";

export function RecordPhotoCapture({
  title,
  kind,
  onClose,
  onAccept,
}: {
  title: string;
  kind: "person" | "idFront";
  onClose: () => void;
  onAccept: (uri: string) => Promise<void>;
}) {
  const { t } = useApp();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [preview, setPreview] = useState({ width: 0, height: 0 });
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [foreground, setForeground] = useState(
    AppState.currentState === "active",
  );
  const active = useRef(true),
    working = useRef(false),
    captureRevision = useRef(0),
    files = useRef(new Set<string>());
  async function cleanup() {
    const uris = [...files.current];
    files.current.clear();
    await Promise.all(
      uris.map((uri) => discardPickedPhoto(uri).catch(() => {})),
    );
  }
  useEffect(() => {
    active.current = true;
    const subscription = AppState.addEventListener("change", (state) => {
      setForeground(state === "active");
      if (state !== "active") {
        captureRevision.current++;
        setReady(false);
      }
    });
    return () => {
      active.current = false;
      subscription.remove();
      if (!working.current) void cleanup();
    };
  }, []);
  async function run(work: () => Promise<void>) {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      if (active.current) setError(errorText(e, t));
    } finally {
      working.current = false;
      if (active.current) setBusy(false);
      else await cleanup();
    }
  }
  async function capture() {
    if (!ready || !foreground) return;
    const geometry = { ...preview };
    const revision = captureRevision.current;
    let keepReview = false;
    try {
      const result = await camera.current?.takePictureAsync({
        quality: 1,
        exif: false,
        skipProcessing: false,
      });
      if (!result) throw new Error("cameraUnavailable");
      files.current.add(result.uri);
      if (!active.current || revision !== captureRevision.current) return;
      const cropped = await cropRecordPhoto(result, geometry);
      files.current.add(cropped.uri);
      // Never retain or hand off content outside the guide, even as an edit source.
      await discardPickedPhoto(result.uri);
      files.current.delete(result.uri);
      if (!active.current || revision !== captureRevision.current) return;
      setPhoto(cropped.uri);
      keepReview = true;
    } finally {
      if (!keepReview) await cleanup();
    }
  }
  const guide =
    preview.width > 0 && preview.height > 0 ? recordPhotoGuide(preview) : null;
  return (
    <Screen>
      <Heading
        title={title}
        action={
          <Button
            small
            secondary
            label={t("close")}
            disabled={busy}
            onPress={onClose}
          />
        }
      />
      <Notice message={error} tone="error" />
      {!permission?.granted ? (
        <>
          <Notice message={t("photoCameraPermission")} />
          <Button
            label={t(
              permission?.canAskAgain === false
                ? "openSettings"
                : "allowCamera",
            )}
            onPress={() =>
              void run(async () => {
                if (permission?.canAskAgain === false)
                  await Linking.openSettings();
                else await requestPermission();
              })
            }
            disabled={busy}
          />
        </>
      ) : photo ? (
        <>
          <View
            style={{
              width: "100%",
              aspectRatio: recordPhotoAspect,
              backgroundColor: colors.paper,
              marginBottom: 16,
            }}
          >
            <Image
              source={{ uri: photo }}
              resizeMode="contain"
              style={StyleSheet.absoluteFill}
            />
          </View>
          <Txt muted style={{ marginBottom: 16 }}>
            {t(
              kind === "idFront" ? "photoCropReview" : "personPhotoCropReview",
            )}
          </Txt>
          <Row>
            <View style={{ flex: 1 }}>
              <Button
                secondary
                label={t("retake")}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await cleanup();
                    setReady(false);
                    setPhoto(null);
                  })
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                label={t("usePhoto")}
                loading={busy}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    await onAccept(photo);
                    files.current.delete(photo);
                  })
                }
              />
            </View>
          </Row>
        </>
      ) : (
        <>
          <Txt muted style={{ marginBottom: 14 }}>
            {t(
              kind === "idFront"
                ? "tazkiraPhotoFrameHint"
                : "personPhotoFrameHint",
            )}
          </Txt>
          <View
            onLayout={({ nativeEvent }) => {
              if (
                nativeEvent.layout.width !== preview.width ||
                nativeEvent.layout.height !== preview.height
              )
                captureRevision.current++;
              setPreview({
                width: nativeEvent.layout.width,
                height: nativeEvent.layout.height,
              });
            }}
            style={{
              width: "100%",
              aspectRatio: 3 / 4,
              maxHeight: 460,
              backgroundColor: "#182420",
              borderRadius: 18,
              overflow: "hidden",
              marginBottom: 18,
            }}
          >
            {foreground ? (
              <CameraView
                ref={camera}
                style={StyleSheet.absoluteFill}
                facing="back"
                onCameraReady={() => setReady(true)}
                onMountError={() => {
                  setReady(false);
                  setError(t("cameraUnavailable"));
                }}
              />
            ) : null}
            {guide ? (
              <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                <View
                  style={[
                    styles.shade,
                    { top: 0, left: 0, right: 0, height: guide.y },
                  ]}
                />
                <View
                  style={[
                    styles.shade,
                    {
                      top: guide.y + guide.height,
                      left: 0,
                      right: 0,
                      bottom: 0,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.shade,
                    {
                      top: guide.y,
                      left: 0,
                      width: guide.x,
                      height: guide.height,
                    },
                  ]}
                />
                <View
                  style={[
                    styles.shade,
                    {
                      top: guide.y,
                      left: guide.x + guide.width,
                      right: 0,
                      height: guide.height,
                    },
                  ]}
                />
                <View
                  style={{
                    position: "absolute",
                    left: guide.x,
                    top: guide.y,
                    width: guide.width,
                    height: guide.height,
                    borderWidth: 1,
                    borderColor: "#FFFFFF99",
                  }}
                >
                  {[1, 2].map((line) => (
                    <View key={line} style={StyleSheet.absoluteFill}>
                      <View
                        style={{
                          position: "absolute",
                          left: `${(line * 100) / 3}%`,
                          top: 0,
                          bottom: 0,
                          width: 1,
                          backgroundColor: "#FFFFFF55",
                        }}
                      />
                      <View
                        style={{
                          position: "absolute",
                          top: `${(line * 100) / 3}%`,
                          left: 0,
                          right: 0,
                          height: 1,
                          backgroundColor: "#FFFFFF55",
                        }}
                      />
                    </View>
                  ))}
                  <View
                    style={[
                      styles.corner,
                      {
                        left: 0,
                        top: 0,
                        borderLeftWidth: 4,
                        borderTopWidth: 4,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.corner,
                      {
                        right: 0,
                        top: 0,
                        borderRightWidth: 4,
                        borderTopWidth: 4,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.corner,
                      {
                        left: 0,
                        bottom: 0,
                        borderLeftWidth: 4,
                        borderBottomWidth: 4,
                      },
                    ]}
                  />
                  <View
                    style={[
                      styles.corner,
                      {
                        right: 0,
                        bottom: 0,
                        borderRightWidth: 4,
                        borderBottomWidth: 4,
                      },
                    ]}
                  />
                </View>
              </View>
            ) : null}
          </View>
          <Button
            icon="camera-outline"
            label={t("capture")}
            loading={busy}
            disabled={busy || !ready || !guide || !foreground}
            onPress={() => void run(capture)}
          />
        </>
      )}
    </Screen>
  );
}
const styles = StyleSheet.create({
  shade: { position: "absolute", backgroundColor: "#00000088" },
  corner: {
    position: "absolute",
    width: 24,
    height: 24,
    borderColor: "#A2F4C8",
  },
});
