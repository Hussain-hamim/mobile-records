import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const compiled = ts.transpileModule(
  readFileSync(
    new URL("../src/services/enrollment-sound.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;

function harness(nativeAvailable = true) {
  let status = (_state: { didJustFinish?: boolean; error?: string }) => {};
  let background = (_state: string) => {};
  let expire = () => {};
  const state = {
    plays: 0,
    releases: 0,
    loads: 0,
    fail: false,
    listeners: 0,
    sources: [] as string[],
    audioMode: {} as Record<string, unknown>,
  };
  const appState = {
    currentState: "active",
    addEventListener(_event: string, callback: typeof background) {
      background = callback;
      state.listeners++;
      return {
        remove() {
          state.listeners--;
        },
      };
    },
  };
  const player = {
    addListener(_event: string, callback: typeof status) {
      status = callback;
      state.listeners++;
      return {
        remove() {
          state.listeners--;
        },
      };
    },
    play() {
      if (state.fail) throw new Error("audio unavailable");
      state.plays++;
    },
    remove() {
      state.releases++;
    },
  };
  const exports = {} as {
    playEnrollmentSuccess(): Promise<void>;
    playFingerprintSound(
      kind: "enrolled" | "matched" | "rejected",
    ): Promise<void>;
    stopFingerprintSound(): void;
  };
  runInNewContext(compiled, {
    exports,
    setTimeout(callback: () => void) {
      expire = callback;
      return 1;
    },
    clearTimeout() {},
    require(name: string) {
      if (name === "expo")
        return {
          requireOptionalNativeModule: () => (nativeAvailable ? {} : null),
        };
      if (name === "react-native")
        return { AppState: appState, Platform: { OS: "android" } };
      if (name.endsWith(".mp3")) return name;
      if (name === "expo-audio") {
        state.loads++;
        return {
          createAudioPlayer: (source: string) => {
            state.sources.push(source);
            return player;
          },
          setAudioModeAsync: async (mode: Record<string, unknown>) => {
            state.audioMode = mode;
          },
        };
      }
      throw new Error(name);
    },
  });
  return {
    state,
    appState,
    play: exports.playEnrollmentSuccess,
    feedback: exports.playFingerprintSound,
    stop: exports.stopFingerprintSound,
    finish: () => status({ didJustFinish: true }),
    background: () => background("background"),
    expire: () => expire(),
  };
}

test("success chime does not overlap and releases its player after finishing", async () => {
  const h = harness();
  await Promise.all([h.play(), h.play()]);
  assert.equal(h.state.plays, 1);
  h.finish();
  assert.equal(h.state.releases, 1);
  assert.equal(h.state.listeners, 0);
  await h.play();
  assert.equal(h.state.plays, 2);
  h.finish();
});

test("old APKs and backgrounded apps skip the audio module", async () => {
  const old = harness(false);
  await old.play();
  assert.equal(old.state.loads, 0);
  const h = harness();
  h.appState.currentState = "background";
  await h.play();
  assert.equal(h.state.loads, 0);
});

test("scan feedback allows silent-mode playback without earpiece routing or background audio", async () => {
  const h = harness();
  await h.feedback("matched");
  assert.equal(h.state.audioMode.playsInSilentMode, true);
  assert.equal(h.state.audioMode.shouldRouteThroughEarpiece, false);
  assert.equal(h.state.audioMode.shouldPlayInBackground, false);
  h.finish();
});

test("backgrounding and playback timeout release audio exactly once", async () => {
  const h = harness();
  await h.play();
  h.background();
  h.expire();
  assert.equal(h.state.releases, 1);
  assert.equal(h.state.listeners, 0);
  await h.play();
  h.expire();
  assert.equal(h.state.releases, 2);
});

test("audio failures never reject an enrollment and permit a later chime", async () => {
  const h = harness();
  h.state.fail = true;
  await assert.doesNotReject(h.play());
  assert.equal(h.state.releases, 1);
  assert.equal(h.state.listeners, 0);
  h.state.fail = false;
  await h.play();
  assert.equal(h.state.plays, 1);
  h.finish();
});

test("each fingerprint outcome uses the supplied local MP3, and a match interrupts a rejection", async () => {
  const h = harness();
  await h.feedback("rejected");
  await h.feedback("matched");
  assert.equal(h.state.releases, 1);
  h.finish();
  await h.play();
  assert.deepEqual(
    h.state.sources.map((s) => s.split("/").at(-1)),
    ["wrongfinger.mp3", "fingerSuccess.mp3", "registerSuccessTone.mp3"],
  );
  h.finish();
  assert.equal(h.state.listeners, 0);
});

test("closing a scanner cancels pending audio loading as well as an active sound", async () => {
  const h = harness();
  const pending = h.feedback("rejected");
  h.stop();
  await pending;
  assert.equal(h.state.plays, 0);
  assert.equal(h.state.listeners, 0);
  await h.feedback("rejected");
  h.stop();
  assert.equal(h.state.releases, 1);
  assert.equal(h.state.listeners, 0);
});
