import { test } from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { sqliteVault, type SqliteConnection } from "../src/data/sqlite-vault";
import { Repository } from "../src/data/repository";
import {
  demoMembership,
  ensureDemoData,
  persistDemoSession,
} from "../src/data/demo";
import { memoryVault } from "../src/data/vault.web";
import { scanTemplates } from "../src/domain/fingerprints";
import { emptyPhone, type FingerprintEntry } from "../src/domain/models";

function open(path: string) {
  const db = new DatabaseSync(path);
  db.exec(
    "CREATE TABLE IF NOT EXISTS items(key TEXT PRIMARY KEY, value TEXT NOT NULL)",
  );
  const connection: SqliteConnection = {
    async getFirstAsync<T>(sql: string, ...params: (string | number)[]) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...params: (string | number)[]) {
      return db.prepare(sql).all(...params) as T[];
    },
    async runAsync(sql, ...params) {
      return db.prepare(sql).run(...params);
    },
    async execAsync(sql) {
      db.exec(sql);
    },
    async closeAsync() {
      db.close();
    },
  };
  return sqliteVault(connection);
}

test("fingerprints and drafts survive SQLite close/reopen and demo re-entry without reseeding", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fingerprint-persistence-"));
  const file = join(dir, "demo.db");
  let repo = new Repository(open(file), demoMembership(), randomUUID);
  try {
    await ensureDemoData(repo, randomUUID);
    const c = (await repo.customers())[0];
    const fingers: FingerprintEntry[] = (["primary", "backup"] as const).map(
      (slot) => ({
        id: randomUUID(),
        slot,
        template: Buffer.from(`synthetic-${slot}`).toString("base64"),
        enrolledAt: new Date().toISOString(),
        enrolledBy: repo.membership.userId,
      }),
    );
    await repo.saveFingerprints(c.id, fingers, "", c.version);
    const draft = {
      id: randomUUID(),
      direction: "buy" as const,
      customer: c.person,
      customerId: c.id,
      phone: emptyPhone(),
      price: "100",
      customerConfirmed: false,
      step: 1,
      createdAt: new Date().toISOString(),
      fingerprints: [fingers[0]],
    };
    await repo.saveDraft(draft);
    await repo.vault.close();
    repo = new Repository(open(file), demoMembership(), randomUUID);
    await ensureDemoData(repo, randomUUID);
    const customers = await repo.customers();
    assert.equal(customers.length, 3);
    assert.equal((await repo.records()).length, 3);
    assert.deepEqual(
      customers.find((x) => x.id === c.id)?.fingerprints,
      fingers,
    );
    assert.deepEqual(
      scanTemplates(customers).map((x) => x.customerId),
      [c.id, c.id],
    );
    assert.deepEqual(await repo.drafts(), [draft]);
    assert.ok(
      (await repo.operations()).some(
        (x) => (x.payload as { id: string }).id === c.id,
      ),
    );
  } finally {
    await repo.vault.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("live demo migration preserves existing records and remains idempotent", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fingerprint-migrate-"));
  const file = join(dir, "demo.db");
  const repo = new Repository(memoryVault(), demoMembership(), randomUUID);
  try {
    await ensureDemoData(repo, randomUUID);
    const before = await repo.customers();
    await persistDemoSession(repo, async () => open(file));
    await persistDemoSession(repo, async () => {
      throw new Error("Must not reopen");
    });
    assert.equal(repo.vault.storage, "sqlite");
    assert.deepEqual(await repo.customers(), before);
    await ensureDemoData(repo, randomUUID);
    assert.equal((await repo.records()).length, 3);
  } finally {
    await repo.vault.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("failed batches roll back, concurrent operations serialize, and close waits for writes", async () => {
  const dir = mkdtempSync(join(tmpdir(), "vault-transactions-"));
  const file = join(dir, "test.db");
  let vault = open(file);
  try {
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    const failed = vault.batch([
      { key: "discard", value: "must roll back" },
      { key: "invalid", value: circular },
    ]);
    const saved = vault.batch([{ key: "keep", value: { enrolled: true } }]);
    const read = vault.list("");
    const closed = vault.close();
    await assert.rejects(failed, /circular/i);
    await saved;
    assert.deepEqual(await read, [{ enrolled: true }]);
    await closed;
    await assert.rejects(vault.get("keep"), /closed/);
    vault = open(file);
    assert.equal(await vault.get("discard"), null);
    assert.deepEqual(await vault.get("keep"), { enrolled: true });
  } finally {
    await vault.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("encrypted vault never asks Expo to create an unkeyed exclusive connection", async () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE items(key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  let exclusiveCalls = 0;
  const connection = {
    async getFirstAsync<T>(sql: string, ...params: (string | number)[]) {
      return (db.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async getAllAsync<T>(sql: string, ...params: (string | number)[]) {
      return db.prepare(sql).all(...params) as T[];
    },
    async runAsync(sql: string, ...params: string[]) {
      return db.prepare(sql).run(...params);
    },
    async execAsync(sql: string) {
      db.exec(sql);
    },
    async closeAsync() {
      db.close();
    },
    async withExclusiveTransactionAsync() {
      exclusiveCalls++;
      throw new Error(
        "file is not a database: second connection has no encryption key",
      );
    },
  };
  const vault = sqliteVault(connection);
  try {
    await vault.batch([
      { key: "fingerprint", value: "synthetic-test-template" },
    ]);
    assert.equal(await vault.get("fingerprint"), "synthetic-test-template");
    assert.equal(exclusiveCalls, 0);
  } finally {
    await vault.close();
  }
});
