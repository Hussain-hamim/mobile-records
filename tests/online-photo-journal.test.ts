import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createHash, randomUUID } from "node:crypto";
import ts from "typescript";
import * as domain from "../src/domain/online-photos";
import * as local from "../src/domain/local-photos";
const compiled = ts.transpileModule(
  readFileSync("src/services/photo-journal.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const scope = {
  shopId: "10000000-0000-4000-8000-000000000001",
  userId: "20000000-0000-4000-8000-000000000001",
  recordId: "30000000-0000-4000-8000-000000000001",
};
function harness() {
  const data = new Map<string, Uint8Array>(),
    dirs = new Set<string>();
  let fail = false;
  const path = (p: any[]) =>
    p.map((x) => (typeof x === "string" ? x : x.uri)).join("/");
  class File {
    uri: string;
    constructor(...p: any[]) {
      this.uri = path(p);
    }
    get name() {
      return this.uri.split("/").at(-1)!;
    }
    get exists() {
      return data.has(this.uri);
    }
    get size() {
      return data.get(this.uri)?.length ?? 0;
    }
    write(v: Uint8Array | string) {
      if (fail && this.name.endsWith(".json")) {
        data.set(this.uri, new TextEncoder().encode("{"));
        throw Error("disk full");
      }
      data.set(
        this.uri,
        typeof v === "string" ? new TextEncoder().encode(v) : v,
      );
    }
    async text() {
      return new TextDecoder().decode(data.get(this.uri));
    }
    async bytes() {
      if (!this.exists) throw Error("missing");
      return data.get(this.uri)!;
    }
    delete() {
      data.delete(this.uri);
    }
    info() {
      return {
        md5: createHash("md5")
          .update(data.get(this.uri) ?? new Uint8Array())
          .digest("hex"),
        modificationTime: Date.now(),
      };
    }
  }
  class Directory {
    uri: string;
    constructor(...p: any[]) {
      this.uri = path(p);
    }
    get exists() {
      return dirs.has(this.uri);
    }
    create() {
      dirs.add(this.uri);
    }
    list() {
      return [...data.keys()]
        .filter((u) => u.startsWith(this.uri + "/"))
        .map((u) => new File(u));
    }
  }
  data.set("accepted.jpg", new Uint8Array([255, 216, 255, 42]));
  data.set("preview.jpg", new Uint8Array([255, 216, 255, 7]));
  const modules: any = {
    "expo-file-system": { File, Directory, Paths: { document: "documents" } },
    "expo-crypto": { randomUUID },
    "expo/fetch": { fetch: async () => ({ ok: true }) },
    "expo-image-manipulator": {
      SaveFormat: { JPEG: "jpeg" },
      ImageManipulator: {
        manipulate: () => ({
          resize() {},
          release() {},
          renderAsync: async () => ({
            release() {},
            saveAsync: async () => ({ uri: "preview.jpg" }),
          }),
        }),
      },
    },
    "../domain/online-photos": domain,
    "../domain/local-photos": local,
    "./local-photos": {
      loadLocalPhotos: async () => ({
        photos: { person: "accepted.jpg" },
        sources: { person: "private-original.jpg" },
      }),
    },
  };
  function boot() {
    const exports: any = {};
    runInNewContext(compiled, {
      exports,
      require: (name: string) => modules[name],
      Date,
      Set,
      Map,
      JSON,
      Promise,
    });
    return exports;
  }
  return {
    boot,
    data,
    fail: (v: boolean) => {
      fail = v;
    },
  };
}
test("journal survives restart, ignores interrupted snapshots, and separates accounts", async () => {
  const h = harness(),
    a = h.boot();
  const job = await a.createJob(scope, "person", 0, "");
  assert.equal(job.bytes, 4);
  assert.equal((await h.boot().readJobs(scope))[0].md5, job.md5);
  h.fail(true);
  await assert.rejects(a.writeJob({ ...job, attempts: 1 }));
  h.fail(false);
  assert.equal((await h.boot().readJobs(scope))[0].attempts, 0);
  assert.equal(
    (await a.readJobs({ ...scope, userId: randomUUID() })).length,
    0,
  );
  const persisted = [...h.data]
    .filter(([k]) => k.endsWith(".json"))
    .map(([, b]) => new TextDecoder().decode(b))
    .join("");
  assert.doesNotMatch(persisted, /https:|X-Amz|private-original|base64/);
});
test("cancellation removes payloads and late callbacks cannot recreate the job", async () => {
  const h = harness(),
    a = h.boot(),
    job = await a.createJob(scope, "person", 0, "");
  await a.removeJob(job);
  assert.equal(await a.writeJob({ ...job, state: "failed" }, true), false);
  assert.equal((await h.boot().readJobs(scope)).length, 0);
  assert.ok(![...h.data.keys()].some((k) => k.includes(job.id)));
});
test("retry states are bounded; paused/full storage does not falsely succeed or consume attempts", () => {
  const job: any = { attempts: 0, state: "waiting" };
  assert.equal(domain.retryPhoto(job, "photoStorageFull", 0).attempts, 0);
  assert.equal(domain.retryPhoto(job, "conflict", 0).state, "failed");
  let next = job;
  for (let i = 0; i < 5; i++)
    next = domain.retryPhoto(next, "photoUploadFailed", 0);
  assert.equal(next.state, "failed");
  assert.ok(next.nextAttempt > 0);
});
