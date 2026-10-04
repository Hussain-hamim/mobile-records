import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as domain from "../src/domain/local-photos";

// Exercise the real service with native adapters replaced; no device or user photos.
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../src/services/local-photos.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
const scope = { shopId: "shop", userId: "staff", recordId: "record" };
const source = "file:///library/original.heic";
function harness(platform = "ios") {
  const files = new Map<string, Uint8Array>([
    [source, new Uint8Array([1, 2, 3])],
  ]);
  const manifests = new Map<string, string>();
  const directories = new Map<string, Directory>();
  const paths = {
    document: { uri: "file:///Documents/" },
    cache: { uri: "file:///cache/" },
  };
  const controls = {
    failWrite: false,
    failCommit: false,
    canceled: false,
    permission: true,
    pickError: "",
  };
  let counter = 0;
  class File {
    constructor(public uri: string) {}
    get exists() {
      return files.has(this.uri);
    }
    get size() {
      return files.get(this.uri)?.length ?? 0;
    }
    async bytes() {
      if (!this.exists) throw new Error("missing");
      return files.get(this.uri)!;
    }
    write(bytes: Uint8Array) {
      if (controls.failWrite) throw new Error("full disk");
      files.set(this.uri, bytes);
    }
    delete() {
      files.delete(this.uri);
    }
  }
  const selectedFolder =
    "content://com.android.externalstorage.documents/tree/primary%3APictures/document/primary%3APictures";
  class Directory {
    uri: string;
    constructor(...parts: (string | { uri: string })[]) {
      this.uri = parts
        .map((p) => (typeof p === "string" ? p : p.uri))
        .map((p) => p.replace(/\/$/, ""))
        .join("/");
    }
    create() {}
    static async pickDirectoryAsync() {
      return new Directory(selectedFolder);
    }
    list() {
      return [...directories.values()];
    }
    createDirectory(name: string) {
      const uri = this.uri + "%2F" + name;
      if (directories.has(uri)) throw new Error("folder already exists");
      const directory = new Directory(uri);
      directories.set(uri, directory);
      return directory;
    }
    createFile(name: string) {
      const file = new File(
        this.uri + (this.uri.startsWith("content:") ? "%2F" : "/") + name,
      );
      files.set(file.uri, new Uint8Array());
      return file;
    }
  }
  async function pick() {
    if (controls.pickError) throw new Error(controls.pickError);
    return { canceled: controls.canceled, assets: [{ uri: source }] };
  }
  const adapters: Record<string, unknown> = {
    "expo-file-system": { Directory, File, Paths: paths },
    "expo-crypto": { randomUUID: () => `image-${++counter}` },
    "react-native": { Platform: { OS: platform } },
    "../domain/local-photos": domain,
    "../data/secure": {
      secureStorage: {
        async getItem(key: string) {
          return manifests.get(key) ?? null;
        },
        async setItem(key: string, value: string) {
          if (controls.failCommit) throw new Error("storage full");
          manifests.set(key, value);
        },
        async removeItem(key: string) {
          manifests.delete(key);
        },
      },
    },
    "expo-image-picker": {
      requestCameraPermissionsAsync: async () => ({
        granted: controls.permission,
      }),
      launchCameraAsync: pick,
      launchImageLibraryAsync: pick,
    },
    "expo-image-manipulator": {
      SaveFormat: { JPEG: "jpeg" },
      ImageManipulator: {
        manipulate(uri: string) {
          if (!files.has(uri)) throw new Error("missing source");
          return {
            release() {},
            async renderAsync() {
              return {
                release() {},
                async saveAsync(options: { format: string }) {
                  assert.equal(options.format, "jpeg");
                  const uri = paths.cache.uri + "normalized.jpg";
                  files.set(uri, new Uint8Array([4, 5, 6]));
                  return { uri };
                },
              };
            },
          };
        },
      },
    },
  };
  function reload() {
    const exports = {};
    runInNewContext(compiled, {
      exports,
      require: (name: string) => {
        if (!(name in adapters))
          throw new Error(`Unexpected dependency: ${name}`);
        return adapters[name];
      },
    });
    return exports as typeof import("../src/services/local-photos");
  }
  return { service: reload(), reload, files, manifests, controls, paths };
}
for (const platform of ["ios", "android"]) {
  test(`${platform}: all slots survive service reload, replacement and removal preserve library originals`, async () => {
    const h = harness(platform);
    for (const slot of domain.photoSlots)
      await h.service.saveLocalPhoto(scope, slot, source);
    const before = await h.reload().loadLocalPhotos(scope);
    assert.equal(Object.keys(before.photos).length, 2);
    for (const uri of Object.values(before.photos)) assert.ok(h.files.has(uri));
    const after = await h.service.saveLocalPhoto(scope, "person", source);
    assert.notEqual(after.photos.person, before.photos.person);
    assert.equal(h.files.has(before.photos.person!), false);
    assert.ok(h.files.has(source));
    const removed = await h.service.removeLocalPhoto(scope, "idFront");
    assert.equal(removed.photos.idFront, undefined);
    assert.equal(h.files.has(after.photos.idFront!), false);
    assert.ok(h.files.has(source));
    assert.equal(
      [...h.files.keys()].some((uri) => uri.startsWith("file:///cache/")),
      false,
    );
    const other = await h.service.loadLocalPhotos({
      ...scope,
      userId: "another",
    });
    assert.equal(Object.keys(other.photos).length, 0);
  });
}
test("failed replacement writes and manifest commits retain the previous photo and discard incomplete copies", async () => {
  const h = harness();
  const first = await h.service.saveLocalPhoto(scope, "person", source);
  for (const failure of ["failWrite", "failCommit"] as const) {
    h.controls[failure] = true;
    await assert.rejects(
      h.service.saveLocalPhoto(scope, "person", source),
      /photoSaveFailed/,
    );
    h.controls[failure] = false;
    assert.equal(
      (await h.reload().loadLocalPhotos(scope)).photos.person,
      first.photos.person,
    );
    assert.equal(h.files.size, 2); // original and last committed copy only
    assert.ok(h.files.has(first.photos.person!));
  }
  h.controls.failCommit = true;
  await assert.rejects(
    h.service.removeLocalPhoto(scope, "person"),
    /photoRemoveFailed/,
  );
  assert.ok(h.files.has(first.photos.person!));
});
test("Android selected-folder references survive reload and are retained after resetting the default", async () => {
  const h = harness("android");
  await h.service.choosePhotoFolder(scope);
  const first = await h.service.saveLocalPhoto(scope, "person", source);
  assert.match(first.photos.person!, /^content:/);
  await h.service.resetPhotoFolder(scope);
  const second = await h.reload().saveLocalPhoto(scope, "idFront", source);
  assert.equal(second.folder, first.folder);
  assert.match(second.photos.idFront!, /^content:/);
  const next = await h.service.saveLocalPhoto(
    { ...scope, recordId: "next" },
    "person",
    source,
  );
  assert.match(next.photos.person!, /^file:/);
});
test("iPhone has no folder picker and cancellation/permissions produce actionable outcomes", async () => {
  const h = harness();
  assert.equal(h.service.localPhotosSupported, true);
  assert.equal(h.service.photoFolderSelectionSupported, false);
  await assert.rejects(
    h.service.choosePhotoFolder(scope),
    /photoFolderUnsupported/,
  );
  h.controls.canceled = true;
  assert.equal(await h.service.pickRecordPhoto("library"), null);
  h.controls.canceled = false;
  h.controls.permission = false;
  await assert.rejects(
    h.service.pickRecordPhoto("camera"),
    /photoCameraPermission/,
  );
  // Library selection doesn't depend on camera or full-library permission.
  assert.equal(await h.service.pickRecordPhoto("library"), source);
  h.controls.pickError = "photo library restricted";
  await assert.rejects(
    h.service.pickRecordPhoto("library"),
    /photoLibraryPermission/,
  );
});
test("missing photo files do not prevent replacing or removing an attachment", async () => {
  const h = harness();
  const first = await h.service.saveLocalPhoto(scope, "person", source);
  h.files.delete(first.photos.person!);
  const next = await h.service.saveLocalPhoto(scope, "person", source);
  assert.ok(h.files.has(next.photos.person!));
  h.files.delete(next.photos.person!);
  const removed = await h.service.removeLocalPhoto(scope, "person");
  assert.equal(removed.photos.person, undefined);
});

