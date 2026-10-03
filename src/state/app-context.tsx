import * as Crypto from "expo-crypto";
import * as LocalAuthentication from "expo-local-authentication";
import * as Network from "expo-network";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import { backend } from "../data/backend";
import { demoMembership, ensureDemoData } from "../data/demo";
import { redeemLoginCode } from "../data/login-code";
import { Repository, synchronize } from "../data/repository";
import { secureStorage } from "../data/secure";
import { transportFor } from "../data/transport";
import { memoryVault } from "../data/memory-vault";
import { cloudVault } from "../data/cloud-vault";
import {
  emptyShop,
  type Amendment,
  type Customer,
  type Draft,
  type FingerprintEntry,
  type Language,
  type Membership,
  type Operation,
  type ShopProfile,
  type Transaction,
} from "../domain/models";
import { normalizePhone } from "../domain/validation";
import { translate, type TextKey } from "../i18n/strings";
import { cleanupScans } from "../services/scanning";

import { customerFromRow } from "../domain/fingerprints";
import { closeReader } from "../services/fingerprint";

function useController() {
  const [phase, setPhase] = useState<"loading" | "login" | "ready" | "revoked">(
    "loading",
  );
  const [language, setLanguageState] = useState<Language>("ps");
  const [gregorian, setGregorianState] = useState(false);
  const [demo, setDemo] = useState(false);
  const [records, setRecords] = useState<Transaction[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [amendments, setAmendments] = useState<Amendment[]>([]);
  const [operations, setOperations] = useState<Operation[]>([]);
  const [membership, setMembership] = useState<Membership | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [notice, setNotice] = useState("");
  const repository = useRef<Repository | null>(null);
  const syncPromise = useRef<Promise<void> | null>(null);
  const activationQueue = useRef<Promise<void>>(Promise.resolve());
  const transitions = useRef(0);
  const booted = useRef(false);
  const demoRef = useRef(false);
  const t = useCallback((key: TextKey) => translate(language, key), [language]);
  const refresh = useCallback(async () => {
    const repo = repository.current;
    if (!repo) return;
    if (repo.vault.storage === "cloud") await repo.vault.get("profile");
    const [r, c, d, a, o] = await Promise.all([
      repo.records(),
      repo.customers(),
      repo.drafts(),
      repo.amendments(),
      repo.operations(),
    ]);
    setRecords(r.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)));
    setCustomers(c);
    setDrafts(d);
    setAmendments(a);
    setOperations(o);
    setMembership({ ...repo.membership });
  }, []);
  const sync = useCallback(async () => {
    if (
      transitions.current ||
      demoRef.current ||
      !repository.current ||
      !backend
    )
      return;
    if (syncPromise.current) return syncPromise.current;
    const repo = repository.current;
    const task = (async () => {
      setSyncing(true);
      try {
        if (repo.vault.storage === "cloud")
          await transportFor(repo.membership).checkAccess();
        else await synchronize(repo, transportFor(repo.membership));
        await refresh();
        setNotice("");
        setPhase("ready");
        await secureStorage.setItem(
          "active-shop",
          JSON.stringify(repo.membership),
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("noAccess")) setPhase("revoked");
        else if (message.includes("loginCodeRequired")) setPhase("login");
        setNotice(message);
      } finally {
        setSyncing(false);
      }
    })();
    syncPromise.current = task;
    try {
      await task;
    } finally {
      syncPromise.current = null;
    }
  }, [refresh]);
  const activate = useCallback(
    (m: Membership, isDemo = false) => {
      transitions.current++;
      const task = activationQueue.current
        .catch(() => {})
        .then(async () => {
          await syncPromise.current?.catch(() => {});
          await closeReader();
          const previous = repository.current;
          repository.current = null;
          await previous?.vault.close();
          if (!isDemo && !backend) throw new Error("setup");
          const vault = isDemo ? memoryVault() : cloudVault(backend!, m);
          try {
            const cached = await vault.get<ShopProfile>("profile");
            m.profile = { ...emptyShop(), ...m.profile, ...(cached ?? {}) };
            repository.current = new Repository(vault, m, Crypto.randomUUID);
            demoRef.current = isDemo;
            setDemo(isDemo);
            setMembership(m);
            if (isDemo) {
              await ensureDemoData(repository.current, Crypto.randomUUID);
              if (Platform.OS === "android")
                await secureStorage.setItem("local-demo-active", "true");
            } else {
              await secureStorage.removeItem("local-demo-active");
              await secureStorage.setItem("active-shop", JSON.stringify(m));
            }
            await refresh();
            setPhase("ready");
          } catch (error) {
            repository.current = null;
            await vault.close().catch(() => {});
            throw error;
          }
        });
      const settled = task.finally(() => {
        transitions.current--;
      });
      activationQueue.current = settled;
      return settled;
    },
    [refresh],
  );
  const fetchMembership = useCallback(async () => {
    if (!backend) throw new Error("setup");
    const {
      data: { user },
      error,
    } = await backend.auth.getUser();
    if (error || !user) throw new Error(error?.message ?? "noAccess");
    const status = await backend
      .from("account_status")
      .select("must_change_password")
      .eq("user_id", user.id)
      .single();
    if (status.error) throw new Error(status.error.message);
    if (status.data.must_change_password) {
      setPhase("login");
      throw new Error("loginCodeRequired");
    }
    const m = await backend
      .from("memberships")
      .select("shop_id,role")
      .eq("user_id", user.id)
      .eq("active", true)
      .order("shop_id")
      .limit(1)
      .single();
    if (m.error || !m.data) throw new Error("noAccess");
    const shop = await backend
      .from("shops")
      .select("profile,version")
      .eq("id", m.data.shop_id)
      .single();
    if (shop.error) throw new Error(shop.error.message);
    await activate({
      shopId: m.data.shop_id,
      userId: user.id,
      role: m.data.role,
      profile: shop.data.profile,
      version: shop.data.version,
    });
    void sync();
  }, [activate, sync]);
  useEffect(() => {
    if (booted.current) {
      const repo = repository.current;
      if (repo?.vault.storage === "sqlite") {
        void activate({ ...repo.membership }, demoRef.current).catch((e) =>
          setNotice(String(e)),
        );
      }
      return;
    }
    booted.current = true;
    void (async () => {
      await cleanupScans();
      const prefs = await secureStorage.getItem("preferences");
      if (prefs) {
        const p = JSON.parse(prefs);
        setLanguageState(p.language ?? "ps");
        setGregorianState(!!p.gregorian);
      }
      if (
        Platform.OS === "android" &&
        (await secureStorage.getItem("local-demo-active")) === "true"
      ) {
        await activate(demoMembership(), true);
        return;
      }
      const cached = await secureStorage.getItem("active-shop");
      if (cached && backend && Platform.OS === "android") {
        await activate(JSON.parse(cached) as Membership);
        void sync();
        return;
      }
      // Code redemption may have succeeded before local database setup failed.
      // Resume that session; fetchMembership revalidates the user and access.
      if (backend && Platform.OS === "android") {
        const { data } = await backend.auth.getSession();
        if (data.session) {
          await fetchMembership();
          return;
        }
      }
      setPhase("login");
    })().catch(() => setPhase("login"));
  }, [activate, sync, fetchMembership]);
  useEffect(() => {
    if (phase !== "ready" || demo) return;
    const network = Network.addNetworkStateListener((state) => {
      if (state.isInternetReachable) void sync();
    });
    const app = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        backend?.auth.startAutoRefresh();
        void sync();
      } else backend?.auth.stopAutoRefresh();
    });
    return () => {
      network.remove();
      app.remove();
    };
  }, [phase, demo, sync]);
  async function signIn(phone: string, code: string) {
    if (!backend || Platform.OS !== "android") throw new Error("setup");
    if (
      (await LocalAuthentication.getEnrolledLevelAsync()) ===
      LocalAuthentication.SecurityLevel.NONE
    )
      throw new Error("deviceLockRequired");
    const normalized = normalizePhone(phone);
    const { data: existing } = await backend.auth.getSession();
    if (existing.session) {
      const { data, error } = await backend.auth.getUser();
      if (
        !error &&
        data.user?.phone &&
        normalizePhone("+" + data.user.phone.replace(/^\+/, "")) === normalized
      ) {
        await fetchMembership();
        return;
      }
    }
    await redeemLoginCode(normalized, code);
    await fetchMembership();
  }
  async function enterDemo() {
    await activate(demoMembership(), true);
  }
  async function signOut() {
    await activationQueue.current.catch(() => {});
    await closeReader();
    if (!demoRef.current && (await repository.current?.operations())?.length)
      throw new Error("logoutPending");
    await syncPromise.current;
    if (!demoRef.current) {
      await backend?.auth.signOut({ scope: "local" });
      await secureStorage.removeItem("active-shop");
    }
    await secureStorage.removeItem("local-demo-active");
    await repository.current?.vault.close();
    repository.current = null;
    setRecords([]);
    setCustomers([]);
    setDrafts([]);
    setAmendments([]);
    setOperations([]);
    setMembership(null);
    setDemo(false);
    demoRef.current = false;
    setPhase("login");
  }
  async function saveDraft(d: Draft) {
    if (!repository.current) throw new Error("noAccess");
    await repository.current.saveDraft(d);
    setDrafts((current) => [...current.filter((item) => item.id !== d.id), d]);
  }
  async function finalize(d: Draft) {
    const record = await repository.current!.finalize(d);
    setRecords((current) => [record, ...current.filter((r) => r.id !== record.id)]);
    setDrafts((current) => current.filter((item) => item.id !== d.id));
    await refresh().catch(() => setNotice("cloudRefreshFailed"));
    return record;
  }
  async function saveFingerprints(
    customerId: string,
    entries: FingerprintEntry[],
    reason: string,
    version: number,
  ) {
    await repository.current!.saveFingerprints(
      customerId,
      entries,
      reason,
      version,
    );
    await refresh().catch(() => setNotice("cloudRefreshFailed"));
  }
  async function saveProfile(p: ShopProfile) {
    await repository.current!.saveProfile(p);
    await refresh().catch(() => setNotice("cloudRefreshFailed"));
  }
  async function amend(r: Transaction, reason: string) {
    await repository.current!.amend(r, reason);
    await refresh().catch(() => setNotice("cloudRefreshFailed"));
  }
  async function resolve(op: Operation, keep: boolean) {
    if (!backend || !membership || !["shop", "customer"].includes(op.kind))
      return;
    const table = op.kind === "shop" ? "shops" : "customers";
    const id = (op.payload as { id: string }).id;
    let q = backend.from(table).select("*").eq("id", id);
    if (table === "customers") q = q.eq("shop_id", membership.shopId);
    const { data, error } = await q.single();
    if (error) throw error;
    const updates: { key: string; value: unknown | null }[] = [
      { key: "op:" + op.id, value: null },
    ];
    if (keep) {
      const newId = Crypto.randomUUID();
      updates.push({
        key: "op:" + newId,
        value: {
          ...op,
          id: newId,
          baseVersion: data.version,
          state: "pending",
          error: undefined,
        },
      });
    } else if (op.kind === "shop") {
      updates.push({ key: "profile", value: data.profile });
      repository.current!.membership.profile = data.profile;
      repository.current!.membership.version = data.version;
    } else
      updates.push({
        key: "customer:" + id,
        value: customerFromRow(data),
      });
    await repository.current!.vault.batch(updates);
    await refresh();
    void sync();
  }
  async function preferences(lang: Language, greg: boolean) {
    setLanguageState(lang);
    setGregorianState(greg);
    await secureStorage.setItem(
      "preferences",
      JSON.stringify({ language: lang, gregorian: greg }),
    );
  }
  return {
    phase,
    language,
    gregorian,
    t,
    rtl: language !== "en",
    demo,
    records,
    customers,
    drafts,
    amendments,
    operations,
    membership,
    syncing,
    notice,
    signIn,
    enterDemo,
    signOut,
    sync,
    saveDraft,
    finalize,
    saveProfile,
    saveFingerprints,
    amend,
    resolve,
    preferences,
  };
}
const AppContext = createContext<ReturnType<typeof useController> | null>(null);
export function AppProvider({ children }: { children: ReactNode }) {
  const value = useController();
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}
export function useApp() {
  const context = useContext(AppContext);
  if (!context) throw new Error("Missing AppProvider");
  return context;
}
