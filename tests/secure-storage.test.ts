import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createChunkStorage } from "../src/data/chunk-storage";
test("failed token writes leave the previous committed session readable; Unicode is preserved", async () => {
  const items = new Map<string, string>();
  let fail = false;
  const storage = createChunkStorage(
    {
      async getItemAsync(key) {
        return items.get(key) ?? null;
      },
      async setItemAsync(key, value) {
        if (fail && key.endsWith(".1")) throw new Error("disk error");
        assert.ok(Buffer.byteLength(value, "utf8") <= 2048);
        items.set(key, value);
      },
      async deleteItemAsync(key) {
        items.delete(key);
      },
    },
    randomUUID,
  );
  const before = "پښتو 😀".repeat(200);
  await storage.setItem("session", before);
  assert.equal(await storage.getItem("session"), before);
  fail = true;
  await assert.rejects(() => storage.setItem("session", "x".repeat(3000)));
  assert.equal(await storage.getItem("session"), before);
  fail = false;
  await storage.setItem("session", "new");
  assert.equal(await storage.getItem("session"), "new");
  await storage.removeItem("session");
  assert.equal(await storage.getItem("session"), null);
});
