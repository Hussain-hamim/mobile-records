import { CameraView, useCameraPermissions } from "expo-camera";
import { useEffect, useRef, useState } from "react";
import { AppState, Image, Linking, StyleSheet, View } from "react-native";
import { tazkiraPhotoAspect, tazkiraPhotoGuide } from "../domain/photo-frame";
import { cropCardPhoto } from "../services/card-photo";
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

export function TazkiraPhotoCapture({
  onClose,
  onAccept,
}: {
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
      if (state !== "active") setReady(false);
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
    const geometry = { ...preview };
    const result = await camera.current?.takePictureAsync({
      quality: 1,
      exif: false,
      skipProcessing: false,
    });
    if (!result) throw new Error("cameraUnavailable");
    files.current.add(result.uri);
    if (!active.current) return;
    const cropped = await cropCardPhoto(result, geometry);
    files.current.add(cropped.uri);
    // Remove the full camera image as soon as the cropped review copy is ready.
    await discardPickedPhoto(result.uri);
    files.current.delete(result.uri);
    if (active.current) setPhoto(cropped.uri);
  }
  const guide =
    preview.width > 0 && preview.height > 0 ? tazkiraPhotoGuide(preview) : null;
  return (
    <Screen>
      <Heading
        title={t("idFrontPhoto")}
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
              aspectRatio: tazkiraPhotoAspect,
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
            {t("photoCropReview")}
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
                onPress={() => void run(async () => { await onAccept(photo); files.current.delete(photo); })}
              />
            </View>
          </Row>
        </>
      ) : (
        <>
          <Txt muted style={{ marginBottom: 14 }}>
            {t("tazkiraPhotoFrameHint")}
          </Txt>
          <View
            onLayout={({ nativeEvent }) =>
              setPreview({
                width: nativeEvent.layout.width,
                height: nativeEvent.layout.height,
              })
            }
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
