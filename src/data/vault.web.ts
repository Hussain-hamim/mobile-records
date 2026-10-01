import type { Vault } from "./vault";
export type { Vault } from "./vault";
export async function openVault(): Promise<Vault> {
  throw new Error("Production records are supported on Android only.");
}
export function memoryVault(): Vault {
  const values = new Map<string, unknown>();
  return {
    async get<T>(key: string) {
      return (values.get(key) as T) ?? null;
    },
    async list<T>(prefix: string) {
      return [...values]
        .filter(([k]) => k.startsWith(prefix))
        .map(([, v]) => JSON.parse(JSON.stringify(v)) as T);
    },
    async batch(changes) {
      for (const c of changes) {
        if (c.value === null) values.delete(c.key);
        else values.set(c.key, JSON.parse(JSON.stringify(c.value)));
      }
    },
    async close() {
      values.clear();
    },
  };
}
