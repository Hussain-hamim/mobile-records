import { useEffect } from "react";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useVisualPreferences } from "../../components/visual-effects";
import { motion } from "../../components/theme";
import { Tabs } from "expo-router";
import { StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, Icon, Txt, type IconName } from "../../components/ui";
import { useApp } from "../../state/app-context";

const tabColors = {
  background: "#FFFFFF",
  border: colors.line,
  inactive: colors.muted,
};

function TabIcon({
  focused,
  outline,
  filled,
}: {
  focused: boolean;
  outline: IconName;
  filled: IconName;
}) {
  const { reduceMotion } = useVisualPreferences();
  const active = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    active.value = withTiming(focused ? 1 : 0, {
      duration: reduceMotion ? 0 : motion.tab,
    });
  }, [focused, reduceMotion, active]);
  const indicator = useAnimatedStyle(() => ({ opacity: active.value }));
  return (
    <View style={styles.icon}>
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: colors.mint, borderRadius: 12 },
          indicator,
        ]}
      />
      <Icon
        name={focused ? filled : outline}
        size={24}
        color={focused ? colors.green : tabColors.inactive}
      />
    </View>
  );
}

export default function Layout() {
  const { t, rtl } = useApp();
  const { reduceTransparency } = useVisualPreferences();
  const insets = useSafeAreaInsets();
  const { fontScale } = useWindowDimensions();
  return (
    <Tabs
      safeAreaInsets={{ bottom: 0, left: 0, right: 0 }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: tabColors.inactive,
        tabBarActiveBackgroundColor: "transparent",
        tabBarInactiveBackgroundColor: "transparent",
        tabBarHideOnKeyboard: true,
        tabBarBackground: () => (
          <View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { backgroundColor: "#E3EFE7" }]}
          >
            <View
              style={[
                StyleSheet.absoluteFill,
                {
                  backgroundColor: reduceTransparency
                    ? "#F0F6F1"
                    : "rgba(255,255,255,0.72)",
                },
              ]}
            />
          </View>
        ),
        tabBarLabelPosition: "below-icon",
        tabBarStyle: [
          styles.dock,
          {
            width: "100%",
            height: 64 + insets.bottom + Math.max(0, fontScale - 1) * 24,
            paddingBottom: insets.bottom + 4,
            paddingLeft: insets.left + 8,
            paddingRight: insets.right + 8,
            direction: rtl ? "rtl" : "ltr",
          },
        ],
        tabBarItemStyle: styles.item,
        tabBarIconStyle: styles.iconSlot,
        tabBarLabel: ({ children, focused }) => (
          <Txt
            numberOfLines={1}
            maxFontSizeMultiplier={1.5}
            style={[styles.label, focused && styles.activeLabel]}
          >
            {children}
          </Txt>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("home"),
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} outline="home-outline" filled="home" />
          ),
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: t("records"),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              outline="book-open-outline"
              filled="book-open"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: t("customers"),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              outline="account-group-outline"
              filled="account-group"
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings"),
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} outline="cog-outline" filled="cog" />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  dock: {
    alignSelf: "center",
    marginTop: 0,
    paddingTop: 4,
    paddingBottom: 7,
    paddingHorizontal: 6,
    backgroundColor: "#F0F6F1",
    borderWidth: 0,
    borderTopWidth: 1,
    borderColor: tabColors.border,
    borderTopColor: tabColors.border,
    borderRadius: 0,

    elevation: 0,
  },
  item: {
    borderRadius: 0,
    marginHorizontal: 3,
    overflow: "hidden",
  },
  iconSlot: {
    width: 40,
    height: 30,
  },
  icon: {
    width: 40,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 12,
    lineHeight: 23,
    textAlign: "center",
    color: tabColors.inactive,
  },
  activeLabel: {
    color: colors.green,
    fontWeight: "700",
  },
});
