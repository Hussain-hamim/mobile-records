import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useFonts } from "expo-font";
import { AppProvider, useApp } from "../state/app-context";
import { AuthScreen } from "../components/auth-screen";
import { colors } from "../components/ui";
function Routes() {
  const { phase } = useApp();
  return (
    <>
      <StatusBar style="dark" />
      {phase === "ready" ? (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="new-record" />
          <Stack.Screen name="record/[id]" />
        </Stack>
      ) : (
        <AuthScreen />
      )}
    </>
  );
}
export default function Layout() {
  const [loaded, error] = useFonts({
    Noto: require("../../assets/fonts/NotoSansArabic.ttf"),
  });
  if (!loaded && !error) return null;
  return (
    <AppProvider>
      <Routes />
    </AppProvider>
  );
}
