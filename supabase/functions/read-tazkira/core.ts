export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_BYTES = 6 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type Dependencies = {
  enabled: boolean;
  authenticate: (token: string, shopId: string) => Promise<string | null>;
  reserve: (
    requestId: string,
    userId: string,
    shopId: string,
  ) => Promise<string>;
  recognize: (
    image: string,
    language: string,
    signal: AbortSignal,
  ) => Promise<unknown>;
  timeoutMs?: number;
};
const headers = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json",
};
const failure = (error: string, status: number) =>
  Response.json({ error }, { status, headers });
async function readBody(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_BYTES)
    throw Error("scanTooLarge");
  const reader = request.body?.getReader();
  if (!reader) throw Error("invalidScan");
  let size = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw Error("scanTooLarge");
      }
      text += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(text + decoder.decode()) as Record<string, unknown>;
}
export function validImage(image: unknown): image is string {
  if (
    typeof image !== "string" ||
    image.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(image) ||
    image.length % 4
  )
    return false;
  try {
    const bytes = atob(image);
    return (
      bytes.length <= MAX_IMAGE_BYTES &&
      bytes.length >= 4 &&
      bytes.charCodeAt(0) === 255 &&
      bytes.charCodeAt(1) === 216 &&
      bytes.charCodeAt(2) === 255 &&
      bytes.charCodeAt(bytes.length - 2) === 255 &&
      bytes.charCodeAt(bytes.length - 1) === 217
    );
  } catch {
    return false;
  }
}
export function createHandler(deps: Dependencies) {
  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") return failure("invalidScan", 405);
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    if (!token) return failure("noAccess", 401);
    try {
      const body = await readBody(request);
      if (typeof body.shopId !== "string" || !uuid.test(body.shopId))
        return failure("invalidScan", 400);
      const userId = await deps.authenticate(token, body.shopId);
      if (!userId) return failure("noAccess", 403);
      if (body.action === "status")
        return Response.json({ enabled: deps.enabled }, { headers });
      if (!deps.enabled) return failure("onlineNotConfigured", 503);
      if (
        body.action !== "read" ||
        body.mode !== "mrz" ||
        typeof body.requestId !== "string" ||
        !uuid.test(body.requestId) ||
        !["en", "ps", "fa"].includes(String(body.language))
      )
        return failure("invalidScan", 400);
      if (
        typeof body.image === "string" &&
        body.image.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4
      )
        return failure("scanTooLarge", 413);
      if (!validImage(body.image)) return failure("invalidScan", 400);
      if (request.signal.aborted) return failure("scanCancelled", 499);
      const reserved = await deps.reserve(body.requestId, userId, body.shopId);
      if (reserved !== "ok")
        return failure(
          reserved,
          reserved === "duplicateScan"
            ? 409
            : reserved === "noAccess"
              ? 403
              : 429,
        );
      const controller = new AbortController();
      const cancel = () => controller.abort();
      request.signal.addEventListener("abort", cancel, { once: true });
      const timer = setTimeout(cancel, deps.timeoutMs ?? 20000);
      try {
        if (request.signal.aborted) controller.abort();
        const document = await deps.recognize(
          body.image,
          String(body.language),
          controller.signal,
        );
        return Response.json({ document }, { headers });
      } catch {
        return failure(
          controller.signal.aborted ? "onlineTimedOut" : "onlineReadFailed",
          controller.signal.aborted ? 504 : 502,
        );
      } finally {
        clearTimeout(timer);
        request.signal.removeEventListener("abort", cancel);
      }
    } catch (error) {
      return failure(
        error instanceof Error && error.message === "scanTooLarge"
          ? "scanTooLarge"
          : "onlineReadFailed",
        error instanceof Error && error.message === "scanTooLarge" ? 413 : 400,
      );
    }
  };
}
type Vertex = { x?: number; y?: number };
type SymbolText = {
  text?: string;
  property?: { detectedBreak?: { type?: string } };
};
type VisionWord = {
  symbols?: SymbolText[];
  confidence?: number;
  boundingBox?: { vertices?: Vertex[] };
};
type VisionResponse = {
  responses?: {
    error?: unknown;
    fullTextAnnotation?: {
      text?: string;
      pages?: {
        width?: number;
        height?: number;
        blocks?: { paragraphs?: { words?: VisionWord[] }[] }[];
      }[];
    };
  }[];
};
export function normalizeVision(payload: unknown) {
  const response = (payload as VisionResponse)?.responses?.[0];
  if (!response || response.error) throw Error("onlineReadFailed");
  const page = response.fullTextAnnotation?.pages?.[0];
  const words: {
    text: string;
    confidence: number;
    box: number[];
    line: number;
  }[] = [];
  let line = 0;
  for (const block of page?.blocks ?? [])
    for (const paragraph of block.paragraphs ?? []) {
      line++;
      for (const word of paragraph.words ?? []) {
        const vertices = word.boundingBox?.vertices ?? [];
        if (vertices.length !== 4) continue;
        words.push({
          text: (word.symbols ?? []).map((s) => s.text ?? "").join(""),
          confidence: Math.max(0, Math.min(100, (word.confidence ?? 0) * 100)),
          box: [
            Math.min(...vertices.map((v) => v.x ?? 0)),
            Math.min(...vertices.map((v) => v.y ?? 0)),
            Math.max(...vertices.map((v) => v.x ?? 0)),
            Math.max(...vertices.map((v) => v.y ?? 0)),
          ],
          line,
        });
        if (
          ["EOL_SURE_SPACE", "LINE_BREAK"].includes(
            word.symbols?.at(-1)?.property?.detectedBreak?.type ?? "",
          )
        )
          line++;
      }
    }
  return {
    text: response.fullTextAnnotation?.text ?? "",
    words,
    width: page?.width ?? 1,
    height: page?.height ?? 1,
  };
}
