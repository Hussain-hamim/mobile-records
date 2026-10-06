import { useState } from "react";
import { router } from "expo-router";
import { Platform, View } from "react-native";
import { useApp } from "../state/app-context";
import { photoState } from "../domain/online-photos";
import { Button, Card, SectionTitle, Notice, Txt, errorText } from "./ui";
export function PhotoStorageSettings() {
  const app = useApp();
  const { t, onlinePhotos: photos } = app;
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [confirm, setConfirm] = useState(false);
  if (app.demo || !app.membership) return null;
  async function run(work: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(errorText(e, t));
    } finally {
      setBusy(false);
    }
  }
  const grant = photos.status?.entitlement;
  return (
    <Card>
      <SectionTitle title={t("photoOnlineTitle")} icon="cloud-upload-outline" />
      <Txt>{t(photoState(photos.status))}</Txt>
      <Txt muted size={12}>
        {t("photoOnlineHint")}
      </Txt>
      <Txt muted size={12} style={{ marginTop: 8 }}>
        {t("photoContactAdminHint")}
      </Txt>
      {grant && (
        <Txt muted size={12}>
          {t("photoStorageUsage")}: {(grant.used_bytes / 1e9).toFixed(2)} /{" "}
          {(grant.quota_bytes / 1e9).toFixed(2)} GB · {t("photoWaiting")}:{" "}
          {photos.jobs.length}
        </Txt>
      )}
      <Notice
        message={
          error || (photos.error ? errorText(new Error(photos.error), t) : "")
        }
        tone="error"
      />
      {photos.status?.request?.note ? (
        <Txt muted>{photos.status.request.note}</Txt>
      ) : null}
      <View style={{ gap: 8, marginTop: 12 }}>
        <Button
          label={t("supportContactAdmin")}
          secondary
          icon="message-text-outline"
          onPress={() => router.push("/support")}
        />
        {!grant?.enabled &&
          app.membership.role === "owner" &&
          photos.status?.request?.status !== "pending" && (
            <Button
              label={t("photoRequestEnable")}
              secondary
              loading={busy}
              onPress={() => void run(photos.requestActivation)}
            />
          )}
        <Button
          label={t("photoRefreshStatus")}
          secondary
          small
          loading={busy}
          onPress={() => void run(photos.refresh)}
        />
        {Platform.OS !== "web" && photos.jobs.length > 0 && (
          <Button
            label={t("photoRetryUploads")}
            secondary
            small
            loading={busy}
            onPress={() => void run(photos.retry)}
          />
        )}
        {Platform.OS !== "web" &&
          grant?.enabled &&
          app.membership.role === "owner" && (
            <Button
              label={t("photoBackfill")}
              secondary
              small
              disabled={busy}
              onPress={() => setConfirm(!confirm)}
            />
          )}
        {confirm && (
          <>
            <Txt size={12}>{t("photoBackfillConfirm")}</Txt>
            <Button
              label={t("photoBackfillStart")}
              loading={busy}
              onPress={() =>
                void run(async () => {
                  await photos.backfill();
                  setConfirm(false);
                })
              }
            />
          </>
        )}
      </View>
    </Card>
  );
}
