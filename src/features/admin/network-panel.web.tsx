import { useEffect, useRef, useState } from "react";
import { adminApi } from "./api";
import type { NetworkProfile, NetworkPage } from "../network/types";
type Item = Partial<NetworkProfile> & {
  id?: string;
  target_id?: string;
  target_name?: string;
  reason?: string;
  action?: string;
  at?: string;
  details?: Record<string, unknown>;
};
async function request<T>(
  action: string,
  data: Record<string, unknown> = {},
): Promise<T> {
  const { data: result, error } = await adminApi().rpc("shop_network", {
    p_shop: null,
    p_action: action,
    p_data: data,
  });
  if (error)
    throw new Error(
      error.message.includes("noAccess")
        ? "Platform administrator access is required."
        : error.message.includes("versionConflict")
          ? "This listing changed. Refresh before reviewing it."
          : "Could not complete the request. Check your connection and retry.",
    );
  return result as T;
}
export function NetworkPanel() {
  const [section, setSection] = useState("profiles"),
    [offset, setOffset] = useState(0),
    [query, setQuery] = useState(""),
    [revision, setRevision] = useState(0),
    [state, setState] = useState<{
      key: string;
      page: NetworkPage<Item>;
    } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false);
  const [review, setReview] = useState<{ item: Item; status: string } | null>(
      null,
    ),
    [reason, setReason] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (review) node?.showModal();
    return () => node?.close();
  }, [review]);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  const key = `${section}:${offset}:${query}:${revision}`;
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      void request<NetworkPage<Item>>("admin-list", { section, offset, query })
        .then((page) => {
          if (active) setState({ key, page });
        })
        .catch((e) => {
          if (active) setError(e.message);
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [key, section, offset, query]);
  async function run(action: string, data: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await request(action, data);
      if (live.current) {
        setReview(null);
        setReason("");
        setRevision((v) => v + 1);
      }
    } catch (e) {
      if (live.current) setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (live.current) setBusy(false);
    }
  }
  const page = state?.key === key ? state.page : null;
  return (
    <section className="ap-panel" style={{ padding: 20 }}>
      <div className="ap-panel-heading">
        <div>
          <h2>Private shop network</h2>
          <p>
            Review only the submitted business listing. Customer records are
            never shared through network membership.
          </p>
        </div>
        <button
          className="ap-secondary"
          disabled={busy}
          onClick={() => setRevision((v) => v + 1)}
        >
          Refresh
        </button>
      </div>
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}
      >
        {["profiles", "reports", "audit"].map((s) => (
          <button
            key={s}
            className={section === s ? "ap-primary" : "ap-secondary"}
            onClick={() => {
              setSection(s);
              setOffset(0);
              setReview(null);
            }}
          >
            {s === "profiles"
              ? "Shop approvals"
              : s === "reports"
                ? "Open reports"
                : "Sharing audit"}
          </button>
        ))}
      </div>
      {section === "profiles" && (
        <label>
          Search submitted shop name or area
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setOffset(0);
            }}
            style={{
              display: "block",
              padding: 12,
              margin: "8px 0 16px",
              width: "100%",
            }}
          />
        </label>
      )}
      {error && (
        <div className="ap-error" role="alert">
          {error}
        </div>
      )}
      {loading && <p>Loading…</p>}
      {!loading && !page?.items.length && !error && <p>No items to review.</p>}
      {page?.items.map((item, i) => (
        <article
          key={item.id ?? item.shop_id ?? i}
          style={{ padding: "18px 0", borderBottom: "1px solid #e2ebe5" }}
        >
          {section === "profiles" ? (
            <>
              <h3>{item.name}</h3>
              <p>
                {item.area} · {item.contact || "No public contact"}
              </p>
              <p>
                {item.status} ·{" "}
                {item.enabled ? "Owner opted in" : "Owner opted out"} · revision{" "}
                {item.version}
              </p>
              <p>Shop ID: {item.shop_id}</p>
              <div style={{ display: "flex", gap: 8 }}>
                {["approved", "suspended"].map((s) => (
                  <button
                    disabled={busy || item.status === s}
                    key={s}
                    className="ap-secondary"
                    onClick={() => {
                      setReason("");
                      setReview({ item, status: s });
                    }}
                  >
                    {s === "approved" ? "Approve listing" : "Suspend listing"}
                  </button>
                ))}
              </div>
            </>
          ) : section === "reports" ? (
            <>
              <h3>Report about {item.target_name}</h3>
              <p>{item.reason}</p>
              <p>Reporting shop: {item.shop_id}</p>
              <p>Reported shop: {item.target_id}</p>
              <button
                className="ap-secondary"
                disabled={busy}
                onClick={() => void run("admin-resolve", { id: item.id })}
              >
                Mark reviewed
              </button>
            </>
          ) : (
            <>
              <strong>{item.action}</strong>
              <p>{item.at ? new Date(item.at).toLocaleString() : ""}</p>
              <p style={{ overflowWrap: "anywhere" }}>
                {JSON.stringify(item.details)}
              </p>
            </>
          )}
        </article>
      ))}
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        {offset > 0 && (
          <button
            className="ap-secondary"
            onClick={() => setOffset(Math.max(0, offset - 25))}
          >
            Previous
          </button>
        )}
        {page?.next != null && (
          <button
            className="ap-secondary"
            onClick={() => setOffset(page.next!)}
          >
            Next
          </button>
        )}
      </div>
      {review && (
        <dialog
          ref={dialog}
          className="ap-dialog"
          aria-label="Review network listing"
          onCancel={(event) => {
            event.preventDefault();
            if (!busy) setReview(null);
          }}
        >
          <section
            className="ap-panel"
            style={{ padding: 24, maxWidth: 520, width: "95%" }}
          >
            <h2>
              {review.status === "approved" ? "Approve" : "Suspend"}{" "}
              {review.item.name}?
            </h2>
            <p>
              Approval records your review of the business listing. It does not
              guarantee any transaction.
            </p>
            <label>
              Review reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                style={{
                  display: "block",
                  width: "100%",
                  minHeight: 90,
                  margin: "12px 0",
                }}
              />
            </label>
            {error && <p role="alert">{error}</p>}
            <div style={{ display: "flex", gap: 10 }}>
              <button
                className="ap-secondary"
                disabled={busy}
                onClick={() => setReview(null)}
              >
                Cancel
              </button>
              <button
                className="ap-primary"
                disabled={busy || reason.trim().length < 3}
                onClick={() =>
                  void run("admin-review", {
                    target: review.item.shop_id,
                    version: review.item.version,
                    status: review.status,
                    reason,
                  })
                }
              >
                Confirm review
              </button>
            </div>
          </section>
        </dialog>
      )}
    </section>
  );
}