test("Android retries a failed first save without creating a duplicate selected-folder directory", async () => {
  const h = harness("android");
  await h.service.choosePhotoFolder(scope);
  h.controls.failWrite = true;
  await assert.rejects(
    h.service.saveLocalPhoto(scope, "person", source),
    /photoSaveFailed/,
  );
  h.controls.failWrite = false;
  const next = await h.service.saveLocalPhoto(scope, "person", source);
  assert.match(next.photos.person!, /^content:/);
  assert.ok(h.files.has(next.photos.person!));
});

test("saved-photo adjustments preserve the source and replacement history survives reload", async () => {
  const h = harness();
  const first = await h.service.saveLocalPhoto(scope,"person",source);
  const original = first.photos.person!;
  const edited = "file:///cache/edited.jpg";
  h.files.set(edited,new Uint8Array([7,8,9]));
  let authorized = 0;
  const adjusted = await h.service.saveLocalPhoto(scope,"person",edited,{sourceUri:original,preserveHistory:true,beforeCommit:async()=>{authorized++;}});
  assert.equal(authorized,1);
  assert.equal(adjusted.sources?.person,original);
  assert.ok(h.files.has(original));
  const replaced=await h.service.saveLocalPhoto(scope,"person",source,{preserveHistory:true,beforeCommit:async()=>{authorized++;}});
  assert.ok(replaced.history?.some(h=>h.uri===original));
  assert.ok(h.files.has(original));
  assert.equal((await h.reload().loadLocalPhotos(scope)).history?.length,2);
  const removed=await h.service.removeLocalPhoto(scope,"person",{preserveHistory:true,beforeCommit:async()=>{authorized++;}});
  assert.equal(removed.photos.person,undefined);
  assert.equal(removed.history?.length,3);
  assert.equal(authorized,3);
});

