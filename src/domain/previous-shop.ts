import { normalizeImei, validImei } from "./validation";
export type PreviousShopMatch = {
  imeis: string[];
  shopName: string;
  shopNumber?: string;
  phone: string;
  address: string;
  occurredAt: string;
  direction: "buy" | "sell";
};
export type PreviousShopResult = {
  enabled: boolean;
  matches?: PreviousShopMatch[];
};
export type PreviousShopState = {
  status: "loading" | "ready" | "disabled" | "result" | "error";
  matches: PreviousShopMatch[];
  error?: string;
};
export function hasPreviousShopHistory(state: PreviousShopState) {
  return state.status === "result" && state.matches.length > 0;
}
export function previousShopImeis(values: string[]) {
  return [...new Set(values.map(normalizeImei).filter((v) => validImei(v)))];
}
/** Screen-owned only: no persistent cache and no late callbacks after invalidation. */
export class PreviousShopSession {
  private epoch = 0;
  private listeners = new Set<() => void>();
  private state: PreviousShopState = { status: "loading", matches: [] };
  requested = false;
  constructor(
    private request: (lookup: boolean) => Promise<PreviousShopResult>,
  ) {}
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.state;
  private set(state: PreviousShopState) {
    this.state = state;
    this.listeners.forEach((fn) => fn());
  }
  clear() {
    this.epoch++;
    this.set({ status: "loading", matches: [] });
  }
  async run(lookup = this.requested) {
    this.requested = lookup;
    const epoch = ++this.epoch;
    this.set({ status: "loading", matches: [] });
    try {
      const result = await this.request(lookup);
      if (epoch !== this.epoch) return;
      this.set({
        status: !result.enabled ? "disabled" : lookup ? "result" : "ready",
        matches: result.enabled ? (result.matches ?? []) : [],
      });
    } catch (e) {
      if (epoch !== this.epoch) return;
      const code = e instanceof Error ? e.message : "";
      this.set({
        status: "error",
        matches: [],
        error: [
          "previousShopOffline",
          "previousShopRateLimited",
          "noAccess",
          "invalidImei",
        ].includes(code)
          ? code
          : "previousShopUnavailable",
      });
    }
  }
}
