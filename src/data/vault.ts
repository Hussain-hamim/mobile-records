import { sqliteVault } from "./sqlite-vault";
import { initializeVault } from "./initialize-vault";
import { createVaultPool } from "./vault-pool";
import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
const acquireVault = createVaultPool();
export interface Vault {
  storage?: "sqlite" | "memory" | "cloud";
  get<T>(key: string): Promise<T | null>;
  list<T>(prefix: string): Promise<T[]>;
  batch(changes: { key: string; value: unknown | null }[]): Promise<void>;
  close(): Promise<void>;
}
export async function openVault(account: string, shop: string): Promise<Vault> {
  if (!/^[a-zA-Z0-9-]+$/.test(account + shop))
    throw new Error("Invalid account");
  const name = `records-${account}-${shop}`;
  return acquireVault(name, async () => {
    let key = await SecureStore.getItemAsync(name);
    if (!key) {
      key = [...(await Crypto.getRandomBytesAsync(32))]
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      await SecureStore.setItemAsync(name, key);
    }
    if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid encryption key");
    const db = await SQLite.openDatabaseAsync(name + ".db", {
      useNewConnection: true,
    });
    try {
      await initializeVault(db, key);
      return sqliteVault(db);
    } catch (error) {
      await db.closeAsync().catch(() => {});
      throw error;
    }
  });
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
