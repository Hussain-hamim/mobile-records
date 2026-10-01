import { Tabs } from "expo-router";
import { useApp } from "../../state/app-context";
import { colors, Icon } from "../../components/ui";
export default function Layout() {
  const { t } = useApp();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.green,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: {
          backgroundColor: colors.paper,
          borderTopColor: colors.line,
          height: 78,
          paddingTop: 8,
          paddingBottom: 12,
        },
        tabBarLabelStyle: { fontFamily: "Noto", fontSize: 10 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t("home"),
          tabBarIcon: ({ color }) => (
            <Icon name="view-dashboard-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: t("records"),
          tabBarIcon: ({ color }) => (
            <Icon name="book-open-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: t("customers"),
          tabBarIcon: ({ color }) => (
            <Icon name="account-group-outline" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t("settings"),
          tabBarIcon: ({ color }) => <Icon name="tune-variant" color={color} />,
        }}
      />
    </Tabs>
  );
}
