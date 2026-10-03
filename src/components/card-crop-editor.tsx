import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Image, PanResponder, View } from "react-native";
import type { CardCorners, Point, ScanPhoto } from "../domain/tazkira";
import { validCorners } from "../domain/tazkira";
import { Txt } from "./ui";
import { useApp } from "../state/app-context";
function Corner({
  point,
  width,
  height,
  onChange,
  label,
  index,
}: {
  point: Point;
  width: number;
  height: number;
  onChange: (point: Point) => void;
  label: string;
  index: number;
}) {
  const latest = useRef({ point, width, height, onChange });
  useLayoutEffect(() => {
    latest.current = { point, width, height, onChange };
  }, [point, width, height, onChange]);
  const start = useRef(point);
  const grant = useCallback(() => {
    start.current = latest.current.point;
  }, []);
  const move = useCallback(
    (_event: unknown, gesture: { dx: number; dy: number }) => {
      latest.current.onChange({
        x: Math.max(
          0,
          Math.min(1, start.current.x + gesture.dx / latest.current.width),
        ),
        y: Math.max(
          0,
          Math.min(1, start.current.y + gesture.dy / latest.current.height),
        ),
      });
    },
    [],
  );
  const responder = useMemo(
    () =>
      // PanResponder stores these callbacks; refs are read only during gestures.
      // eslint-disable-next-line react-hooks/refs
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: grant,
        onPanResponderMove: move,
        onPanResponderTerminationRequest: () => false,
      }),
    [grant, move],
  );
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityLabel={label}
      style={{
        position: "absolute",
        left: point.x * width - 22,
        top: point.y * height - 22,
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: "#154D46",
        borderWidth: 3,
        borderColor: "#B9F5CF",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Txt style={{ color: "#fff" }} bold>
        {index + 1}
      </Txt>
    </View>
  );
}
export function CardCropEditor({
  photo,
  corners,
  onChange,
}: {
  photo: ScanPhoto;
  corners: CardCorners;
  onChange: (corners: CardCorners) => void;
}) {
  const { t } = useApp();
  const [availableWidth, setWidth] = useState(300);
  const scale = Math.min(availableWidth / photo.width, 420 / photo.height);
  const width = photo.width * scale,
    height = photo.height * scale;
  return (
    <View
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ paddingVertical: 24 }}
    >
      <View style={{ width, height, alignSelf: "center" }}>
        <Image
          source={{ uri: photo.uri }}
          style={{ width, height }}
          resizeMode="contain"
        />
        {corners.map((a, i) => {
          const b = corners[(i + 1) % 4];
          const dx = (b.x - a.x) * width,
            dy = (b.y - a.y) * height;
          const length = Math.hypot(dx, dy);
          return (
            <View
              key={"edge" + i}
              pointerEvents="none"
              style={{
                position: "absolute",
                height: 2,
                width: length,
                left: ((a.x + b.x) * width) / 2 - length / 2,
                top: ((a.y + b.y) * height) / 2 - 1,
                backgroundColor: "#B9F5CF",
                transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
              }}
            />
          );
        })}
        {corners.map((point, i) => (
          <Corner
            key={i}
            point={point}
            index={i}
            width={width}
            height={height}
            label={t("cardCorner") + " " + (i + 1)}
            onChange={(next) => {
              const updated = [...corners] as CardCorners;
              updated[i] = next;
              if (validCorners(updated)) onChange(updated);
            }}
          />
        ))}
      </View>
    </View>
  );
}
