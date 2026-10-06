import { AwsClient } from "npm:aws4fetch@1.0.20";
export interface StoredPhoto {
  id: string;
  shop_id: string;
  record_id: string;
  slot: string;
  state: string;
  bytes: number;
  md5: string;
  preview_bytes: number;
  preview_md5: string;
}
function config() {
  const account = Deno.env.get("R2_ACCOUNT_ID"),
    bucket = Deno.env.get("R2_PHOTO_BUCKET");
  const accessKeyId = Deno.env.get("R2_ACCESS_KEY_ID"),
    secretAccessKey = Deno.env.get("R2_SECRET_ACCESS_KEY");
  if (!account || !bucket || !accessKeyId || !secretAccessKey)
    throw new Error("photoCloudUnavailable");
  if (
    !/^[a-f0-9]{32}$/.test(account) ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/.test(bucket)
  )
    throw new Error("photoCloudUnavailable");
  return {
    base: `https://${account}.r2.cloudflarestorage.com/${bucket}/`,
    aws: new AwsClient({
      accessKeyId,
      secretAccessKey,
      service: "s3",
      region: "auto",
      retries: 2,
    }),
  };
}
export function assertPhotoStorageConfigured() {
  config();
}
export function photoKey(p: StoredPhoto, preview = false) {
  for (const id of [p.shop_id, p.record_id, p.id])
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("photoNotFound");
  return `${p.shop_id}/${p.record_id}/${p.id}/${preview ? "preview" : "photo"}.jpg`;
}
const md5Base64 = (hex: string) =>
  btoa(String.fromCharCode(...hex.match(/../g)!.map((x) => parseInt(x, 16))));
export async function photoUrl(
  p: StoredPhoto,
  method: "PUT" | "GET",
  preview = false,
) {
  const { base, aws } = config();
  const url = new URL(base + photoKey(p, preview));
  url.searchParams.set("X-Amz-Expires", method === "PUT" ? "300" : "60");
  const headers: Record<string, string> =
    method === "PUT"
      ? {
          "Content-Type": "image/jpeg",
          "Content-Length": String(preview ? p.preview_bytes : p.bytes),
          "Content-MD5": md5Base64(preview ? p.preview_md5 : p.md5),
          "If-None-Match": "*",
          "Cache-Control": "private, no-store",
        }
      : {};
  const signed = await aws.sign(url, {
    method,
    headers,
    aws: { signQuery: true, allHeaders: true },
  });
  return { url: signed.url, headers };
}
export async function verifyPhoto(p: StoredPhoto) {
  const { base, aws } = config();
  for (const preview of [false, true]) {
    const response = await aws.fetch(base + photoKey(p, preview), {
      method: "HEAD",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error("photoUploadIncomplete");
    if (
      Number(response.headers.get("content-length")) !==
        (preview ? p.preview_bytes : p.bytes) ||
      response.headers.get("content-type")?.split(";")[0] !== "image/jpeg" ||
      response.headers.get("etag")?.replaceAll('"', "") !==
        (preview ? p.preview_md5 : p.md5)
    )
      throw new Error("photoChecksumFailed");
    // Verify JPEG signature without reading an unbounded response into memory.
    const image = await aws.fetch(base + photoKey(p, preview), {
      headers: { Range: "bytes=0-2" },
      signal: AbortSignal.timeout(10000),
    });
    if (image.status !== 206) {
      await image.body?.cancel();
      throw new Error("photoChecksumFailed");
    }
    const prefix = new Uint8Array(await image.arrayBuffer());
    if (
      prefix.length !== 3 ||
      prefix[0] !== 255 ||
      prefix[1] !== 216 ||
      prefix[2] !== 255
    )
      throw new Error("photoChecksumFailed");
  }
}
export async function deletePhoto(p: StoredPhoto) {
  const { base, aws } = config();
  for (const preview of [false, true]) {
    const response = await aws.fetch(base + photoKey(p, preview), {
      method: "DELETE",
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok && response.status !== 404)
      throw new Error("photoCleanupFailed");
  }
}
