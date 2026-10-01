import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
export interface Vault {
  get<T>(key: string): Promise<T | null>;
  list<T>(prefix: string): Promise<T[]>;
  batch(changes: { key: string; value: unknown | null }[]): Promise<void>;
  close(): Promise<void>;
}
export async function openVault(account: string, shop: string): Promise<Vault> {
  if (!/^[a-zA-Z0-9-]+$/.test(account + shop))
    throw new Error("Invalid account");
  const name = `records-${account}-${shop}`;
  let key = await SecureStore.getItemAsync(name);
  if (!key) {
    key = [...(await Crypto.getRandomBytesAsync(32))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    await SecureStore.setItemAsync(name, key);
  }
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid encryption key");
  const db = await SQLite.openDatabaseAsync(name + ".db");
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  const cipher = await db.getFirstAsync<{ cipher_version: string }>(
    "PRAGMA cipher_version",
  );
  if (!cipher?.cipher_version) {
    await db.closeAsync();
    throw new Error(
      "Encrypted storage requires the Android development build.",
    );
  }
  await db.execAsync(
    "PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS items(key TEXT PRIMARY KEY, value TEXT NOT NULL); PRAGMA user_version=1;",
  );
  return {
    async get<T>(key: string) {
      const row = await db.getFirstAsync<{ value: string }>(
        "SELECT value FROM items WHERE key=?",
        key,
      );
      return row ? (JSON.parse(row.value) as T) : null;
    },
    async list<T>(prefix: string) {
      const rows = await db.getAllAsync<{ value: string }>(
        "SELECT value FROM items WHERE substr(key,1,?)=? ORDER BY rowid",
        prefix.length,
        prefix,
      );
      return rows.map((r) => JSON.parse(r.value) as T);
    },
    async batch(changes) {
      await db.withExclusiveTransactionAsync(async (tx) => {
        for (const c of changes) {
          if (c.value === null)
            await tx.runAsync("DELETE FROM items WHERE key=?", c.key);
          else
            await tx.runAsync(
              "INSERT INTO items VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
              c.key,
              JSON.stringify(c.value),
            );
        }
      });
    },
    close: () => db.closeAsync(),
  };
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
