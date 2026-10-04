import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { normalizePhone } from "../src/domain/validation";

// Execute the actual controller action with no OS authentication available.
const source = ts.createSourceFile(
  "app-context.tsx",
  readFileSync(new URL("../src/state/app-context.tsx", import.meta.url), "utf8"),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let action = "";
function visit(node: ts.Node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === "signIn")
    action = node.getText(source);
  ts.forEachChild(node, visit);
}
visit(source);
assert.ok(action, "Sign-in action must exist");
const executable = ts.transpileModule(action, {
  compilerOptions: { target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(rejectedCode = false, deniedMembership = false) {
  const calls: string[] = [];
  const signIn = runInNewContext(executable + "\nsignIn", {
    normalizePhone,
    backend: { auth: { getSession: async () => ({ data: { session: null } }) } },
    LocalAuthentication: {
      getEnrolledLevelAsync: async () => {
        assert.fail("Sign-in must not inspect the device lock");
      },
      SecurityLevel: { NONE: 0 },
    },
    redeemLoginCode: async (phone: string, code: string) => {
      calls.push("redeem");
      assert.equal(phone, "+93700123456");
      assert.equal(code, "12345678");
      if (rejectedCode) throw new Error("invalidLoginCode");
    },
    fetchMembership: async () => {
      calls.push("membership");
      if (deniedMembership) throw new Error("noAccess");
    },
  }) as (phone: string, code: string) => Promise<void>;
  return { calls, signIn: () => signIn("+93 700 123 456", "12345678") };
}

test("a new device can sign in without a PIN, password or enrolled biometric", async () => {
  const h = harness();
  await h.signIn();
  assert.deepEqual(h.calls, ["redeem", "membership"]);
});

test("sign-in still rejects invalid codes and denied shop membership", async () => {
  const invalid = harness(true);
  await assert.rejects(invalid.signIn(), /invalidLoginCode/);
  assert.deepEqual(invalid.calls, ["redeem"]);
  const denied = harness(false, true);
  await assert.rejects(denied.signIn(), /noAccess/);
  assert.deepEqual(denied.calls, ["redeem", "membership"]);
});
