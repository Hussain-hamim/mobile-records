import Animated, { FadeIn } from "react-native-reanimated";
import { useVisualPreferences } from "./visual-effects";
import { useEffect, useRef, useState } from "react";
import { AppState, Modal, View } from "react-native";
import { router } from "expo-router";
import {
  enrollFingerprint,
  getReaderUsbStatus,
  identifyFingerprint,
  loadFingerprintTemplates,
  onCaptureProgress,
  onReaderStatus,
  onDuplicateFingerprint,
  openReader,
  type UsbStatus,
  type Template,
  claimReader,
} from "../services/fingerprint";
import { useApp } from "../state/app-context";
import {
  Button,
  Card,
  Heading,
  Icon,
  Notice,
  Row,
  Screen,
  Txt,
  colors,
  errorText,
} from "./ui";
import {
  playFingerprintSound,
  stopFingerprintSound,
} from "../services/enrollment-sound";
import type { TextKey } from "../i18n/strings";

const stateKeys: Record<string, TextKey> = {
  connecting: "readerConnecting",
  permission: "fpPermission",
  ready: "fingerprintPlace",
  reading: "fpReading",
  lift: "fpLift",
  verify: "fpVerify",
  mismatch: "fingerprintMismatch",
  verificationMismatch: "fpVerificationMismatch",
  reposition: "fpReposition",
  success: "fpSuccess",
  removed: "readerClosed",
};
export function FingerprintPrompt({
  mode,
  templates,
  onEnrolled,
  onIdentified,
  onClose,
  onManual,
  onNew,
  onDuplicate,
}: {
  mode: "enroll" | "identify" | "check";
  templates: Template[];
  onEnrolled?: (template: string) => void | Promise<void>;
  onIdentified?: (customerId: string) => void;
  onDuplicate?: (customerId: string) => void;
  onClose: () => void;
  onManual?: () => void;
  onNew?: () => void;
}) {
  const { reduceMotion } = useVisualPreferences();
  const { t, membership, phase, customers } = useApp();
  const [step, setStep] = useState(0),
    [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0),
    [status, setStatus] = useState("connecting");
  const [duplicate, setDuplicate] = useState("");
  const [usbStatus, setUsbStatus] = useState<UsbStatus | null>(null);
  const [noEnrollments, setNoEnrollments] = useState(false);
  const latest = useRef({ templates, mode, onEnrolled, onIdentified, t });
  const closing = useRef(Promise.resolve());
  const readerState = useRef("connecting");
  useEffect(() => {
    latest.current = { templates, mode, onEnrolled, onIdentified, t };
  });
  useEffect(() => {
    let alive = true,
      delivered = false;
    let release: (() => Promise<void>) | undefined;
    let lastRejection = -Infinity;
    let lastStatus = "connecting";
    function rejectSound() {
      if (!alive || delivered || latest.current.mode === "check") return;
      const now = Date.now();
      if (now - lastRejection < 1500) return;
      lastRejection = now;
      void playFingerprintSound("rejected");
    }
    stopFingerprintSound();
    const subscriptions = [
      onCaptureProgress((n) => {
        if (alive) setStep(n);
      }),
      onReaderStatus((s) => {
        if (!alive) return;
        if (
          s !== lastStatus &&
          ["mismatch", "verificationMismatch", "reposition"].includes(s)
        )
          rejectSound();
        lastStatus = s;
        readerState.current = s;
        setStatus(s);
        if (s === "removed") {
          setError(latest.current.t("readerClosed"));
          if (release) closing.current = release();
        }
      }),
      onDuplicateFingerprint((id) => {
        if (alive) setDuplicate(id);
      }),
    ];
    const background = AppState.addEventListener("change", (state) => {
      if (state === "active" || !alive) return;
      // A USB permission dialog pauses Android's activity too. The native
      // onStop hook still cancels if the user actually leaves the application.
      if (readerState.current === "permission") return;
      alive = false;
      setError(latest.current.t("fpInterrupted"));
      if (release) closing.current = release();
    });
    void (async () => {
      try {
        await closing.current;
        if (!alive || phase !== "ready") return;
        if (
          latest.current.mode === "identify" &&
          !latest.current.templates.length
        ) {
          setNoEnrollments(true);
          throw new Error("fpNoEnrolled");
        }
        release = claimReader();
        await openReader();
        if (!alive) return;
        if (latest.current.mode === "check") {
          setStatus("success");
          return;
        }
        await loadFingerprintTemplates(latest.current.templates);
        if (!alive) return;
        setStatus("ready");
        if (latest.current.mode === "enroll") {
          const template = await enrollFingerprint();
          if (!alive || delivered) return;
          delivered = true;
          await release();
          if (alive) await latest.current.onEnrolled?.(template);
        } else {
          const hit = await identifyFingerprint();
          if (!alive || delivered) return;
          if (!hit?.customerId) throw new Error("fingerprintNoMatch");
          delivered = true;
          await release();
          if (alive) {
            void playFingerprintSound("matched");
            latest.current.onIdentified?.(hit.customerId);
          }
        }
      } catch (reason) {
        if (!alive) return;
        const message =
          reason instanceof Error ? reason.message : String(reason);
        if (
          [
            "fingerprintNoMatch",
            "fingerprintMismatch",
            "fingerprintAmbiguous",
            "fingerprintExists",
            "fingerprintFailed",
            "fingerprintTimeout",
          ].some((key) => message.includes(key))
        )
          rejectSound();
        const connection = await getReaderUsbStatus();
        if (release) await release();
        if (!alive) return;
        setUsbStatus(connection);
        setError(errorText(reason, latest.current.t));
      }
    })();
    return () => {
      alive = false;
      // Completed feedback can finish while the profile opens or the modal closes.
      // Cancellation/retry stops pending imports and any rejection sound.
      if (!delivered) stopFingerprintSound();
      background.remove();
      subscriptions.forEach((s) => s?.remove());
      if (release) closing.current = release();
    };
  }, [attempt, membership?.shopId, membership?.userId, phase]);
  function retry() {
    readerState.current = "connecting";
    setStep(0);
    setError("");
    setDuplicate("");
    setUsbStatus(null);
    setNoEnrollments(false);
    setStatus("connecting");
    setAttempt((n) => n + 1);
  }
  function openCustomer(id: string) {
    onClose();
    if (onDuplicate) onDuplicate(id);
    else router.push({ pathname: "/customer/[id]", params: { id } });
  }
  return (
    <Modal
      animationType={reduceMotion ? "none" : "slide"}
      onRequestClose={onClose}
    >
      <Screen>
        <Heading
          title={t(
            mode === "enroll"
              ? "captureFingerprint"
              : mode === "check"
                ? "fpReaderCheck"
                : "scanFingerprint",
          )}
          action={
            <Button label={t("close")} small secondary onPress={onClose} />
          }
        />
        <Card
          style={{
            alignItems: "center",
            paddingVertical: 16,
            backgroundColor: colors.mint,
          }}
        >
          <View
            style={{
              width: 132,
              height: 132,
              borderRadius: 66,
              backgroundColor: "#fff",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <Icon
              name={
                status === "success" && !error
                  ? "check-circle-outline"
                  : "fingerprint"
              }
              size={82}
              color={colors.green}
            />
          </View>
          <Txt size={12} bold color={colors.green}>
            ZK9500 · {t("fpLocal")}
          </Txt>
          <Animated.View
            key={status}
            entering={reduceMotion ? undefined : FadeIn.duration(180)}
            accessibilityLiveRegion="polite"
            style={{ marginTop: 12 }}
          >
            <Txt bold size={21} style={{ textAlign: "center" }}>
              {t(
                error
                  ? "fpNeedsAttention"
                  : (stateKeys[status] ?? "fingerprintPlace"),
              )}
            </Txt>
          </Animated.View>
          {mode === "enroll" ? (
            <>
              <Txt muted style={{ marginTop: 14, textAlign: "center" }}>
                {t(step === 3 ? "fpVerifyHint" : "fingerprintPress")}
              </Txt>
              <Row style={{ marginTop: 12, gap: 12 }}>
                {[1, 2, 3].map((n) => (
                  <Animated.View
                    key={`${n}-${n <= step}`}
                    entering={reduceMotion ? undefined : FadeIn.duration(180)}
                    style={{
                      width: 48,
                      height: 48,
                      borderRadius: 24,
                      backgroundColor: n <= step ? colors.green : "#fff",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Txt bold color={n <= step ? "#fff" : colors.muted}>
                      {n <= step ? "✓" : n}
                    </Txt>
                  </Animated.View>
                ))}
              </Row>
            </>
          ) : null}
        </Card>
        <Notice message={error} tone="error" />
        {error ? (
          <View style={{ gap: 12 }}>
            {duplicate && customers.some((c) => c.id === duplicate) ? (
              <Card>
                <Txt bold>
                  {customers.find((c) => c.id === duplicate)?.person.name ??
                    t("customers")}
                </Txt>
                <Button
                  label={t("viewCustomer")}
                  onPress={() => openCustomer(duplicate)}
                />
              </Card>
            ) : null}
            {!noEnrollments ? (
              <Button label={t("fpTryAgain")} icon="refresh" onPress={retry} />
            ) : null}
            {mode !== "check" ? (
              <>
                <Button
                  secondary
                  label={t("fpManualSearch")}
                  icon="account-search-outline"
                  onPress={() => {
                    onClose();
                    if (onManual) onManual();
                    else router.push("/(tabs)/customers");
                  }}
                />
                <Button
                  secondary
                  label={t("fpNewCustomer")}
                  icon="account-plus-outline"
                  onPress={() => {
                    onClose();
                    if (onNew) onNew();
                    else router.push("/new-record");
                  }}
                />
              </>
            ) : null}
            {usbStatus ? (
              <Txt muted size={12}>
                {t("readerUsbDevices")}: {usbStatus.devices.length}
                {usbStatus.devices
                  .map(
                    (d) =>
                      ` · ${d.vendorId.toString(16)}:${d.productId.toString(16)}`,
                  )
                  .join("")}
              </Txt>
            ) : null}
          </View>
        ) : null}
        {mode === "check" && status === "success" && !error ? (
          <Notice message={t("fpReaderReady")} />
        ) : null}
      </Screen>
    </Modal>
  );
}
