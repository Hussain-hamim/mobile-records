import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  cancelAnimation,
  Easing,
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useApp } from "../state/app-context";
import { Icon, Txt, colors } from "./ui";
import { useVisualPreferences } from "./visual-effects";

const DURATION = 2200;
const CONFETTI_DURATION = 1350;
const palette = ["#3C9B71", "#80C9A6", "#E4B95F", "#8BB6CE", "#DDA39C"];
// A small, fixed burst: no per-frame React updates or random allocations.
const pieces = Array.from({ length: 24 }, (_, index) => ({
  index,
  left: (index + 0.5) / 24,
  delay: (index % 5) * 40,
  drift: ((index * 29) % 85) - 42,
  rotation: index * 47,
  color: palette[index % palette.length],
}));
type Success = { id: number; message: string; confetti: boolean };
type Notify = (message: string, options?: { confetti?: boolean }) => void;
const SuccessContext = createContext<Notify | null>(null);

export function SuccessFeedbackProvider({ children }: { children: ReactNode }) {
  const [success, setSuccess] = useState<Success | null>(null);
  const sequence = useRef(0);
  const notify = useCallback<Notify>((message, options) => {
    setSuccess({
      id: ++sequence.current,
      message,
      confetti: options?.confetti ?? true,
    });
  }, []);
  const dismiss = useCallback((id: number) => {
    setSuccess((current) => (current?.id === id ? null : current));
  }, []);
  return (
    <SuccessContext value={notify}>
      <View style={styles.root}>
        {children}
        {success ? (
          <SuccessOverlay
            key={success.id}
            success={success}
            onDismiss={dismiss}
          />
        ) : null}
      </View>
    </SuccessContext>
  );
}

export function useSuccessFeedback() {
  const notify = useContext(SuccessContext);
  if (!notify) throw new Error("Missing SuccessFeedbackProvider");
  return notify;
}

function SuccessOverlay({
  success,
  onDismiss,
}: {
  success: Success;
  onDismiss: (id: number) => void;
}) {
  const { t, rtl } = useApp();
  const { reduceMotion } = useVisualPreferences();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const progress = useSharedValue(0);
  const announcement = `${t("done")}. ${success.message}`;
  useEffect(() => {
    if (!reduceMotion) {
      progress.set(
        withTiming(1, { duration: DURATION, easing: Easing.linear }),
      );
    }
    const timeout = setTimeout(() => onDismiss(success.id), DURATION);
    // On the web the live region below announces it; native uses the OS announcement.
    if (Platform.OS !== "web")
      AccessibilityInfo.announceForAccessibility(announcement);
    return () => {
      clearTimeout(timeout);
      cancelAnimation(progress);
    };
  }, [announcement, onDismiss, progress, reduceMotion, success.id]);
  const banner = useAnimatedStyle(() => ({
    opacity: reduceMotion
      ? 1
      : interpolate(
          progress.get(),
          [0, 0.07, 0.88, 1],
          [0, 1, 1, 0],
          Extrapolation.CLAMP,
        ),
    transform: [
      {
        translateY: reduceMotion
          ? 0
          : interpolate(
              progress.get(),
              [0, 0.09, 0.88, 1],
              [-12, 0, 0, -6],
              Extrapolation.CLAMP,
            ),
      },
    ],
  }));
  const check = useAnimatedStyle(() => ({
    transform: [
      {
        scale: reduceMotion
          ? 1
          : interpolate(
              progress.get(),
              [0, 0.1, 0.16],
              [0.72, 1.06, 1],
              Extrapolation.CLAMP,
            ),
      },
    ],
  }));
  return (
    <View pointerEvents="none" style={styles.overlay}>
      {success.confetti && !reduceMotion ? (
        <View pointerEvents="none" aria-hidden style={StyleSheet.absoluteFill}>
          {pieces.map((piece) => (
            <ConfettiPiece
              key={piece.index}
              piece={piece}
              progress={progress}
              width={width}
              distance={Math.min(height * 0.55, 420)}
            />
          ))}
        </View>
      ) : null}
      <Animated.View
        accessible
        accessibilityLabel={announcement}
        role="status"
        aria-live="polite"
        style={[
          styles.banner,
          {
            // Keep the compact confirmation centered below the header.
            marginTop: insets.top + 72,
            marginLeft: insets.left + 16,
            marginRight: insets.right + 16,
            alignSelf: "center",
            flexDirection: rtl ? "row-reverse" : "row",
          },
          banner,
        ]}
      >
        <Animated.View style={[styles.check, check]}>
          <Icon name="check" color="#fff" size={15} />
        </Animated.View>
        <Txt bold size={13} style={{ flexShrink: 1 }}>
          {t("done")}
        </Txt>
      </Animated.View>
    </View>
  );
}

function ConfettiPiece({
  piece,
  progress,
  width,
  distance,
}: {
  piece: (typeof pieces)[number];
  progress: SharedValue<number>;
  width: number;
  distance: number;
}) {
  const animated = useAnimatedStyle(() => {
    const elapsed = progress.get() * DURATION - piece.delay;
    const fall = Math.max(0, Math.min(1, elapsed / CONFETTI_DURATION));
    return {
      opacity:
        elapsed <= 0
          ? 0
          : interpolate(
              fall,
              [0, 0.1, 0.65, 1],
              [0, 0.9, 0.8, 0],
              Extrapolation.CLAMP,
            ),
      transform: [
        { translateX: piece.drift * fall + Math.sin(fall * Math.PI * 2) * 14 },
        { translateY: -18 + distance * (0.3 * fall + 0.7 * fall * fall) },
        {
          rotate: `${piece.rotation + fall * (piece.index % 2 ? 340 : -300)}deg`,
        },
        { scaleX: 0.5 + Math.abs(Math.cos(fall * Math.PI * 3)) * 0.5 },
      ],
    };
  });
  return (
    <Animated.View
      style={[
        styles.piece,
        {
          left: width * piece.left,
          backgroundColor: piece.color,
          height: piece.index % 3 === 0 ? 6 : 10,
          borderRadius: piece.index % 3 === 0 ? 3 : 1,
        },
        animated,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
    elevation: 1000,
    overflow: "hidden",
  },
  banner: {
    maxWidth: 160,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: "#D5E9DE",
    boxShadow: "0 3px 10px rgba(25, 55, 47, 0.10)",
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.green,
  },
  piece: { position: "absolute", top: 0, width: 5 },
});
