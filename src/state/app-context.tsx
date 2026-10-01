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
import * as Crypto from "expo-crypto";
import * as Network from "expo-network";
import * as LocalAuthentication from "expo-local-authentication";
import { backend } from "../data/backend";
import { secureStorage } from "../data/secure";
import { memoryVault, openVault } from "../data/vault";
import { Repository, synchronize } from "../data/repository";
import { transportFor } from "../data/transport";
import {
  emptyPerson,
  emptyShop,
  emptyPhone,
  type Draft,
  type Language,
  type Membership,
  type Transaction,
  type Customer,
  type Amendment,
  type Operation,
  type ShopProfile,
} from "../domain/models";
import { normalizePhone } from "../domain/validation";
import { translate, type TextKey } from "../i18n/strings";
import { cleanupScans } from "../services/scanning";

function useController() {
  const [phase, setPhase] = useState<
    "loading" | "login" | "password" | "locked" | "ready" | "revoked"
  >("loading");
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
  const booted = useRef(false);
  const demoRef = useRef(false);
  const t = useCallback((key: TextKey) => translate(language, key), [language]);
  const refresh = useCallback(async () => {
    const repo = repository.current;
    if (!repo) return;
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
    if (demoRef.current || !repository.current || !backend) return;
    if (syncPromise.current) return syncPromise.current;
    const repo = repository.current;
    const task = (async () => {
      setSyncing(true);
      try {
        await synchronize(repo, transportFor(repo.membership));
        setNotice("");
        setPhase("ready");
        await secureStorage.setItem(
          "active-shop",
          JSON.stringify(repo.membership),
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("noAccess")) setPhase("revoked");
        else if (message.includes("changePassword")) setPhase("password");
        setNotice(message);
      } finally {
        await refresh();
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
    async (m: Membership, isDemo = false) => {
      if (repository.current) await repository.current.vault.close();
      const vault = isDemo
        ? memoryVault()
        : await openVault(m.userId, m.shopId);
      const cached = await vault.get<ShopProfile>("profile");
      m.profile = { ...emptyShop(), ...m.profile, ...(cached ?? {}) };
      repository.current = new Repository(vault, m, Crypto.randomUUID);
      demoRef.current = isDemo;
      setDemo(isDemo);
      setMembership(m);
      if (!isDemo)
        await secureStorage.setItem("active-shop", JSON.stringify(m));
      await refresh();
      setPhase("ready");
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
      setPhase("password");
      return;
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
  const unlock = useCallback(async () => {
    const cached = await secureStorage.getItem("active-shop");
    if (!cached || !backend) {
      setPhase("login");
      return;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: translate(language, "unlock"),
      disableDeviceFallback: false,
    });
    if (!result.success) return;
    const m: Membership = JSON.parse(cached);
    // The encrypted membership marker exists only after successful sign-in.
    // Do not refresh an expired network session to unlock offline records.
    await activate(m);
    void sync();
  }, [activate, language, sync]);
  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    void (async () => {
      await cleanupScans();
      const prefs = await secureStorage.getItem("preferences");
      if (prefs) {
        const p = JSON.parse(prefs);
        setLanguageState(p.language ?? "ps");
        setGregorianState(!!p.gregorian);
      }
      const cached = await secureStorage.getItem("active-shop");
      setPhase(
        cached && backend && Platform.OS === "android" ? "locked" : "login",
      );
    })().catch(() => setPhase("login"));
  }, []);
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
  async function signIn(phone: string, password: string) {
    if (!backend || Platform.OS !== "android") throw new Error("setup");
    if (
      (await LocalAuthentication.getEnrolledLevelAsync()) ===
      LocalAuthentication.SecurityLevel.NONE
    )
      throw new Error("deviceLockRequired");
    const { error } = await backend.auth.signInWithPassword({
      phone: normalizePhone(phone),
      password,
    });
    if (error) throw error;
    await fetchMembership();
  }
  async function changePassword(password: string) {
    if (!backend) return;
    const { data, error } = await backend.functions.invoke("manage-account", {
      body: { action: "password", password },
    });
    if (error || data?.error) throw new Error(data?.error ?? error?.message);
    await fetchMembership();
  }
  async function enterDemo() {
    const m: Membership = {
      shopId: "demo-shop",
      userId: "demo-user",
      role: "owner",
      version: 1,
      profile: {
        ...emptyShop(),
        shopName: "Kabul Mobile",
        name: "Ahmad",
        address: "Kabul, Afghanistan",
        licenceNumber: "DEMO-001",
        shopNumber: "24",
      },
    };
    await activate(m, true);
    const repo = repository.current!;
    for (const [i, direction] of (["sell", "buy", "buy"] as const).entries()) {
      const draft: Draft = {
        id: Crypto.randomUUID(),
        direction,
        phone: {
          ...emptyPhone(),
          brand: ["Apple", "Samsung", "Apple"][i],
          model: ["iPhone 13", "Galaxy A54", "iPhone 12"][i],
          imei1: "490154203237518",
          storage: "128 GB",
          color: ["Midnight", "Graphite", "Blue"][i],
        },
        customer: {
          ...emptyPerson(),
          name: ["Farid Ahmad", "Zahra Karimi", "Omid Rahimi"][i],
          idNumber: "DEMO-" + (i + 1),
          phone: "+9370000000" + i,
        },
        customerId: "",
        customerConfirmed: true,
        price: ["32500", "18500", "24000"][i],
        createdAt: new Date().toISOString(),
        step: 0,
      };
      await repo.finalize(draft);
    }
    await refresh();
  }
  async function signOut() {
    if (!demoRef.current && (await repository.current?.operations())?.length)
      throw new Error("logoutPending");
    await syncPromise.current;
    if (!demoRef.current) {
      await backend?.auth.signOut({ scope: "local" });
      await secureStorage.removeItem("active-shop");
    }
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
    await repository.current?.saveDraft(d);
    setDrafts((current) => [...current.filter((item) => item.id !== d.id), d]);
  }
  async function finalize(d: Draft) {
    const record = await repository.current!.finalize(d);
    await refresh();
    void sync();
    return record;
  }
  async function saveProfile(p: ShopProfile) {
    await repository.current!.saveProfile(p);
    await refresh();
    void sync();
  }
  async function amend(r: Transaction, reason: string) {
    await repository.current!.amend(r, reason);
    await refresh();
    void sync();
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
        value: { id, person: data.person, version: data.version },
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
    changePassword,
    enterDemo,
    unlock,
    signOut,
    sync,
    saveDraft,
    finalize,
    saveProfile,
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
