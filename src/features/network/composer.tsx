import { useEffect, useRef, useState } from "react";
import { Modal, View } from "react-native";
import * as Crypto from "expo-crypto";
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
} from "../../components/ui";
import { PurchasedPhonePicker } from "../../components/purchased-phone-picker";
import { useApp } from "../../state/app-context";
import { useServerPage } from "../../state/use-server-page";
import { networkPage } from "./api";
import { networkError, networkText } from "./strings";
import type {
  NetworkCall,
  NetworkKind,
  BusinessDevice,
  NetworkShop,
} from "./types";

export function NetworkComposer({
  call,
  initialKind = "offer",
  onClose,
  onSaved,
}: {
  call: NetworkCall;
  initialKind?: NetworkKind;
  onClose: () => void;
  onSaved: () => void;
}) {
  const app = useApp(),
    nt = (k: Parameters<typeof networkText>[1]) => networkText(app.language, k);
  const [id] = useState(() => Crypto.randomUUID());
  const [kind, setKind] = useState(initialKind),
    [device, setDevice] = useState<BusinessDevice>({
      brand: "",
      model: "",
      color: "",
      storage: "",
      price: "",
    });
  const [selected, setSelected] = useState<NetworkShop[]>([]),
    [preview, setPreview] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [picker, setPicker] = useState(false);
  const running = useRef(false),
    active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const page = useServerPage(
    (offset: number | null, signal: AbortSignal) =>
      networkPage(call, "connections", offset, "", signal),
    app.membership!.shopId,
    true,
    0,
  );
  const peers = page.items.filter(
    (r): r is NetworkShop =>
      "connection_status" in r &&
      r.connection_status === "accepted" &&
      !r.blocked,
  );
  const payload: BusinessDevice = {
    brand: device.brand.trim(),
    model: device.model.trim(),
    color: device.color?.trim() ?? "",
    storage: device.storage?.trim() ?? "",
    price: device.price?.trim() ?? "",
  };
  async function submit() {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    try {
      await call("post", {
        id,
        kind,
        device: payload,
        recipients: selected.map((s) => s.shop_id),
      });
      if (active.current) onSaved();
    } catch (e) {
      if (active.current) setError(networkError(app.language, e));
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  function review() {
    if (
      !payload.brand ||
      !payload.model ||
      !selected.length ||
      selected.length > 50 ||
      ((payload.price ?? "") !== "" &&
        !/^\d{1,10}(\.\d{1,2})?$/.test(payload.price!))
    ) {
      setError(nt("networkInvalid"));
      return;
    }
    if (Object.values(payload).some((s) => s.replace(/\D/g, "").length >= 15)) {
      setError(nt("networkPrivate"));
      return;
    }
    setError("");
    setPreview(true);
  }
  return (
    <Modal
      visible
      animationType="slide"
      onRequestClose={() => !busy && onClose()}
    >
      <Screen>
        <Heading
          title={nt(preview ? "preview" : "newPost")}
          action={
            <Button
              small
              secondary
              disabled={busy}
              label={nt("close")}
              onPress={onClose}
            />
          }
        />
        <Notice message={nt("privacy")} />
        <Notice message={error} tone="error" />
        {preview ? (
          <>
            <Card>
              <Txt bold>{nt(kind)}</Txt>
              <DeviceDetails device={payload} />
              <Txt bold>{nt("to")}</Txt>
              {selected.map((s) => (
                <Txt key={s.shop_id}>
                  {s.name} · {s.area}
                </Txt>
              ))}
            </Card>
            <Notice message={nt("postHint")} />
            <Row>
              <Button
                secondary
                disabled={busy}
                label={nt("back")}
                onPress={() => setPreview(false)}
              />
              <Button
                loading={busy}
                label={nt("send")}
                onPress={() => void submit()}
              />
            </Row>
          </>
        ) : (
          <>
            <Row style={{ gap: 8, marginBottom: 16 }}>
              {(["offer", "request"] as const).map((k) => (
                <Chip
                  key={k}
                  active={kind === k}
                  label={nt(k)}
                  onPress={() => setKind(k)}
                />
              ))}
            </Row>
            <Notice message={nt("postHint")} />
            {kind === "offer" && (
              <Button
                secondary
                small
                label={app.t("choosePurchasedPhone")}
                onPress={() => setPicker(true)}
              />
            )}
            <Card>
              {(["brand", "model", "color", "storage"] as const).map((k) => (
                <Field
                  key={k}
                  label={app.t(k)}
                  value={device[k]}
                  maxLength={80}
                  onChangeText={(v) => setDevice((d) => ({ ...d, [k]: v }))}
                />
              ))}
              <Field
                label={app.t("price")}
                value={device.price}
                numeric
                maxLength={13}
                onChangeText={(price) => setDevice((d) => ({ ...d, price }))}
              />
            </Card>
            <Heading title={nt("recipients")} />
            {peers.map((s) => (
              <Card key={s.shop_id}>
                <Chip
                  label={s.name}
                  active={selected.some((p) => p.shop_id === s.shop_id)}
                  onPress={() =>
                    setSelected((prev) =>
                      prev.some((p) => p.shop_id === s.shop_id)
                        ? prev.filter((p) => p.shop_id !== s.shop_id)
                        : [...prev, s],
                    )
                  }
                />
                <Txt muted>{s.area}</Txt>
              </Card>
            ))}
            {!peers.length && !page.loading && <Txt muted>{nt("empty")}</Txt>}
            {!!page.error && (
              <>
                <Notice
                  message={networkError(app.language, page.error)}
                  tone="error"
                />
                <Button secondary label={nt("refresh")} onPress={page.retry} />
              </>
            )}
            {page.hasMore && (
              <Button
                secondary
                small
                loading={page.loading}
                label={nt("more")}
                onPress={page.loadMore}
              />
            )}
            <Button
              disabled={page.loading}
              label={nt("preview")}
              onPress={review}
            />
          </>
        )}
        {picker && (
          <PurchasedPhonePicker
            busy={busy}
            error={error}
            onClose={() => !busy && setPicker(false)}
            onSelect={(purchaseId) => {
              if (running.current) return;
              running.current = true;
              setBusy(true);
              void app
                .queries!.purchasedPhones({ purchaseId })
                .then((result) => {
                  if (!active.current) return;
                  const phone = result.items[0]?.purchase?.phone;
                  if (!phone) throw new Error("networkUnavailable");
                  setDevice({
                    brand: phone.brand,
                    model: phone.model,
                    color: phone.color,
                    storage: phone.storage,
                    price: "",
                  });
                  setPicker(false);
                })
                .catch((e) => {
                  if (active.current) setError(networkError(app.language, e));
                })
                .finally(() => {
                  running.current = false;
                  if (active.current) setBusy(false);
                });
            }}
          />
        )}
      </Screen>
    </Modal>
  );
}
export function DeviceDetails({ device }: { device: BusinessDevice }) {
  return (
    <View style={{ gap: 6, marginVertical: 12 }}>
      <Txt bold>
        {device.brand} {device.model}
      </Txt>
      <Txt muted>
        {[
          device.color,
          device.storage,
          device.price ? `${device.price} AFN` : null,
        ]
          .filter(Boolean)
          .join(" · ")}
      </Txt>
    </View>
  );
}
