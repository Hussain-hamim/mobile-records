import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";

function configure(contents: string) {
  const module = { exports: (_config: unknown): unknown => undefined };
  runInNewContext(
    readFileSync(new URL("../plugins/with-local-release.js", import.meta.url), "utf8"),
    {
      module,
      require: () => ({
        withAppBuildGradle: (config: unknown, mod: (c: unknown) => unknown) => mod(config),
      }),
    },
  );
  return (module.exports({ modResults: { contents } }) as { modResults: { contents: string } })
    .modResults.contents;
}

test("production never inherits debug signing and prebuild remains repeatable", () => {
  const original = `buildTypes {
    debug { signingConfig signingConfigs.debug }
    release { signingConfig signingConfigs.debug }
  }`;
  const output = configure(original);
  assert.match(output, /debug \{ signingConfig signingConfigs.debug \}/);
  assert.match(output, /release \{ signingConfig null/);
  assert.equal(configure(output), output);
});

test("an unexpected release signing template requires review", () => {
  assert.throws(() => configure("buildTypes { release {} }"), /Release signing template changed/);
});
