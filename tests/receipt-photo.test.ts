import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync("src/services/receipt-photo.ts", "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
function harness(fail = false) {
  const calls: string[] = [];
  const image = {
    width: 3000,
    height: 4000,
    release() {
      calls.push("release image");
    },
    async saveAsync(options: { base64: boolean }) {
      assert.equal(options.base64, true);
      if (fail) throw new Error("decode failed");
      return { uri: "file://temporary-export.jpg", base64: "/9j/AA==" };
    },
  };
  const context = {
    async renderAsync() {
      return image;
    },
    resize(size: { height: number }) {
      assert.equal(size.height, 1600);
      calls.push("resize");
    },
    release() {
      calls.push("release context");
    },
  };
  const exports = {} as {
    receiptPhoto(uri: string): Promise<string | undefined>;
  };
  runInNewContext(compiled, {
    exports,
    require(name: string) {
      if (name === "expo-image-manipulator")
        return {
          ImageManipulator: {
            manipulate(uri: string) {
              calls.push(uri);
              return context;
            },
          },
          SaveFormat: { JPEG: "jpeg" },
        };
      if (name === "expo-file-system")
        return {
          File: class {
            exists = true;
            constructor(readonly uri: string) {}
            delete() {
              calls.push("delete " + this.uri);
            }
          },
        };
      throw new Error(name);
    },
  });
  return { ...exports, calls };
}
test("receipt photo scales without cropping and cleans derivatives, never originals", async () => {
  const h = harness();
  assert.equal(
    await h.receiptPhoto("content://selected-folder/original.jpg"),
    "data:image/jpeg;base64,/9j/AA==",
  );
  assert.ok(h.calls.includes("resize"));
  assert.equal(h.calls.filter((x) => x === "release image").length, 2);
  assert.ok(h.calls.includes("release context"));
  assert.deepEqual(
    h.calls.filter((x) => x.startsWith("delete ")),
    ["delete file://temporary-export.jpg"],
  );
});
test("receipt photo releases native resources when encoding fails", async () => {
  const h = harness(true);
  await assert.rejects(
    h.receiptPhoto("file://private-original.jpg"),
    /decode failed/,
  );
  assert.ok(h.calls.includes("release context"));
  assert.equal(h.calls.filter((x) => x === "release image").length, 2);
  assert.ok(!h.calls.some((x) => x.startsWith("delete ")));
});
test("receipt photo never fetches a network URL", async () => {
  const h = harness();
  assert.equal(
    await h.receiptPhoto("https://example.com/photo.jpg"),
    undefined,
  );
  assert.deepEqual(h.calls, []);
});
