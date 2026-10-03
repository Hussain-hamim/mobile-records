import type { Vault } from "./vault";
import { retrySqliteLock } from "./sqlite-lock";

export interface SqliteConnection {
  getFirstAsync<T>(
    sql: string,
    ...params: (string | number)[]
  ): Promise<T | null>;
  getAllAsync<T>(sql: string, ...params: (string | number)[]): Promise<T[]>;
  runAsync(sql: string, ...params: string[]): Promise<unknown>;
  execAsync(sql: string): Promise<void>;
  closeAsync(): Promise<void>;
}

/** All operations use the connection that openVault unlocked with PRAGMA key. */
export function sqliteVault(db: SqliteConnection): Vault {
  let pending: Promise<unknown> = Promise.resolve();
  let closing = false;
  let closePromise: Promise<void> | undefined;
  function enqueue<T>(work: () => Promise<T>): Promise<T> {
    if (closing) return Promise.reject(new Error("Local database is closed"));
    const result = pending.catch(() => {}).then(work);
    pending = result;
    return result;
  }
  return {
    storage: "sqlite",
    get<T>(key: string) {
      return enqueue(async () => {
        const row = await retrySqliteLock(() =>
          db.getFirstAsync<{ value: string }>(
            "SELECT value FROM items WHERE key=?",
            key,
          ),
        );
        return row ? (JSON.parse(row.value) as T) : null;
      });
    },
    list<T>(prefix: string) {
      return enqueue(async () => {
        const rows = await retrySqliteLock(() =>
          db.getAllAsync<{ value: string }>(
            "SELECT value FROM items WHERE substr(key,1,?)=? ORDER BY rowid",
            prefix.length,
            prefix,
          ),
        );
        return rows.map((r) => JSON.parse(r.value) as T);
      });
    },
    batch(changes) {
      // Serialize reads, writes and close too: another caller cannot join or
      // observe this transaction. Expo's exclusive helper opens an unkeyed
      // second connection, which cannot access a SQLCipher database.
      return enqueue(async () => {
        await retrySqliteLock(() => db.execAsync("BEGIN IMMEDIATE"));
        try {
          for (const c of changes) {
            if (c.value === null)
              await db.runAsync("DELETE FROM items WHERE key=?", c.key);
            else
              await db.runAsync(
                "INSERT INTO items VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                c.key,
                JSON.stringify(c.value),
              );
          }
          await retrySqliteLock(() => db.execAsync("COMMIT"));
        } catch (error) {
          await db.execAsync("ROLLBACK").catch(() => {});
          throw error;
        }
      });
    },
    close() {
      if (!closePromise) {
        closing = true;
        closePromise = pending.catch(() => {}).then(() => db.closeAsync());
      }
      return closePromise;
    },
  };
}
