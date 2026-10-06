import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  AccessibilityInfo,
  Platform,
  Pressable,
  StyleSheet,
  View,
  type PressableProps,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  ReduceMotion,
} from "react-native-reanimated";
import { colors, gradients, motion } from "./theme";

const Preferences = createContext({
  reduceMotion: true,
  reduceTransparency: true,
});
export function VisualPreferences({ children }: { children: ReactNode }) {
  const [reduceMotion, setMotion] = useState(true);
  const [reduceTransparency, setTransparency] = useState(Platform.OS === "ios");
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (active) setMotion(v);
      })
      .catch(() => {});
    if (Platform.OS === "ios") {
      void AccessibilityInfo.isReduceTransparencyEnabled()
        .then((v) => {
          if (active) setTransparency(v);
        })
        .catch(() => {});
    }
    const m = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setMotion,
    );
    const t = AccessibilityInfo.addEventListener(
      "reduceTransparencyChanged",
      setTransparency,
    );
    return () => {
      active = false;
      m.remove();
      t.remove();
    };
  }, []);
  return (
    <Preferences value={{ reduceMotion, reduceTransparency }}>
      {children}
    </Preferences>
  );
}
export const useVisualPreferences = () => useContext(Preferences);
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
export function MotionPressable({
  style,
  onPressIn,
  onPressOut,
  ...props
}: PressableProps) {
  const { reduceMotion } = useVisualPreferences();
  const scale = useSharedValue(1);
  const [pressed, setPressed] = useState(false);
  const animated = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));
  return (
    <AnimatedPressable
      {...props}
      style={[
        typeof style === "function"
          ? style({ pressed, hovered: false })
          : style,
        animated,
      ]}
      onPressIn={(event) => {
        setPressed(true);
        scale.set(
          withTiming(reduceMotion ? 1 : 0.98, {
            duration: motion.press,
            reduceMotion: ReduceMotion.System,
          }),
        );
        onPressIn?.(event);
      }}
      onPressOut={(event) => {
        setPressed(false);
        scale.set(
          withTiming(1, {
            duration: motion.press,
            reduceMotion: ReduceMotion.System,
          }),
        );
        onPressOut?.(event);
      }}
    />
  );
}
export function GradientFill({ ambient = false }: { ambient?: boolean }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={ambient ? gradients.ambient : gradients.primary}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
  );
}
export function ModalBackdrop() {
  const { reduceTransparency } = useVisualPreferences();
  // Android modals are separate windows: without a BlurTargetView in that window,
  // use a tint. This also avoids costly pre-Android-12 blur on the Xiaomi.
  return (
    <View
      pointerEvents="none"
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: reduceTransparency ? colors.bg : "#19372F66" },
      ]}
    >
      {!reduceTransparency && Platform.OS === "ios" ? (
        <BlurView tint="light" intensity={18} style={StyleSheet.absoluteFill} />
      ) : null}
    </View>
  );
}