test("denied photo authorization preserves existing attachment and removes staged files",async()=>{
  const h=harness();
  const first=await h.service.saveLocalPhoto(scope,"person",source);
  const before=[...h.files.keys()].sort();
  await assert.rejects(h.service.saveLocalPhoto(scope,"person",source,{preserveHistory:true,beforeCommit:async()=>{throw new Error("noAccess");}}));
  assert.equal((await h.reload().loadLocalPhotos(scope)).photos.person,first.photos.person);
  assert.deepEqual([...h.files.keys()].sort(),before);
  await assert.rejects(h.service.removeLocalPhoto(scope,"person",{preserveHistory:true,beforeCommit:async()=>{throw new Error("noAccess");}}));
  assert.ok(h.files.has(first.photos.person!));
});

test("expired superseded files are cleaned up without deleting the current source",async()=>{
  const h=harness();
  const first=await h.service.saveLocalPhoto(scope,"person",source);
  const second=await h.service.saveLocalPhoto(scope,"person",source,{preserveHistory:true});
  const key=[...h.manifests.keys()].find(k=>k.startsWith("record-photos."))!;
  const old=JSON.parse(h.manifests.get(key)!);
  old.history[0].removedAt="2000-01-01T00:00:00.000Z";
  h.manifests.set(key,JSON.stringify(old));
  const current=await h.reload().loadLocalPhotos(scope);
  assert.equal(current.history?.length,0);
  assert.equal(h.files.has(first.photos.person!),false);
  assert.ok(h.files.has(second.photos.person!));
});
