import { RecordsPanel } from "./records-panel.web";
import { NetworkPanel } from "./network-panel.web";
import { PreviousShopPanel } from "./previous-shop-panel.web";
import { PhotoStoragePanel, PhotoRequests } from "./photo-storage-panel.web";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link } from "expo-router";
import { adminApi, adminRequest } from "./api";
import type {
  AdminMember,
  AdminRecordScope,
  CodeLookup,
  IssuedCode,
  Overview,
  ShopDetail,
  ShopSummary,
} from "./types";
import { normalizePhone } from "../../domain/validation";
import "./portal.css";

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    grid: (
      <>
        <rect x="3" y="3" width="7" height="7" rx="2" />
        <rect x="14" y="3" width="7" height="7" rx="2" />
        <rect x="3" y="14" width="7" height="7" rx="2" />
        <rect x="14" y="14" width="7" height="7" rx="2" />
      </>
    ),
    shop: (
      <>
        <path d="M3 10h18l-2-6H5l-2 6Zm1 0v10h16V10M9 20v-6h6v6M3 10c0 4 5 4 5 0 0 4 8 4 8 0 0 4 5 4 5 0" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="7" r="3" />
        <path d="M3 21v-3a6 6 0 0 1 12 0v3m1-17a3 3 0 0 1 0 6m3 11v-3a6 6 0 0 0-2-4" />
      </>
    ),
    key: (
      <>
        <circle cx="8" cy="9" r="5" />
        <path d="m12 13 8 8m-4-4 3-3m-6 0 3-3" />
      </>
    ),
    shield: (
      <>
        <path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    arrow: <path d="M5 12h14m-5-5 5 5-5 5" />,
    plus: <path d="M12 5v14M5 12h14" />,
    search: (
      <>
        <circle cx="10" cy="10" r="6" />
        <path d="m15 15 6 6" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 7a9 9 0 1 0 1 8M20 2v6h-6" />
      </>
    ),
    logout: (
      <>
        <path d="M9 3H4v18h5m5-14 5 5-5 5M8 12h12" />
      </>
    ),
    activity: <path d="M3 12h4l3-8 4 16 3-8h4" />,
    file: (
      <>
        <path d="M14 3H5v18h14V8l-5-5Z" />
        <path d="M14 3v5h5M8 12h8M8 16h5" />
      </>
    ),
    close: <path d="m6 6 12 12M6 18 18 6" />,
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M15 8V3H3v12h5" />
      </>
    ),
    check: <path d="m5 12 5 5L20 7" />,
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] ?? paths.shield}
    </svg>
  );
}
function Brand() {
  return (
    <div className="ap-brand">
      <span className="ap-logo">
        <Icon name="shop" size={24} />
      </span>
      <div>
        radefy<span>ADMIN CONSOLE</span>
      </div>
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog ref={ref} className="ap-dialog" onCancel={onClose}>
      <div className="ap-modal-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="ap-icon-btn"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}
const messageOf = (error: unknown) =>
  error instanceof Error
    ? error.message
    : "Something went wrong. Please try again.";
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kabul",
  }).format(new Date(value));
const labels: Record<string, string> = {
  previous_shop_enabled: "Previous-shop lookup enabled",
  previous_shop_disabled: "Previous-shop lookup disabled",
  issued: "Login code generated",
  redeemed: "Account signed in",
  locked: "Login code locked",
  access_enabled: "Account access restored",
  access_disabled: "Account access suspended",
};

