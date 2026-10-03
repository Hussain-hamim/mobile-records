import type { SqliteConnection } from "./sqlite-vault";
import { retrySqliteLock } from "./sqlite-lock";

export async function initializeVault(db: SqliteConnection, key: string) {
  if (!/^[a-f0-9]{64}$/.test(key)) throw new Error("Invalid encryption key");
  await db.execAsync(`PRAGMA key = "x'${key}'";`);
  await db.execAsync("PRAGMA busy_timeout=3000;");
  const cipher = await db.getFirstAsync<{ cipher_version: string }>(
    "PRAGMA cipher_version",
  );
  if (!cipher?.cipher_version)
    throw new Error(
      "Encrypted storage requires the Android development build.",
    );
  const mode = await retrySqliteLock(() =>
    db.getFirstAsync<{ journal_mode: string }>("PRAGMA journal_mode"),
  );
  if (mode?.journal_mode.toLowerCase() !== "wal")
    await retrySqliteLock(() => db.execAsync("PRAGMA journal_mode=WAL;"));
  const table = await retrySqliteLock(() =>
    db.getFirstAsync<{ name: string }>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='items'",
    ),
  );
  if (!table)
    await retrySqliteLock(() =>
      db.execAsync(
        "CREATE TABLE IF NOT EXISTS items(key TEXT PRIMARY KEY, value TEXT NOT NULL);",
      ),
    );
  const version = await retrySqliteLock(() =>
    db.getFirstAsync<{ user_version: number }>("PRAGMA user_version"),
  );
  if (version?.user_version === 0)
    await retrySqliteLock(() => db.execAsync("PRAGMA user_version=1;"));
}
