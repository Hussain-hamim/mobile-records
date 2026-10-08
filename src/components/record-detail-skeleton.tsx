import { useEffect } from "react";
import { View } from "react-native";
import Animated, {
  cancelAnimation,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import { useApp } from "../state/app-context";
import { Button, Card, Row, Screen, Txt, colors } from "./ui";
import { useVisualPreferences } from "./visual-effects";

function Placeholder({
  width = "100%",
  height = 16,
  dark = false,
}: {
  width?: number | `${number}%`;
  height?: number;
  dark?: boolean;
}) {
  const { rtl } = useApp();
  return (
    <View
      style={{
        width,
        height,
        borderRadius: height > 30 ? 10 : 6,
        backgroundColor: dark ? "#547466" : "#DCE7DF",
        alignSelf: rtl ? "flex-end" : "flex-start",
      }}
    />
  );
}

export function RecordDetailSkeleton({ onBack }: { onBack: () => void }) {
  const { t } = useApp();
  const { reduceMotion } = useVisualPreferences();
  const opacity = useSharedValue(1);
  const pulse = useAnimatedStyle(() => ({ opacity: opacity.get() }));
  useEffect(() => {
    if (reduceMotion) opacity.set(1);
    else
      opacity.set(
        withRepeat(
          withTiming(0.45, { duration: 950 }),
          -1,
          true,
          undefined,
          ReduceMotion.System,
        ),
      );
    return () => cancelAnimation(opacity);
  }, [opacity, reduceMotion]);

  return (
    <Screen>
      <Row style={{ marginBottom: 12, justifyContent: "space-between" }}>
        <View style={{ flex: 1, gap: 10 }}>
          <View
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Placeholder width="75%" height={24} />
          </View>
          <Txt muted size={14} accessibilityLiveRegion="polite">
            {t("loading")}
          </Txt>
        </View>
        <Button small secondary label={t("back")} onPress={onBack} />
      </Row>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={t("loading")}
        accessibilityState={{ busy: true }}
      >
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <Card
            style={{
              backgroundColor: colors.navy,
              borderColor: colors.navy,
              padding: 20,
            }}
          >
            <Animated.View style={[pulse, { gap: 22 }]}>
              <Row style={{ justifyContent: "space-between" }}>
                <Placeholder width={85} height={30} dark />
                <Placeholder width={70} height={14} dark />
              </Row>
              <Placeholder width="75%" height={27} dark />
              <View style={{ gap: 8 }}>
                <Placeholder width={65} height={12} dark />
                <Placeholder width="60%" height={36} dark />
              </View>
            </Animated.View>
          </Card>
          <Card>
            <Animated.View style={[pulse, { gap: 18 }]}>
              <Row>
                <Placeholder width={42} height={42} />
                <View style={{ flex: 1 }}>
                  <Placeholder width="65%" height={18} />
                </View>
              </Row>
              <View style={{ gap: 10 }}>
                <Placeholder width="65%" height={23} />
                <Placeholder width="45%" />
              </View>
              <Placeholder height={44} />
              <View
                style={{
                  gap: 10,
                  paddingTop: 12,
                  borderTopWidth: 1,
                  borderTopColor: colors.line,
                }}
              >
                <Placeholder width="30%" height={12} />
                <Placeholder width="55%" />
              </View>
              <Placeholder height={44} />
            </Animated.View>
          </Card>
          <Card
            style={{ backgroundColor: colors.mint, borderColor: "#D6E5DA" }}
          >
            <Animated.View style={[pulse, { gap: 20 }]}>
              <Placeholder width="40%" height={22} />
              <Placeholder width="55%" height={32} />
              <Row>
                <View style={{ flex: 1 }}>
                  <Placeholder height={44} />
                </View>
                <View style={{ flex: 1 }}>
                  <Placeholder height={44} />
                </View>
              </Row>
              <Placeholder height={44} />
            </Animated.View>
          </Card>
          <Card>
            <Animated.View style={[pulse, { gap: 18 }]}>
              <Placeholder width="50%" height={22} />
              <Placeholder width="25%" height={12} />
              <Placeholder width="70%" />
            </Animated.View>
          </Card>
        </View>
      </View>
    </Screen>
  );
}
