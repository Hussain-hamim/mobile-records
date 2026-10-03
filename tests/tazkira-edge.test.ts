import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createHandler,
  MAX_IMAGE_BYTES,
  normalizeVision,
  type Dependencies,
} from "../supabase/functions/read-tazkira/core";
const shopId = "10000000-0000-4000-8000-000000000001";
const requestId = "20000000-0000-4000-8000-000000000001";
const image = Buffer.from([255, 216, 255, 224, 0, 255, 217]).toString("base64");
const body = {
  action: "read",
  mode: "mrz",
  shopId,
  requestId,
  image,
  language: "ps",
};
function request(overrides = {}, token = true, signal?: AbortSignal) {
  return new Request("https://example.test", {
    method: "POST",
    headers: token ? { authorization: "Bearer token" } : {},
    body: JSON.stringify({ ...body, ...overrides }),
    signal,
  });
}
function setup(overrides: Partial<Dependencies> = {}) {
  let reservations = 0,
    calls = 0;
  const handler = createHandler({
    enabled: true,
    authenticate: async () => shopId,
    reserve: async () => {
      reservations++;
      return "ok";
    },
    recognize: async () => {
      calls++;
      return { text: "", words: [], width: 1, height: 1 };
    },
    ...overrides,
  });
  return { handler, counts: () => ({ reservations, calls }) };
}
test("unauthenticated and unauthorized requests never reach OCR or quotas", async () => {
  const a = setup();
  assert.equal((await a.handler(request({}, false))).status, 401);
  assert.deepEqual(a.counts(), { reservations: 0, calls: 0 });
  const b = setup({ authenticate: async () => null });
  assert.equal((await b.handler(request())).status, 403);
  assert.equal(b.counts().calls, 0);
});
test("unconfigured backend and status requests never upload or reserve", async () => {
  const a = setup({ enabled: false });
  assert.deepEqual(
    await (await a.handler(request({ action: "status" }))).json(),
    { enabled: false },
  );
  assert.equal((await a.handler(request())).status, 503);
  assert.deepEqual(a.counts(), { reservations: 0, calls: 0 });
});
test("malformed and oversized images are rejected before reservation", async () => {
  const a = setup();
  assert.equal(
    (await a.handler(request({ image: "file:///secret" }))).status,
    400,
  );
  assert.equal(
    (
      await a.handler(
        request({
          image: Buffer.alloc(MAX_IMAGE_BYTES + 4).toString("base64"),
        }),
      )
    ).status,
    413,
  );
  assert.equal(
    (await a.handler(request({ image: "a".repeat(7 * 1024 * 1024) }))).status,
    413,
  );
  assert.deepEqual(a.counts(), { reservations: 0, calls: 0 });
});
test("quota, rate limit and duplicate requests are not sent to Google", async () => {
  for (const [error, status] of [
    ["onlineQuotaReached", 429],
    ["onlineRateLimited", 429],
    ["duplicateScan", 409],
  ] as const) {
    const a = setup({ reserve: async () => error });
    assert.equal((await a.handler(request())).status, status);
    assert.equal(a.counts().calls, 0);
  }
});
test("success reserves exactly once; provider failure never retries", async () => {
  const a = setup();
  assert.equal((await a.handler(request())).status, 200);
  assert.deepEqual(a.counts(), { reservations: 1, calls: 1 });
  let calls = 0;
  const b = setup({
    recognize: async () => {
      calls++;
      throw Error("private provider error");
    },
  });
  const response = await b.handler(request());
  assert.equal(response.status, 502);
  assert.equal(calls, 1);
  assert.deepEqual(await response.json(), { error: "onlineReadFailed" });
});
test("timeout and cancellation abort the provider operation", async () => {
  const recognize: Dependencies["recognize"] = async (
    _image,
    _language,
    signal,
  ) =>
    new Promise((_resolve, reject) => {
      if (signal.aborted) reject(Error("aborted"));
      else
        signal.addEventListener("abort", () => reject(Error("aborted")), {
          once: true,
        });
    });
  const a = setup({ recognize, timeoutMs: 5 });
  assert.equal((await a.handler(request())).status, 504);
  const controller = new AbortController();
  controller.abort();
  const b = setup();
  assert.equal(
    (await b.handler(request({}, true, controller.signal))).status,
    499,
  );
  assert.equal(b.counts().calls, 0);
});
test("Vision geometry and word confidence are normalized without persisting provider payloads", () => {
  const output = normalizeVision({
    responses: [
      {
        fullTextAnnotation: {
          text: "TEST\n",
          pages: [
            {
              width: 100,
              height: 80,
              blocks: [
                {
                  paragraphs: [
                    {
                      words: [
                        {
                          confidence: 0.9,
                          boundingBox: {
                            vertices: [
                              {},
                              { x: 40 },
                              { x: 40, y: 20 },
                              { y: 20 },
                            ],
                          },
                          symbols: [
                            {
                              text: "TEST",
                              property: {
                                detectedBreak: { type: "LINE_BREAK" },
                              },
                            },
                          ],
                        },
                      ],
                    },
                  ],
                },
              ],
            },
          ],
        },
      },
    ],
  });
  assert.deepEqual(output.words[0], {
    text: "TEST",
    confidence: 90,
    box: [0, 0, 40, 20],
    line: 1,
  });
  assert.equal(output.width, 100);
  assert.throws(
    () => normalizeVision({ responses: [{ error: { message: "secret" } }] }),
    /onlineReadFailed/,
  );
});

test("online endpoint rejects full-card reading requests", async () => {
  const a = setup();
  assert.equal((await a.handler(request({ mode: "printed" }))).status, 400);
  assert.equal(a.counts().calls, 0);
});
