import { router } from "expo-router";
import { View } from "react-native";
import { isShopProfileComplete } from "../domain/shop-profile";
import { useApp } from "../state/app-context";
import { Button, Card, Icon, Row, Txt, colors } from "./ui";

export function ShopProfileNotice() {
  const { membership, t } = useApp();
  if (!membership || isShopProfileComplete(membership.profile)) return null;
  const owner = membership.role === "owner";
  return (
    <Card style={{ backgroundColor: "#FFF8E9", borderColor: "#ECDDAD" }}>
      <Row style={{ alignItems: "flex-start" }}>
        <Icon name="store-alert-outline" color={colors.ink} />
        <View style={{ flex: 1 }}>
          <Txt bold size={15}>
            {t("completeShopProfile")}
          </Txt>
          <Txt size={12} muted style={{ marginTop: 4, marginBottom: 12 }}>
            {t(owner ? "shopRequired" : "shopOwnerRequired")}
          </Txt>
          <Button
            small
            label={t(owner ? "completeShopProfile" : "shopDetails")}
            icon="storefront-outline"
            onPress={() => router.push("/shop-profile")}
          />
        </View>
      </Row>
    </Card>
  );
}
