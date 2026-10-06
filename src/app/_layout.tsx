import { useFonts } from "expo-font";
import { Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppLoadingScreen } from "../components/app-loading-screen";
import { AuthScreen } from "../components/auth-screen";
import { colors } from "../components/ui";
import { AppProvider, useApp } from "../state/app-context";
function Routes() {
  const { phase } = useApp();
  return (
    <>
      <StatusBar style="dark" />
      {phase === "loading" ? (
        <AppLoadingScreen />
      ) : phase === "ready" ? (
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="new-record" />
          <Stack.Screen name="record/[id]" />
          <Stack.Screen name="customer/[id]" />
          <Stack.Screen name="support" />
          <Stack.Screen name="photos-storage" />
        </Stack>
      ) : (
        <AuthScreen />
      )}
    </>
  );
}
export default function Layout() {
  const segments = useSegments();
  const [loaded, error] = useFonts({
    Noto: require("../../assets/fonts/NotoSansArabic.ttf"),
    BahijBaraem: require("../../assets/fonts/BahijBaraem-Regular.ttf"),
  });
  if (!loaded && !error) return null;
  if (segments[0] === "admin") {
    return (
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="admin" />
      </Stack>
    );
  }
  return (
    <AppProvider>
      <Routes />
    </AppProvider>
  );
}
