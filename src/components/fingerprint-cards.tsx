import * as Crypto from "expo-crypto";
import { useRef, useState } from "react";
import { View, type ViewStyle } from "react-native";
import { scanTemplates } from "../domain/fingerprints";
import type { FingerprintEntry, FingerprintSlot } from "../domain/models";
import { useApp } from "../state/app-context";
import { playEnrollmentSuccess } from "../services/enrollment-sound";
import { FingerprintPrompt } from "./fingerprint-prompt";
import {
  Button,
  Card,
  Disclosure,
  Field,
  Icon,
  Notice,
  Row,
  Txt,
  colors,
  errorText,
} from "./ui";

export function FingerprintCards({
  entries,
  customerId,
  onChange,
  onDuplicate,
  temporaryIds = [],
  manageStored = true,
  cardStyle,
}: {
  entries: FingerprintEntry[];
  customerId: string;
  onChange: (
    entries: FingerprintEntry[],
    reason: string,
  ) => void | Promise<void>;
  onDuplicate?: (id: string) => void;
  temporaryIds?: string[];
  manageStored?: boolean;
  cardStyle?: ViewStyle;
}) {
  const app = useApp(),
    { t } = app;
  const [action, setAction] = useState<{
    slot: FingerprintSlot;
    remove: boolean;
  } | null>(null);
  const [scanning, setScanning] = useState(false),
    [busy, setBusy] = useState(false);
  const [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const original = entries.find((f) => f.slot === action?.slot);
  const needsReason = !!original && !temporaryIds.includes(original.id);
  const saving = useRef(false);
  async function save(next: FingerprintEntry[], enrollment = false) {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await onChange(next, reason);
      if (enrollment) void playEnrollmentSuccess();
      setAction(null);
      setReason("");
      setScanning(false);
    } catch (e) {
      setScanning(false);
      setError(errorText(e, t));
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  function begin(slot: FingerprintSlot, remove: boolean) {
    setError("");
    setReason("");
    setAction({ slot, remove });
    if (!remove && !entries.some((f) => f.slot === slot)) setScanning(true);
  }
  return (
    <View style={{ gap: 4 }}>
      {(["primary", "backup"] as const).map((slot) => {
        const finger = entries.find((f) => f.slot === slot);
        const manage =
          (manageStored && app.membership?.role === "owner") ||
          (finger && temporaryIds.includes(finger.id));
        const content = (
          <Card key={slot} style={cardStyle}>
            <Row>
              <Icon
                name="fingerprint"
                size={30}
                color={finger ? colors.green : colors.muted}
              />
              <View style={{ flex: 1 }}>
                <Txt bold>
                  {t(slot === "primary" ? "fpPrimary" : "fpBackup")}
                </Txt>
                <Txt muted size={12}>
                  {t(finger ? "fpEnrolled" : "fpNotEnrolled")}
                </Txt>
              </View>
            </Row>
            <View style={{ marginTop: 14, gap: 10 }}>
              {!finger ? (
                <Button
                  small
                  secondary
                  label={t("fpAdd")}
                  icon="plus"
                  disabled={busy}
                  onPress={() => begin(slot, false)}
                />
              ) : manage ? (
                <Row>
                  <View style={{ flex: 1 }}>
                    <Button
                      small
                      secondary
                      label={t("fpReplace")}
                      disabled={busy}
                      onPress={() => begin(slot, false)}
                    />
                  </View>
                  <Button
                    small
                    secondary
                    label={t("fpRemove")}
                    disabled={busy}
                    onPress={() => begin(slot, true)}
                  />
                </Row>
              ) : null}
            </View>
            {action && action.slot === slot && !scanning ? (
              <View style={{ marginTop: 16 }}>
                <Txt bold>
                  {t(action.remove ? "fpConfirmRemove" : "captureFingerprint")}
                </Txt>
                {needsReason ? (
                  <Field
                    label={t("fpReason")}
                    value={reason}
                    onChangeText={setReason}
                  />
                ) : null}
                <View style={{ gap: 10, marginTop: 12 }}>
                  <Button
                    label={t(action.remove ? "confirm" : "scanFingerprint")}
                    loading={busy}
                    disabled={needsReason && !reason.trim()}
                    onPress={() =>
                      action.remove
                        ? void save(
                            entries.filter((f) => f.slot !== action.slot),
                          )
                        : setScanning(true)
                    }
                  />
                  <Button
                    secondary
                    label={t("cancel")}
                    disabled={busy}
                    onPress={() => setAction(null)}
                  />
                </View>
              </View>
            ) : null}
          </Card>
        );
        return slot === "backup" ? (
          <Disclosure
            key={slot}
            title={t("fpBackup")}
            hint={t(finger ? "fpEnrolled" : "fpNotEnrolled")}
            icon="fingerprint"
            forceOpen={action?.slot === "backup" && !scanning}
          >
            {content}
          </Disclosure>
        ) : (
          content
        );
      })}
      <Notice message={error} tone="error" />
      {scanning && action ? (
        <FingerprintPrompt
          mode="enroll"
          excludeTemplateId={original?.id}
          templates={[
            ...scanTemplates(app.customers).filter(
              (f) => f.id !== original?.id,
            ),
            ...entries
              .filter(
                (f) => temporaryIds.includes(f.id) && f.id !== original?.id,
              )
              .map((f) => ({ id: f.id, customerId, template: f.template })),
          ]}
          onEnrolled={(template) =>
            save(
              [
                ...entries.filter((f) => f.slot !== action.slot),
                {
                  id: Crypto.randomUUID(),
                  slot: action.slot,
                  template,
                  enrolledAt: new Date().toISOString(),
                  enrolledBy: app.membership!.userId,
                },
              ],
              true,
            )
          }
          onDuplicate={onDuplicate}
          onClose={() => setScanning(false)}
        />
      ) : null}
    </View>
  );
}
