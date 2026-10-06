import { useState } from "react";
import { Image, View } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { company } from "../domain/company";
import { useApp } from "../state/app-context";
import {
  Button,
  Card,
  Heading,
  Icon,
  Notice,
  Row,
  Screen,
  SectionTitle,
  Txt,
  colors,
} from "./ui";

export function SupportScreen() {
  const { t } = useApp();
  const [error, setError] = useState("");
  async function open(url: string) {
    setError("");
    try {
      await Linking.openURL(url);
    } catch {
      setError(t("supportLinkFailed"));
    }
  }
  return (
    <Screen>
      <Heading
        title={t("supportTitle")}
        subtitle={t("supportSubtitle")}
        action={
          <Button
            small
            secondary
            label={t("back")}
            onPress={() =>
              router.canGoBack()
                ? router.back()
                : router.replace("/(tabs)/settings")
            }
          />
        }
      />
      <Card style={{ backgroundColor: colors.mint, borderColor: colors.mint }}>
        <Row style={{ marginBottom: 16 }}>
          <Image
            source={require("../../assets/Radefy Systems - Logo Variations by Alif Design-04.png")}
            accessibilityLabel={company.name}
            resizeMode="contain"
            style={{ width: 64, height: 64 }}
          />
          <View style={{ flex: 1 }}>
            <Txt size={23} bold>
              {company.name}
            </Txt>
            <Txt muted size={13}>
              {t("supportCompanyRole")}
            </Txt>
          </View>
        </Row>
        <Txt>{t("supportAbout")}</Txt>
      </Card>
      <Notice message={error} tone="error" />
      <Card>
        <SectionTitle title={t("supportContact")} icon="message-text-outline" />
        <View style={{ gap: 12, marginTop: 16 }}>
          <Row>
            <Icon name="phone-outline" color={colors.green} />
            <Txt bold style={{ writingDirection: "ltr", textAlign: "left" }}>
              {company.phoneLabel}
            </Txt>
          </Row>
          <Button
            icon="whatsapp"
            label={t("supportWhatsapp")}
            onPress={() => void open(company.whatsappUrl)}
          />
          <Button
            secondary
            icon="phone-outline"
            label={t("supportCall")}
            onPress={() => void open(company.phoneUrl)}
          />
          <Txt
            muted
            size={13}
            style={{ writingDirection: "ltr", textAlign: "center" }}
          >
            {company.websiteLabel}
          </Txt>
          <Button
            secondary
            icon="web"
            label={t("supportWebsite")}
            onPress={() => void open(company.website)}
          />
        </View>
      </Card>
      <Card style={{ backgroundColor: "#EFF7F3", borderColor: "#DCECE3" }}>
        <SectionTitle
          title={t("photoOnlineTitle")}
          icon="cloud-upload-outline"
        />
        <View style={{ gap: 10, marginTop: 14 }}>
          <Txt>{t("photoContactAdminHint")}</Txt>
          <Txt muted size={13}>
            {t("supportStorageDetails")}
          </Txt>
        </View>
      </Card>
    </Screen>
  );
}
