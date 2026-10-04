import { Tabs } from "expo-router";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, Icon, scriptFont, type IconName } from "../../components/ui";
import { useApp } from "../../state/app-context";

const tabColors = {
  background: "#FFFFFF",
  border: "#E5E6F2",
  inactive: "#686C83",
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
    <View style={styles.icon}>
      <Icon
        name={focused ? filled : outline}
        size={24}
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
        tabBarActiveTintColor: colors.paper,
        tabBarInactiveTintColor: tabColors.inactive,
        tabBarActiveBackgroundColor: colors.green,
        tabBarInactiveBackgroundColor: "transparent",
        tabBarHideOnKeyboard: true,
        tabBarLabelPosition: "below-icon",
        tabBarStyle: [
          styles.dock,
          {
            width: Math.min(width - insets.left - insets.right - 24, 600),
            height: 82 + Math.max(0, Math.min(fontScale, 1.5) - 1) * 28,
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
              outline="home-outline"
              filled="home"
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
    marginTop: 8,
    paddingTop: 7,
    paddingBottom: 7,
    paddingHorizontal: 6,
    backgroundColor: tabColors.background,
    borderWidth: 1,
    borderTopWidth: 1,
    borderColor: tabColors.border,
    borderTopColor: tabColors.border,
    borderRadius: 29,
    boxShadow: "0 5px 20px rgba(37, 41, 69, 0.09)",
    elevation: 0,
  },
  item: {
    borderRadius: 22,
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
    color: colors.paper,
    fontWeight: "700",
  },
});
