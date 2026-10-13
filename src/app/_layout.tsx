import { useFonts } from "expo-font";
import { Stack, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppLoadingScreen } from "../components/app-loading-screen";
import { AuthScreen } from "../components/auth-screen";
import {
  VisualPreferences,
  useVisualPreferences,
} from "../components/visual-effects";
import { colors } from "../components/ui";
import { AppProvider, useApp } from "../state/app-context";
import { SuccessFeedbackProvider } from "../components/success-feedback";
function Routes() {
  const { phase, membership, demo } = useApp();
  const { reduceMotion } = useVisualPreferences();
  return (
    <SuccessFeedbackProvider
      key={`${phase}:${demo}:${membership?.shopId}:${membership?.userId}`}
    >
      <StatusBar style="dark" />
      {phase === "loading" ? (
        <AppLoadingScreen />
      ) : phase === "ready" ? (
        <Stack
          screenOptions={{
            animation: reduceMotion ? "none" : "default",
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
          <Stack.Screen name="shop-profile" />
          <Stack.Screen name="network" />
        </Stack>
      ) : (
        <AuthScreen />
      )}
    </SuccessFeedbackProvider>
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
      <VisualPreferences>
        <Routes />
      </VisualPreferences>
    </AppProvider>
  );
}