export default function AdminPortal() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [user, setUser] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [overview, setOverview] = useState<Overview | null>(null);
  const [shops, setShops] = useState<ShopSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [section, setSection] = useState("overview");
  const [recordScope, setRecordScope] = useState<AdminRecordScope | null>(null);
  const [detail, setDetail] = useState<ShopDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [shopName, setShopName] = useState("");
  const [phone, setPhone] = useState("");
  const [issued, setIssued] = useState<IssuedCode | null>(null);
  const [copied, setCopied] = useState(false);
  const [access, setAccess] = useState<AdminMember | null>(null);
  const [reason, setReason] = useState("");
  const listRequest = useRef(0);
  const detailRequest = useRef(0);
  const actionLock = useRef(false);
  const clearData = useCallback(() => {
    listRequest.current++;
    detailRequest.current++;
    setRecordScope(null);
    setUser(null);
    setOverview(null);
    setShops([]);
    setDetail(null);
    setIssued(null);
    setAccess(null);
    setCreating(false);
  }, []);
  useEffect(() => {
    let current = true;
    let unsubscribe: () => void = () => {};
    void (async () => {
      try {
        const api = adminApi();
        const { data } = await api.auth.getSession();
        if (data.session) {
          const o = await adminRequest<Overview>("overview");
          if (current) {
            setOverview(o);
            setUser(data.session.user.email ?? "Administrator");
          }
        }
        if (!current) return;
        const subscription = api.auth.onAuthStateChange((event) => {
          if (event === "SIGNED_OUT") clearData();
        });
        unsubscribe = () => subscription.data.subscription.unsubscribe();
      } catch (e) {
        if (current) setError(messageOf(e));
      } finally {
        if (current) setBooting(false);
      }
    })();
    return () => {
      current = false;
      unsubscribe();
    };
  }, [clearData]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const refresh = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true);
    try {
      const [o, list] = await Promise.all([
        adminRequest<Overview>("overview"),
        adminRequest<{ shops: ShopSummary[]; total: number }>("list-shops", {
          page,
          search: query,
        }),
      ]);
      if (request === listRequest.current) {
        setOverview(o);
        setShops(list.shops);
        setTotal(list.total);
      }
    } finally {
      if (request === listRequest.current) setLoading(false);
    }
  }, [page, query]);
  const invalidateList = useCallback(() => {
    listRequest.current++;
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      if (user) void refresh().catch((e) => setError(messageOf(e)));
    }, 0);
    return () => {
      clearTimeout(timer);
      invalidateList();
    };
  }, [user, refresh, invalidateList]);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) {
        setIssued(null);
        setCopied(false);
      }
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    if (!issued) return;
    let current = true;
    let checking = false;
    const invalidate = (message: string) => {
      if (!current) return;
      setIssued(null);
      setCopied(false);
      setError(message);
    };
    const expiry = setTimeout(
      () => invalidate("This login code has expired. Generate a new code."),
      Math.max(0, Date.parse(issued.expiresAt) - Date.now()),
    );
    const poll = setInterval(() => {
      if (checking || document.hidden) return;
      checking = true;
      void adminRequest<CodeLookup>("view-code", { phone: issued.phone })
        .then((result) => {
          if (
            !result.code ||
            result.code.code !== issued.code ||
            result.code.expiresAt !== issued.expiresAt
          )
            invalidate(
              result.reason ??
                "This login code was replaced. Open the current code again.",
            );
        })
        .catch(() =>
          invalidate(
            "Could not confirm that this code is still valid. Reconnect and view the code again.",
          ),
        )
        .finally(() => {
          checking = false;
        });
    }, 5000);
    return () => {
      current = false;
      clearTimeout(expiry);
      clearInterval(poll);
    };
  }, [issued]);
  async function run(work: () => Promise<void>) {
    if (actionLock.current) return;
    actionLock.current = true;
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
      actionLock.current = false;
    }
  }
  async function signIn(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const result = await adminApi().auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      setPassword("");
      if (result.error)
        throw new Error("Incorrect email or password. Please try again.");
      try {
        const o = await adminRequest<Overview>("overview");
        setOverview(o);
        setUser(result.data.user.email ?? "Administrator");
      } catch (e) {
        await adminApi().auth.signOut({ scope: "local" });
        throw e;
      }
    });
  }
  async function signOut() {
    clearData();
    setError("");
    try {
      await adminApi().auth.signOut({ scope: "local" });
    } catch {
      setError(
        "Session ended locally. Close this tab if you cannot reconnect.",
      );
    }
  }
  async function openShop(id: string) {
    const request = ++detailRequest.current;
    setDetail(null);
    setDetailLoading(true);
    setError("");
    try {
      const data = await adminRequest<ShopDetail>("shop-detail", {
        shopId: id,
      });
      if (request === detailRequest.current) setDetail(data);
    } catch (e) {
      setError(messageOf(e));
    } finally {
      if (request === detailRequest.current) setDetailLoading(false);
    }
  }
  async function newShop(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const data = await adminRequest<IssuedCode>("onboard", {
        shopName: shopName.trim(),
        phone: normalizePhone(phone),
      });
      setCreating(false);
      setShopName("");
      setPhone("");
      setCopied(false);
      setIssued(data);
      await refresh();
    });
  }
  async function generate(member: AdminMember) {
    await run(async () => {
      const data = await adminRequest<IssuedCode>("issue-code", {
        phone: member.phone,
      });
      setCopied(false);
      setIssued(data);
      await refresh();
    });
  }
  async function viewCode(member: AdminMember) {
    await run(async () => {
      const result = await adminRequest<CodeLookup>("view-code", {
        phone: member.phone,
      });
      setCopied(false);
      setIssued(result.code);
      if (!result.code)
        setError(result.reason ?? "No valid login code. Generate a new one.");
    });
  }
  async function copyCode() {
    if (!issued) return;
    const displayed = issued;
    await run(async () => {
      const result = await adminRequest<CodeLookup>("view-code", {
        phone: displayed.phone,
      });
      if (
        !result.code ||
        result.code.code !== displayed.code ||
        result.code.expiresAt !== displayed.expiresAt
      ) {
        setIssued(null);
        throw new Error(
          result.reason ??
            "The code was replaced. Open the current code again.",
        );
      }
      try {
        await navigator.clipboard.writeText(result.code.code);
        setCopied(true);
      } catch {
        throw new Error(
          "Copy is unavailable. Select the code and copy it manually.",
        );
      }
    });
  }
  async function changeAccess(e: FormEvent) {
    e.preventDefault();
    if (!access || !detail) return;
    const member = access,
      shopId = detail.shop.id;
    await run(async () => {
      await adminRequest("set-access", {
        shopId,
        userId: member.user_id,
        active: !member.active,
        reason: reason.trim(),
      });
      setAccess(null);
      setReason("");
      await Promise.all([refresh(), openShop(shopId)]);
    });
  }
  const activity = (
    <div className="ap-activity-list">
      {overview?.recentActivity.length ? (
        overview.recentActivity.map((event, i) => (
          <div className="ap-event" key={event.at + event.action + i}>
            <span className="ap-event-icon">
              <Icon
                name={
                  event.action === "redeemed"
                    ? "check"
                    : event.action === "issued"
                      ? "key"
                      : "shield"
                }
                size={17}
              />
            </span>
            <div>
              <strong>{labels[event.action] ?? event.action}</strong>
              <span>
                {event.action.startsWith("previous_shop_")
                  ? "Administrator"
                  : "Account"}{" "}
                {event.user_id?.slice(0, 8) ?? "Deleted account"} ·{" "}
                {dateLabel(event.at)}
              </span>
            </div>
          </div>
        ))
      ) : (
        <div className="ap-empty">
          Activity will appear here as you manage accounts.
        </div>
      )}
    </div>
  );
  if (booting)
    return (
      <div className="ap-root ap-boot">
        <Brand />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!user)
    return (
      <div className="ap-root ap-login">
        <section className="ap-login-story">
          <Brand />
          <div className="ap-story-content">
            <span className="ap-overline">
              A LITTLE LESS ADMIN. A LOT MORE CLARITY.
            </span>
            <h1>
              Good shops.
              <br />
              Great records.
              <br />
              <em>One workspace.</em>
            </h1>
            <p>
              A home for every shop on Radefy. Bring new teams onboard, manage
              access, and keep things moving.
            </p>
            <div className="ap-story-cards">
              <div>
                <Icon name="shop" />
                <span>Shop management</span>
              </div>
              <div>
                <Icon name="key" />
                <span>One-time access codes</span>
              </div>
              <div>
                <Icon name="shield" />
                <span>You’re in control</span>
              </div>
            </div>
          </div>
          <span className="ap-story-foot">
            RADEfy · MOBILE RECORDS PLATFORM
          </span>
          <div className="ap-orbit" aria-hidden="true" />
        </section>
        <section className="ap-login-form">
          <div className="ap-login-box">
            <span className="ap-mini-label">
              <Icon name="shield" size={16} /> ADMINISTRATOR ACCESS
            </span>
            <h2>Welcome back.</h2>
            <p>Sign in to manage your Radefy workspace.</p>
            <form onSubmit={(e) => void signIn(e)}>
              <label>
                Email address
                <input
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  required
                />
              </label>
              <label>
                Password
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                />
              </label>
              {error && (
                <div className="ap-error" role="alert">
                  {error}
                </div>
              )}
              <button className="ap-primary ap-full" disabled={busy}>
                {busy ? "Signing in…" : "Sign in to workspace"}
                <Icon name="arrow" size={18} />
              </button>
            </form>
            <div className="ap-login-note">
              <Icon name="shield" size={17} />
              <span>
                For platform administrators. Shop owners sign in to the mobile
                app with a one-time code.
              </span>
            </div>
            <Link href="/" className="ap-back">
              ← Back to Mobile Records
            </Link>
          </div>
          <span className="ap-login-footer">
            Radefy Admin · Your shops, thoughtfully managed.
          </span>
        </section>
      </div>
    );
  return (
    <div className="ap-root ap-shell">
      {recordScope && (
        <RecordsPanel
          key={recordScope.shopId + (recordScope.userId ?? "all")}
          scope={recordScope}
          onClose={() => setRecordScope(null)}
        />
      )}
      <aside className="ap-sidebar">
        <Brand />
        <div className="ap-workspace">
          <span className="ap-workspace-avatar">R</span>
          <div>
            Mobile Records<small>Platform workspace</small>
          </div>
          <span className="ap-live-dot" />
        </div>
        <span className="ap-nav-label">WORKSPACE</span>
        <nav aria-label="Admin navigation">
          {[
            ["overview", "grid", "Overview"],
            ["shops", "shop", "Shops & accounts"],
            ["activity", "activity", "Activity"],
            ["network", "shop", "Shop network"],
          ].map(([id, icon, label]) => (
            <button
              className={section === id ? "active" : ""}
              key={id}
              onClick={() => setSection(id)}
            >
              <Icon name={icon} />
              {label}
              {id === "shops" && <span>{overview?.shops ?? 0}</span>}
            </button>
          ))}
        </nav>
        <div className="ap-sidebar-tip">
          <span className="ap-tip-icon">
            <Icon name="key" />
          </span>
          <strong>A simpler way in.</strong>
          <p>Create a shop, share its code, and let the team get started.</p>
          <button onClick={() => setCreating(true)}>
            Add your next shop <Icon name="arrow" size={15} />
          </button>
        </div>
        <div className="ap-admin-account">
          <span className="ap-avatar">A</span>
          <div>
            Administrator<small>{user}</small>
          </div>
          <button
            className="ap-icon-btn"
            onClick={() => void signOut()}
            aria-label="Sign out"
            disabled={busy}
          >
            <Icon name="logout" size={18} />
          </button>
        </div>
      </aside>
      <main className="ap-main">
        <header className="ap-topbar">
          <span>
            Workspace <span className="ap-slash">/</span>{" "}
            <strong>
              {section === "overview"
                ? "Overview"
                : section === "shops"
                  ? "Shops & accounts"
                  : section === "network"
                    ? "Shop network"
                    : "Activity"}
            </strong>
          </span>
          <span className="ap-environment">
            <span className="ap-live-dot" /> Connected to Supabase
          </span>
          <button
            className="ap-icon-btn"
            onClick={() => void signOut()}
            disabled={busy}
            aria-label="Sign out of admin portal"
          >
            <Icon name="logout" size={18} />
          </button>
        </header>
        <div className="ap-content">
          <div className="ap-page-heading">
            <div>
              <span className="ap-overline">YOUR PLATFORM, AT A GLANCE</span>
              <h1>
                {section === "overview"
                  ? "A good day to get things done."
                  : section === "shops"
                    ? "Every shop, in one place."
                    : section === "network"
                      ? "A trusted shop network."
                      : "The latest in your workspace."}
              </h1>
              <p>
                {section === "activity"
                  ? "Account access and login activity, as it happens."
                  : "Manage your shops, welcome new teams, and keep access simple."}
              </p>
            </div>
            <button
              className="ap-primary"
              onClick={() => {
                setError("");
                setCreating(true);
              }}
            >
              <Icon name="plus" size={18} /> Add a shop
            </button>
          </div>
          {error && (
            <div className="ap-error" role="alert">
              {error}
              <button onClick={() => setError("")} aria-label="Dismiss error">
                ×
              </button>
            </div>
          )}
          <div className="ap-stats">
            {[
              ["Shops", overview?.shops, "shop", "mint"],
              ["Active accounts", overview?.activeAccounts, "users", "blue"],
              ["Saved records", overview?.records, "file", "peach"],
              ["Ready-to-use codes", overview?.pendingCodes, "key", "lilac"],
            ].map(([label, value, icon, tone]) => (
              <div className="ap-stat" key={String(label)}>
                <span className={"ap-stat-icon " + tone}>
                  <Icon name={String(icon)} />
                </span>
                <div>
                  <span>{label}</span>
                  <strong>{value ?? "—"}</strong>
                </div>
              </div>
            ))}
          </div>
          {section === "overview" && (
            <PreviousShopPanel onChanged={() => void refresh()} />
          )}
          {section !== "activity" && section !== "network" && (
            <PhotoRequests onOpen={(id) => void openShop(id)} />
          )}
          {section === "network" ? (
            <NetworkPanel />
          ) : section === "activity" ? (
            <section className="ap-panel">
              <div className="ap-panel-heading">
                <div>
                  <h2>Recent activity</h2>
                  <p>The latest 12 account events · Kabul time</p>
                </div>
                <button
                  className="ap-secondary"
                  disabled={loading}
                  onClick={() => void run(refresh)}
                >
                  <Icon name="refresh" size={16} /> Refresh
                </button>
              </div>
              {activity}
            </section>
          ) : (
            <div className="ap-work-grid">
              <section className="ap-panel ap-shops">
                <div className="ap-panel-heading">
                  <div>
                    <h2>
                      Your shops <span className="ap-count">{total}</span>
                    </h2>
                    <p>A space for every team you support.</p>
                  </div>
                  <button
                    className="ap-icon-btn"
                    disabled={loading}
                    onClick={() => void run(refresh)}
                    aria-label="Refresh shops"
                  >
                    <Icon name="refresh" size={18} />
                  </button>
                </div>
                <div className="ap-search">
                  <Icon name="search" size={18} />
                  <input
                    aria-label="Search shops"
                    placeholder="Find a shop by name…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                  {search && (
                    <button
                      aria-label="Clear search"
                      onClick={() => setSearch("")}
                    >
                      <Icon name="close" size={16} />
                    </button>
                  )}
                </div>
                <div className="ap-table-wrap" aria-busy={loading}>
                  <table>
                    <thead>
                      <tr>
                        <th>SHOP</th>
                        <th>ACCOUNTS</th>
                        <th>ACCESS</th>
                        <th>
                          <span className="ap-sr-only">Details</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {shops.map((shop) => (
                        <tr
                          key={shop.id}
                          className={
                            detail?.shop.id === shop.id ? "selected" : ""
                          }
                        >
                          <td>
                            <button
                              className="ap-shop-link"
                              onClick={() => void openShop(shop.id)}
                            >
                              <span className="ap-shop-avatar">
                                {shop.name.charAt(0).toUpperCase()}
                              </span>
                              <span>
                                <strong>{shop.name}</strong>
                                <small>
                                  {shop.address || "Address not added yet"}
                                </small>
                              </span>
                            </button>
                          </td>
                          <td>
                            {shop.members}{" "}
                            <span className="ap-muted">
                              {shop.members === 1 ? "account" : "accounts"}
                            </span>
                          </td>
                          <td>
                            <span
                              className={
                                "ap-badge " +
                                (shop.activeMembers ? "" : "muted")
                              }
                            >
                              <i />
                              {shop.activeMembers ? "Active" : "Paused"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="ap-icon-btn"
                              aria-label={"View " + shop.name}
                              onClick={() => void openShop(shop.id)}
                            >
                              <Icon name="arrow" size={17} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!shops.length && (
                    <div className="ap-empty">
                      <Icon name="shop" size={30} />
                      <h3>
                        {loading
                          ? "Loading shops…"
                          : query
                            ? "No shops found"
                            : "Your next chapter starts here."}
                      </h3>
                      <p>
                        {query
                          ? "Try another shop name."
                          : "Add your first shop and generate its first login code."}
                      </p>
                      {!query && !loading && (
                        <button
                          className="ap-secondary"
                          onClick={() => setCreating(true)}
                        >
                          Add a shop
                        </button>
                      )}
                    </div>
                  )}
                </div>
                <footer className="ap-table-footer">
                  <span>
                    {total
                      ? `${page * 20 + 1}–${Math.min((page + 1) * 20, total)} of ${total} shops`
                      : "No shops to show"}
                  </span>
                  <div>
                    <button
                      disabled={page === 0 || loading}
                      onClick={() => setPage((p) => p - 1)}
                    >
                      Previous
                    </button>
                    <button
                      disabled={(page + 1) * 20 >= total || loading}
                      onClick={() => setPage((p) => p + 1)}
                    >
                      Next
                    </button>
                  </div>
                </footer>
              </section>
              <aside className="ap-inspector">
                {detailLoading ? (
                  <section className="ap-panel ap-empty">
                    Opening shop details…
                  </section>
                ) : detail ? (
                  <section className="ap-panel">
                    <div className="ap-panel-heading">
                      <div>
                        <span className="ap-overline">SHOP DETAILS</span>
                        <h2>{detail.shop.profile.shopName || "Shop"}</h2>
                      </div>
                      <button
                        className="ap-icon-btn"
                        aria-label="Close shop details"
                        onClick={() => {
                          detailRequest.current++;
                          setDetail(null);
                        }}
                      >
                        <Icon name="close" size={17} />
                      </button>
                    </div>
                    <PhotoStoragePanel
                      key={detail.shop.id}
                      shopId={detail.shop.id}
                    />
                    <div className="ap-detail-summary">
                      <span>
                        <Icon name="file" size={17} /> {detail.recordCount}{" "}
                        saved records
                      </span>
                      <p>
                        {detail.shop.profile.address ||
                          "No shop address added yet."}
                      </p>
                    </div>
                    <div className="ap-detail-record-action">
                      <button
                        className="ap-secondary ap-full"
                        onClick={() =>
                          setRecordScope({
                            shopId: detail.shop.id,
                            shopName: detail.shop.profile.shopName || "Shop",
                          })
                        }
                      >
                        <Icon name="file" size={17} /> All shop records
                      </button>
                    </div>
                    <div className="ap-accounts">
                      <h3>People & access</h3>
                      {detail.members.map((member) => (
                        <div className="ap-member" key={member.user_id}>
                          <div className="ap-member-top">
                            <span className="ap-avatar">
                              <Icon name="users" size={17} />
                            </span>
                            <div>
                              <strong>
                                {member.phone || "No phone number"}
                              </strong>
                              <span>
                                {member.role === "owner"
                                  ? "Shop owner"
                                  : "Staff"}{" "}
                                ·{" "}
                                {member.active
                                  ? member.activated
                                    ? "Active"
                                    : "Awaiting first login"
                                  : "Suspended"}
                              </span>
                            </div>
                          </div>
                          <div className="ap-member-actions">
                            <button
                              className="ap-secondary"
                              onClick={() =>
                                setRecordScope({
                                  shopId: detail.shop.id,
                                  shopName:
                                    detail.shop.profile.shopName || "Shop",
                                  userId: member.user_id,
                                  accountLabel: member.phone || member.user_id,
                                })
                              }
                            >
                              <Icon name="file" size={15} /> View records
                            </button>
                            <button
                              className="ap-secondary"
                              disabled={busy || !member.active}
                              onClick={() => void viewCode(member)}
                            >
                              <Icon name="key" size={15} /> View current code
                            </button>
                            <button
                              className="ap-secondary"
                              disabled={busy || !member.active}
                              onClick={() => void generate(member)}
                            >
                              <Icon name="key" size={15} /> New login code
                            </button>
                            <button
                              className="ap-text-btn"
                              disabled={busy}
                              onClick={() => {
                                setReason("");
                                setAccess(member);
                              }}
                            >
                              {member.active ? "Suspend" : "Restore"} access
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : (
                  <>
                    <section className="ap-start-card">
                      <span className="ap-start-icon">
                        <Icon name="shop" size={28} />
                      </span>
                      <span className="ap-overline">ROOM TO GROW</span>
                      <h2>
                        Bring your next
                        <br />
                        shop on board.
                      </h2>
                      <p>
                        A name, a phone number, and they’re ready for their
                        first login.
                      </p>
                      <button
                        className="ap-secondary"
                        onClick={() => setCreating(true)}
                      >
                        Create a shop <Icon name="arrow" size={16} />
                      </button>
                    </section>
                    {section === "overview" && (
                      <section className="ap-panel ap-recent">
                        <div className="ap-panel-heading">
                          <h2>Recent activity</h2>
                          <button
                            className="ap-text-btn"
                            onClick={() => setSection("activity")}
                          >
                            View all
                          </button>
                        </div>
                        {activity}
                      </section>
                    )}
                  </>
                )}
              </aside>
            </div>
          )}
          <footer className="ap-page-footer">
            <span>
              <Icon name="shield" size={14} /> Private workspace ·
              Server-verified admin access
            </span>
            <span>Radefy / Mobile Records</span>
          </footer>
        </div>
      </main>
      {creating && (
        <Modal
          title="Add a new shop"
          onClose={() => !busy && setCreating(false)}
        >
          <p className="ap-modal-intro">
            Create the shop owner’s account. We’ll generate a one-time code for
            you to share privately.
          </p>
          <form onSubmit={(e) => void newShop(e)}>
            <label>
              Shop name
              <input
                autoFocus
                value={shopName}
                onChange={(e) => setShopName(e.target.value)}
                required
                maxLength={160}
                placeholder="e.g. Kabul Mobile Center"
              />
            </label>
            <label>
              Owner’s phone number
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
                placeholder="+93 700 123 456"
              />
            </label>
            <p className="ap-form-note">
              No SMS is sent. The phone number identifies this account.
            </p>
            {error && (
              <div className="ap-error" role="alert">
                {error}
              </div>
            )}
            <div className="ap-modal-actions">
              <button
                type="button"
                className="ap-secondary"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Cancel
              </button>
              <button className="ap-primary" disabled={busy}>
                {busy ? "Creating shop…" : "Create shop & code"}
                <Icon name="arrow" size={16} />
              </button>
            </div>
          </form>
        </Modal>
      )}
      {issued && (
        <Modal title="Their next login, ready." onClose={() => setIssued(null)}>
          <div className="ap-code-success">
            <Icon name="check" size={28} />
          </div>
          <p className="ap-modal-intro">
            Share this code privately with <strong>{issued.phone}</strong>.
          </p>
          <div className="ap-code" aria-label="One-time login code">
            {issued.code.slice(0, 4)} {issued.code.slice(4)}
          </div>
          <p className="ap-code-expiry">
            Expires {dateLabel(issued.expiresAt)} · Kabul time
          </p>
          <div className="ap-code-note">
            <Icon name="shield" size={20} />
            <span>
              Works once, until the expiry shown above. You can reopen and copy
              it from “View current code” until it is used, replaced, or locked.
            </span>
          </div>
          <div className="ap-modal-actions">
            <button className="ap-secondary" onClick={() => setIssued(null)}>
              Done
            </button>
            <button
              className="ap-primary"
              disabled={busy}
              onClick={() => void copyCode()}
            >
              <Icon name={copied ? "check" : "copy"} size={17} />
              {copied ? "Copied" : "Copy code"}
            </button>
          </div>
          {error && (
            <div className="ap-error" role="alert">
              {error}
            </div>
          )}
        </Modal>
      )}
      {access && (
        <Modal
          title={(access.active ? "Suspend" : "Restore") + " account access"}
          onClose={() => !busy && setAccess(null)}
        >
          <p className="ap-modal-intro">
            {access.phone}
            {access.active
              ? " will lose server access to this shop. Their offline device will learn about the change when it reconnects."
              : " will be able to access this shop again. You can then generate a new login code."}
          </p>
          <form onSubmit={(e) => void changeAccess(e)}>
            <label>
              Reason
              <textarea
                autoFocus
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is access changing?"
              />
            </label>
            {error && (
              <div className="ap-error" role="alert">
                {error}
              </div>
            )}
            <div className="ap-modal-actions">
              <button
                type="button"
                className="ap-secondary"
                disabled={busy}
                onClick={() => setAccess(null)}
              >
                Cancel
              </button>
              <button className="ap-primary" disabled={busy}>
                {busy ? "Saving…" : "Confirm change"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
