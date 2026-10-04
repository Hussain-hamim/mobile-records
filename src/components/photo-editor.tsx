import { useEffect, useRef, useState } from "react";
import { Image, View } from "react-native";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { PhotoZoom } from "./photo-zoom";
import { useApp } from "../state/app-context";
import { discardPickedPhoto } from "../services/local-photos";
import { Button, Notice, Row, Txt, errorText } from "./ui";

/** Editing is entirely local. Every render is a temporary derivative. */
export function PhotoEditor({
  uri,
  onAccept,
  onCancel,
}: {
  uri: string;
  onAccept: (uri: string) => void;
  onCancel: () => void;
}) {
  const { t } = useApp();
  const [image, setImage] = useState({ uri, width: 0, height: 0 });
  const [box, setBox] = useState({ x: 0, y: 0, size: 1 });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const files = useRef(new Set<string>()),
    alive = useRef(true),
    working = useRef(false);
  useEffect(() => {
    alive.current = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (alive.current) setImage({ uri, width, height });
      },
      () => setError(t("photoMissing")),
    );
    const pending = files.current;
    return () => {
      alive.current = false;
      for (const f of pending) void discardPickedPhoto(f).catch(() => {});
    };
  }, [uri, t]);
  async function edit(rotate: boolean) {
    if (working.current || !image.width) return;
    working.current = true;
    setBusy(true);
    setError("");
    const ctx = ImageManipulator.manipulate(image.uri);
    try {
      if (rotate) ctx.rotate(90);
      else
        ctx.crop({
          originX: Math.floor(box.x * image.width),
          originY: Math.floor(box.y * image.height),
          width: Math.max(1, Math.floor(box.size * image.width)),
          height: Math.max(1, Math.floor(box.size * image.height)),
        });
      const result = await ctx.renderAsync();
      try {
        const saved = await result.saveAsync({
          format: SaveFormat.JPEG,
          compress: 0.95,
        });
        if (!alive.current) {
          await discardPickedPhoto(saved.uri);
          return;
        }
        files.current.add(saved.uri);
        setImage(saved);
        setBox({ x: 0, y: 0, size: 1 });
      } finally {
        result.release();
      }
    } catch (e) {
      if (alive.current) setError(errorText(e, t));
    } finally {
      ctx.release();
      working.current = false;
      if (alive.current) setBusy(false);
    }
  }
  const move = (x: number, y: number) =>
    setBox((b) => ({
      ...b,
      x: Math.max(0, Math.min(1 - b.size, b.x + x)),
      y: Math.max(0, Math.min(1 - b.size, b.y + y)),
    }));
  return (
    <View>
      <Txt muted size={12}>
        {t("photoEditHint")}
      </Txt>
      {image.width > 0 ? (
        <View
          style={{
            width: "100%",
            aspectRatio: image.width / image.height,
            marginVertical: 16,
          }}
        >
          <Image
            source={{ uri: image.uri }}
            resizeMode="contain"
            style={{ width: "100%", height: "100%" }}
          />
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              left: `${box.x * 100}%`,
              top: `${box.y * 100}%`,
              width: `${box.size * 100}%`,
              height: `${box.size * 100}%`,
              borderWidth: 3,
              borderColor: "#4F54E8",
            }}
          />
        </View>
      ) : null}
      {image.width > 0 ? (
        <PhotoZoom uri={image.uri} width={image.width} height={image.height} />
      ) : null}
      <Notice message={error} tone="error" />
      <Row style={{ flexWrap: "wrap", marginBottom: 10 }}>
        <Button
          small
          secondary
          label={t("cropLarger")}
          disabled={busy}
          onPress={() =>
            setBox((b) => ({
              size: Math.min(1, b.size + 0.1),
              x: Math.min(b.x, Math.max(0, 0.9 - b.size)),
              y: Math.min(b.y, Math.max(0, 0.9 - b.size)),
            }))
          }
        />
        <Button
          small
          secondary
          label={t("cropSmaller")}
          disabled={busy}
          onPress={() =>
            setBox((b) => ({ ...b, size: Math.max(0.3, b.size - 0.1) }))
          }
        />
        <Button
          small
          secondary
          label={t("moveLeft")}
          disabled={busy}
          onPress={() => move(-0.05, 0)}
        />
        <Button
          small
          secondary
          label={t("moveRight")}
          disabled={busy}
          onPress={() => move(0.05, 0)}
        />
        <Button
          small
          secondary
          label={t("moveUp")}
          disabled={busy}
          onPress={() => move(0, -0.05)}
        />
        <Button
          small
          secondary
          label={t("moveDown")}
          disabled={busy}
          onPress={() => move(0, 0.05)}
        />
      </Row>
      <Row style={{ flexWrap: "wrap" }}>
        <Button
          secondary
          label={t("rotatePhoto")}
          disabled={busy}
          onPress={() => void edit(true)}
        />
        <Button
          secondary
          label={t("cropPhoto")}
          disabled={busy || box.size === 1}
          onPress={() => void edit(false)}
        />
        <Button
          secondary
          label={t("resetPhotoEdit")}
          disabled={busy}
          onPress={() =>
            Image.getSize(uri, (width, height) => {
              setImage({ uri, width, height });
              setBox({ x: 0, y: 0, size: 1 });
            })
          }
        />
      </Row>
      <Button
        label={t("useThisImage")}
        loading={busy}
        disabled={busy || !image.width}
        onPress={() => {
          files.current.delete(image.uri);
          onAccept(image.uri);
        }}
      />
      <Button
        secondary
        label={t("cancel")}
        disabled={busy}
        onPress={onCancel}
      />
    </View>
  );
}
