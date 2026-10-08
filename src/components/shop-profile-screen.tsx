import { useRef, useState } from "react";
import { router } from "expo-router";
import { emptyShop } from "../domain/models";
import { isShopProfileComplete } from "../domain/shop-profile";
import { useApp } from "../state/app-context";
import { PersonFields } from "./person-fields";
import {
  Button,
  Card,
  Field,
  Heading,
  Notice,
  Screen,
  Txt,
  errorText,
} from "./ui";

export function ShopProfileScreen() {
  const app = useApp();
  const { t } = app;
  const [profile, setProfile] = useState(() => ({
    ...emptyShop(),
    ...app.membership?.profile,
  }));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const owner = app.membership?.role === "owner";
  function back() {
    if (router.canGoBack()) router.back();
    else router.replace("/(tabs)/settings");
  }
  async function save() {
    if (!owner || saving.current) return;
    setError("");
    if (!isShopProfileComplete(profile)) {
      setError(t("shopRequired"));
      return;
    }
    saving.current = true;
    setBusy(true);
    try {
      await app.saveProfile(profile);
      back();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <Screen resetKey={error}>
      <Heading
        title={t("shopDetails")}
        subtitle={t("shopHint")}
        action={
          <Button
            small
            secondary
            disabled={busy}
            label={t("back")}
            onPress={back}
          />
        }
      />
      <Notice message={error} tone="error" />
      {!isShopProfileComplete(app.membership?.profile) ? (
        <Notice message={t(owner ? "shopRequired" : "shopOwnerRequired")} />
      ) : null}
      <Card>
        {owner ? (
          <>
            {(
              ["shopName", "licenceNumber", "shopNumber", "address"] as const
            ).map((key) => (
              <Field
                key={key}
                label={
                  t(key) + (["shopName", "address"].includes(key) ? " *" : "")
                }
                value={profile[key]}
                onChangeText={(value) =>
                  setProfile((current) => ({ ...current, [key]: value }))
                }
              />
            ))}
            <PersonFields
              value={profile}
              onChange={(person) =>
                setProfile((current) => ({ ...current, ...person }))
              }
            />
            <Button
              label={t("save")}
              loading={busy}
              onPress={() => void save()}
            />
          </>
        ) : (
          <>
            <Txt bold>{profile.shopName}</Txt>
            <Txt>{profile.name}</Txt>
            <Txt>{profile.address}</Txt>
          </>
        )}
      </Card>
    </Screen>
  );
}
