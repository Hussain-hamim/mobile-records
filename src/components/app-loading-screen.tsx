import { ActivityIndicator, Image, StyleSheet, View } from "react-native";
import { useApp } from "../state/app-context";
import { colors, Screen, Txt } from "./ui";

export function AppLoadingScreen() {
  const { t } = useApp();

  return (
    <Screen ambient scroll={false} style={styles.screen}>
      <View style={styles.logo}>
        <Image
          source={require("../../assets/images/mobilereg-icon.png")}
          accessibilityLabel="Radefy MobileReg"
          resizeMode="contain"
          style={styles.image}
        />
      </View>
      <Txt size={26} bold style={styles.title}>
        {t("app")}
      </Txt>
      <ActivityIndicator
        size="large"
        color={colors.green}
        accessibilityLabel={t("loading")}
        accessibilityState={{ busy: true }}
        style={styles.spinner}
      />
      <Txt muted style={styles.title}>
        {t("loading")}
      </Txt>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: "center", justifyContent: "center" },
  logo: {
    backgroundColor: "#19372F",
    borderRadius: 28,
    overflow: "hidden",
    marginBottom: 12,
  },
  image: { width: 112, height: 112 },
  title: { textAlign: "center" },
  spinner: { marginTop: 32, marginBottom: 16 },
});
