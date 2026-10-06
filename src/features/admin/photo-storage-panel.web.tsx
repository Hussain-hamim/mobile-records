import { useEffect, useState } from "react";
import { adminRequest } from "./api";
import type { PhotoStatus } from "../../domain/online-photos";
export function PhotoStoragePanel({ shopId }: { shopId: string }) {
  const [status, setStatus] = useState<PhotoStatus | null>(null),
    [quota, setQuota] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    let current = true;
    adminRequest<PhotoStatus>("photo-admin-status", { shopId })
      .then((s) => {
        if (current) {
          setStatus(s);
          setQuota(
            s.entitlement.quota_bytes
              ? String(s.entitlement.quota_bytes / 1e9)
              : "",
          );
        }
      })
      .catch(() => {
        if (current) setError("Could not load online photo storage.");
      });
    return () => {
      current = false;
    };
  }, [shopId]);
  async function update(enabled: boolean) {
    const bytes = Math.floor(Number(quota) * 1e9);
    if (
      !Number.isSafeInteger(bytes) ||
      bytes < 0 ||
      (enabled && bytes === 0) ||
      !reason.trim()
    ) {
      setError(
        "Enter a reason. Enabling also requires a positive storage allowance.",
      );
      return;
    }
    setBusy(true);
    setError("");
    try {
      setStatus(
        await adminRequest<PhotoStatus>("photo-admin-set", {
          shopId,
          enabled,
          quotaBytes: bytes,
          reason,
        }),
      );
      setReason("");
      window.dispatchEvent(new Event("photo-entitlement-change"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="ap-detail-summary" style={{ display: "block" }}>
      <h3>Online photos</h3>
      <p>
        As a platform admin, you can enable online photo storage for this shop
        at any time. No shop request is required. Set an allowance and add a
        reason below.
      </p>
      {status && (
        <>
          <p>
            {status.entitlement.enabled ? "Enabled" : "New uploads disabled"} ·{" "}
            {(status.entitlement.used_bytes / 1e9).toFixed(2)} GB stored ·{" "}
            {(status.entitlement.reserved_bytes / 1e9).toFixed(2)} GB reserved
          </p>
          <p>
            {status.pending} pending uploads · {status.failed} uploads needing
            attention
          </p>
          {status.request?.status === "pending" && (
            <p>
              <strong>Activation requested</strong>
            </p>
          )}
        </>
      )}
      <p>
        Disabling stops uploads. Existing photos remain viewable and continue to
        use billed storage.
      </p>
      <label>
        Storage allowance (GB)
        <input
          type="number"
          min="0.001"
          step="0.001"
          value={quota}
          onChange={(e) => setQuota(e.target.value)}
          disabled={busy}
        />
      </label>
      <label>
        Reason / review note
        <input
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          disabled={busy}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <button
          className="ap-primary"
          disabled={busy || !status}
          onClick={() => void update(true)}
        >
          {status?.entitlement.enabled
            ? "Update allowance"
            : status?.request?.status === "pending"
              ? "Approve & enable online photos"
              : "Enable online photos"}
        </button>
        <button disabled={busy || !status} onClick={() => void update(false)}>
          {status?.request?.status === "pending"
            ? "Decline request"
            : "Disable uploads"}
        </button>
      </div>
    </section>
  );
}
export function PhotoRequests({
  onOpen,
}: {
  onOpen: (shopId: string) => void;
}) {
  const [rows, setRows] = useState<
      { id: string; shop_id: string; shop_name: string; created_at: string }[]
    >([]),
    [page, setPage] = useState(0),
    [error, setError] = useState(""),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    const refresh = () => setRevision((v) => v + 1);
    window.addEventListener("photo-entitlement-change", refresh);
    return () =>
      window.removeEventListener("photo-entitlement-change", refresh);
  }, []);
  useEffect(() => {
    let current = true;
    adminRequest<typeof rows>("photo-admin-requests", { offset: page * 50 })
      .then((r) => {
        if (current) {
          setRows(r);
          setError("");
        }
      })
      .catch(() => {
        if (current) setError("Could not load photo requests.");
      });
    return () => {
      current = false;
    };
  }, [page, revision]);
  return (
    <section className="ap-panel" style={{ marginBottom: 20, padding: 20 }}>
      <h3>Online photo requests</h3>
      {error && <p role="alert">{error}</p>}
      {!rows.length && !error && (
        <p>
          No pending requests. You can still enable online photos directly:
          select a shop below and open its Online photos section.
        </p>
      )}
      {rows.map((r) => (
        <div
          key={r.id}
          style={{
            display: "flex",
            justifyContent: "space-between",
            padding: 8,
          }}
        >
          <span>{r.shop_name}</span>
          <button onClick={() => onOpen(r.shop_id)}>Review</button>
        </div>
      ))}
      <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
        Previous
      </button>{" "}
      <button disabled={rows.length < 50} onClick={() => setPage((p) => p + 1)}>
        Next
      </button>
    </section>
  );
}
