import { useState } from "react";
import { Switch, View } from "react-native";
import { useApp } from "../../state/app-context";
import { backend } from "../../data/backend";
import { emptyShop } from "../../domain/models";
import { normalizePhone } from "../../domain/validation";
import {
  Button,
  Card,
  Chip,
  Field,
  Heading,
  Notice,
  Row,
  Screen,
  Txt,
  errorText,
} from "../../components/ui";
import { PersonFields } from "../../components/person-fields";
export default function Settings() {
  const app = useApp();
  const { t } = app;
  const [profile, setProfile] = useState(() => ({
    ...emptyShop(),
    ...app.membership?.profile,
  }));
  const [phone, setPhone] = useState("");
  const [staff, setStaff] = useState<
    { user_id: string; phone: string; role: string; active: boolean }[]
  >([]);
  const [credential, setCredential] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  async function manage(action: string, extra: Record<string, unknown> = {}) {
    if (!backend || app.demo) throw new Error("setup");
    const { data, error } = await backend.functions.invoke("manage-account", {
      body: { action, shopId: app.membership?.shopId, ...extra },
    });
    if (error || data?.error) throw new Error(data?.error ?? error?.message);
    return data;
  }
  return (
    <Screen>
      <Heading title={t("settings")} />
      {app.demo ? <Notice message={t("demoBanner")} /> : null}
      <Notice message={message} />
      <Card>
        <Txt bold>{t("language")}</Txt>
        <Row style={{ marginVertical: 16 }}>
          {(["ps", "fa", "en"] as const).map((l) => (
            <Chip
              key={l}
              label={l === "ps" ? "پښتو" : l === "fa" ? "دری" : "English"}
              active={app.language === l}
              onPress={() => void app.preferences(l, app.gregorian)}
            />
          ))}
        </Row>
        <Row style={{ justifyContent: "space-between" }}>
          <Txt size={13}>{t("calendar")}</Txt>
          <Switch
            accessibilityLabel={t("calendar")}
            value={app.gregorian}
            onValueChange={(value) => void app.preferences(app.language, value)}
          />
        </Row>
      </Card>
      <Card>
        <Heading title={t("shopDetails")} subtitle={t("shopHint")} />
        {app.membership?.role === "owner" ? (
          <>
            {(
              ["shopName", "licenceNumber", "shopNumber", "address"] as const
            ).map((k) => (
              <Field
                key={k}
                label={t(k)}
                value={profile[k]}
                onChangeText={(v) => setProfile({ ...profile, [k]: v })}
              />
            ))}
            <PersonFields
              value={profile}
              onChange={(p) => setProfile({ ...profile, ...p })}
            />
            <Button
              label={t("save")}
              loading={busy}
              onPress={() =>
                void run(async () => {
                  await app.saveProfile(profile);
                  setMessage(t("saved"));
                })
              }
            />
          </>
        ) : (
          <>
            <Txt>{profile.shopName}</Txt>
            <Txt>{profile.address}</Txt>
          </>
        )}
      </Card>
      <Card>
        <Heading title={t("syncIssues")} />
        {app.notice ? (
          <Notice message={errorText(new Error(app.notice), t)} />
        ) : null}
        {app.operations
          .filter((o) => o.state === "conflict" || o.state === "failed")
          .map((o) => (
            <View key={o.id} style={{ marginBottom: 20 }}>
              <Txt size={12}>{t(o.state)}</Txt>
              {o.state === "conflict" &&
              ["shop", "customer"].includes(o.kind) ? (
                <>
                  <Button
                    small
                    secondary
                    label={t("resetLocal")}
                    disabled={busy}
                    onPress={() => void run(() => app.resolve(o, false))}
                  />
                  <View style={{ height: 8 }} />
                  <Button
                    small
                    label={t("keepLocal")}
                    disabled={busy}
                    onPress={() => void run(() => app.resolve(o, true))}
                  />
                </>
              ) : null}
            </View>
          ))}
        <Button
          label={t("sync")}
          secondary
          loading={app.syncing}
          disabled={app.demo}
          onPress={() => void app.sync()}
        />
      </Card>
      {app.membership?.role === "owner" ? (
        <Card>
          <Heading title={t("staff")} />
          <Button
            label={t("staff")}
            secondary
            loading={busy}
            disabled={app.demo}
            onPress={() =>
              void run(async () => setStaff((await manage("list")).members))
            }
          />
          {staff.map((m) => (
            <View key={m.user_id} style={{ marginTop: 15 }}>
              <Txt>{m.phone}</Txt>
              <Txt size={12} muted>
                {t(m.role === "owner" ? "owner" : "employee")} ·{" "}
                {m.active ? "✓" : "—"}
              </Txt>
              {m.role === "staff" && m.active ? (
                <Button
                  small
                  secondary
                  label={t("revoke")}
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await manage("revoke", { userId: m.user_id });
                      setStaff((await manage("list")).members);
                    })
                  }
                />
              ) : null}
            </View>
          ))}
          <View style={{ height: 20 }} />
          <Field
            label={t("phone")}
            value={phone}
            onChangeText={setPhone}
            numeric
            keyboardType="phone-pad"
          />
          <Button
            label={t("invite")}
            loading={busy}
            disabled={app.demo}
            onPress={() =>
              void run(async () => {
                setCredential("");
                const data = await manage("invite", {
                  phone: normalizePhone(phone),
                });
                setCredential(data.password);
                setPhone("");
              })
            }
          />
          {credential ? (
            <View style={{ marginTop: 16 }}>
              <Notice message={t("copied")} />
              <Txt>{credential}</Txt>
              <Button
                small
                secondary
                label={t("close")}
                onPress={() => setCredential("")}
              />
            </View>
          ) : null}
        </Card>
      ) : null}
      <Notice message={t("photoPrivacy")} />
      <Button
        label={t("signOut")}
        secondary
        icon="logout"
        loading={busy}
        onPress={() => void run(app.signOut)}
      />
    </Screen>
  );
}
