import { Tabs } from "expo-router";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, Icon, scriptFont, type IconName } from "../../components/ui";
import { useApp } from "../../state/app-context";

const tabColors = {
  background: "#E5E7F6",
  border: "#CDD1EA",
  inactive: "#555A75",
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
  return (
    <View style={[styles.icon, focused && styles.activeIcon]}>
      <Icon
        name={focused ? filled : outline}
        size={23}
        color={focused ? colors.paper : tabColors.inactive}
      />
    </View>
  );
}

export default function Layout() {
  const { t, rtl, language } = useApp();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  return (
    <Tabs
      safeAreaInsets={{ bottom: 0, left: 0, right: 0 }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: tabColors.inactive,
        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: [
          styles.dock,
          {
            width: Math.min(width - insets.left - insets.right - 32, 560),
            height: 80 + Math.max(0, Math.min(fontScale, 1.5) - 1) * 24,
            marginBottom: Math.max(insets.bottom, 12),
            direction: rtl ? "rtl" : "ltr",
          },
        ],
        tabBarItemStyle: styles.item,
        tabBarIconStyle: styles.iconSlot,
        tabBarLabel: ({ children, focused }) => (
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.5}
            style={[
              styles.label,
              focused && styles.activeLabel,
              {
                writingDirection: rtl ? "rtl" : "ltr",
                fontFamily: scriptFont(language),
                fontWeight: language === "ps" ? "normal" : focused ? "700" : "400",
              },
            ]}
          >
            {children}
          </Text>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("home"),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              outline="view-dashboard-outline"
              filled="view-dashboard"
            />
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
    paddingTop: 8,
    paddingBottom: 7,
    paddingHorizontal: 6,
    backgroundColor: tabColors.background,
    borderWidth: 1,
    borderTopWidth: 1,
    borderColor: tabColors.border,
    borderTopColor: tabColors.border,
    borderRadius: 28,
    boxShadow: "0 6px 24px rgba(37, 41, 69, 0.08)",
    elevation: 0,
  },
  item: {
    borderRadius: 21,
    paddingVertical: 2,
  },
  iconSlot: {
    width: 54,
    height: 34,
  },
  icon: {
    width: 54,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
  },
  activeIcon: {
    backgroundColor: colors.green,
  },
  label: {
    fontSize: 11,
    lineHeight: 21,
    textAlign: "center",
    color: tabColors.inactive,
  },
  activeLabel: {
    color: colors.green,
    fontWeight: "700",
  },
});
