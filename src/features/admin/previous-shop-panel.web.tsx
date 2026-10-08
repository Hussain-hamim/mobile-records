import { useEffect, useState } from "react";
import { FunctionsHttpError } from "@supabase/supabase-js";
import { adminApi } from "./api";
type Feature = {
  enabled: boolean;
  version: number;
  updatedAt: string;
  updatedBy: string | null;
};
async function request(action: string, body = {}): Promise<Feature> {
  const { data, error } = await adminApi().functions.invoke("previous-shop", {
    body: { action, ...body },
    timeout: 15000,
  });
  if (error) {
    if (error instanceof FunctionsHttpError && error.context.status === 409)
      throw new Error(
        "Another administrator changed this setting. Refresh and try again.",
      );
    throw new Error(
      "Could not load or save the setting. Check your connection and administrator access, then retry.",
    );
  }
  if (typeof data?.enabled !== "boolean" || !Number.isInteger(data.version))
    throw new Error("Previous-shop lookup is not available on the server yet.");
  return data;
}
export function PreviousShopPanel({ onChanged }: { onChanged: () => void }) {
  const [feature, setFeature] = useState<Feature | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    request("admin-status")
      .then((value) => {
        if (active) setFeature(value);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, []);
  async function run(change: boolean) {
    setBusy(true);
    setError("");
    try {
      setFeature(
        await request(
          change ? "admin-set" : "admin-status",
          change && feature
            ? { enabled: !feature.enabled, version: feature.version }
            : {},
        ),
      );
      if (change) onChanged();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not update the setting.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ap-panel" style={{ marginBottom: 20 }}>
      <div className="ap-panel-heading">
        <div>
          <h2>Previous-shop lookup</h2>
          <p>
            One setting for all MobileReg shops. When enabled, active staff can
            look up an exact IMEI and see the last other shop’s business name,
            phone, address, transaction date, and purchase/sale direction.
            Customer and owner personal details stay private.
          </p>
        </div>
        <button
          className={feature?.enabled ? "ap-primary" : "ap-secondary"}
          role="switch"
          aria-checked={feature?.enabled ?? false}
          aria-label="Previous-shop lookup"
          disabled={busy || !feature || Boolean(error)}
          onClick={() => void run(true)}
        >
          {busy
            ? "Saving…"
            : feature
              ? feature.enabled
                ? "On"
                : "Off"
              : "Loading…"}
        </button>
      </div>
      {feature?.updatedBy && (
        <p style={{ padding: "0 20px" }}>
          Last changed{" "}
          {new Date(feature.updatedAt).toLocaleString("en-GB", {
            timeZone: "Asia/Kabul",
          })}{" "}
          · Kabul time. Changes appear in the admin activity log.
        </p>
      )}
      {error && (
        <div className="ap-error" role="alert">
          {error}{" "}
          <button
            className="ap-secondary"
            disabled={busy}
            onClick={() => void run(false)}
          >
            Refresh
          </button>
        </div>
      )}
    </section>
  );
}
