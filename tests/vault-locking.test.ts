import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeVault } from "../src/data/initialize-vault";
import { createVaultPool } from "../src/data/vault-pool";
import { retrySqliteLock } from "../src/data/sqlite-lock";
import { sqliteVault, type SqliteConnection } from "../src/data/sqlite-vault";
import { memoryVault } from "../src/data/vault.web";

const key = "a".repeat(64);
test("reopening an initialized encrypted vault configures a timeout without writing its schema or WAL mode", async () => {
  const commands: string[] = [];
  const db = {
    async execAsync(sql: string) {
      commands.push(sql);
    },
    async getFirstAsync<T>(sql: string) {
      return ({
        "PRAGMA cipher_version": { cipher_version: "4" },
        "PRAGMA journal_mode": { journal_mode: "wal" },
        "SELECT name FROM sqlite_master WHERE type='table' AND name='items'": {
          name: "items",
        },
        "PRAGMA user_version": { user_version: 1 },
      }[sql] ?? null) as T | null;
    },
  } as SqliteConnection;
  await initializeVault(db, key);
  assert.equal(commands.length, 2);
  assert.match(commands[0], /^PRAGMA key/);
  assert.equal(commands[1], "PRAGMA busy_timeout=3000;");
});
test("temporary locks retry within a limit; wrong-key and corruption errors fail immediately", async () => {
  let attempts = 0;
  const waits: number[] = [];
  assert.equal(
    await retrySqliteLock(
      async () => {
        if (++attempts < 3) throw Error("database is locked");
        return "ok";
      },
      async (ms) => {
        waits.push(ms);
      },
    ),
    "ok",
  );
  assert.deepEqual(waits, [100, 250]);
  attempts = 0;
  await assert.rejects(
    retrySqliteLock(
      async () => {
        attempts++;
        throw Error("database is locked");
      },
      async () => {},
    ),
    /locked/,
  );
  assert.equal(attempts, 4);
  attempts = 0;
  await assert.rejects(
    retrySqliteLock(
      async () => {
        attempts++;
        throw Error("file is not a database");
      },
      async () => {},
    ),
    /not a database/,
  );
  assert.equal(attempts, 1);
});
test("simultaneous opens share one connection, isolated leases and wait for closing before reopening", async () => {
  const acquire = createVaultPool();
  let opens = 0,
    closes = 0;
  let release: () => void = () => {};
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const open = async () => {
    opens++;
    const vault = memoryVault();
    return {
      ...vault,
      close: async () => {
        closes++;
        await gate;
      },
    };
  };
  const [a, b] = await Promise.all([
    acquire("shop-a", open),
    acquire("shop-a", open),
  ]);
  assert.equal(opens, 1);
  await a.batch([{ key: "record", value: "saved" }]);
  assert.equal(await b.get("record"), "saved");
  await a.close();
  await a.close();
  assert.equal(closes, 0);
  await assert.rejects(a.get("record"), /closed/);
  const close = b.close();
  const next = acquire("shop-a", open);
  await Promise.resolve();
  assert.equal(opens, 1);
  release();
  await close;
  await (await next).close();
  assert.equal(opens, 2);
  assert.equal(closes, 2);
  const other = await acquire("shop-b", open);
  assert.equal(opens, 3);
  await other.close();
});
test("failed opens can be retried without poisoning the connection pool", async () => {
  const acquire = createVaultPool();
  const fail = () => Promise.reject(Error("locked"));
  const attempts = await Promise.allSettled([
    acquire("shop", fail),
    acquire("shop", fail),
  ]);
  assert.ok(attempts.every((r) => r.status === "rejected"));
  const vault = await acquire("shop", async () => memoryVault());
  await vault.batch([{ key: "retry", value: true }]);
  assert.equal(await vault.get("retry"), true);
  await vault.close();
});
test("a real competing SQLite writer releases its lock and the queued batch persists exactly once", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-lock-"));
  const path = join(dir, "test.db");
  const blocker = new DatabaseSync(path),
    db = new DatabaseSync(path);
  blocker.exec(
    "PRAGMA journal_mode=WAL; CREATE TABLE items(key TEXT PRIMARY KEY,value TEXT NOT NULL); BEGIN IMMEDIATE;",
  );
  const connection: SqliteConnection = {
    async execAsync(sql) {
      db.exec(sql);
    },
    async runAsync(sql, ...args) {
      return db.prepare(sql).run(...args);
    },
    async getFirstAsync<T>(sql: string, ...args: (string | number)[]) {
      return (db.prepare(sql).get(...args) as T) ?? null;
    },
    async getAllAsync<T>(sql: string, ...args: (string | number)[]) {
      return db.prepare(sql).all(...args) as T[];
    },
    async closeAsync() {
      db.close();
    },
  };
  const vault = sqliteVault(connection);
  const release = setTimeout(() => blocker.exec("COMMIT"), 30);
  try {
    await vault.batch([{ key: "record", value: { id: 1 } }]);
    assert.deepEqual(await vault.list("record"), [{ id: 1 }]);
  } finally {
    clearTimeout(release);
    await vault.close();
    blocker.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
