import type { StoredPhoto } from "./r2-photos.ts";
import type { adminClient } from "./login-codes.ts";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Called only after admin-accounts has verified platform administrator access. */
export async function readAdminRecords(
  admin: ReturnType<typeof adminClient>,
  body: Record<string, unknown>,
  signPhoto?: (photo: StoredPhoto) => Promise<{ url: string }>,
) {
  if (
    typeof body.shopId !== "string" ||
    !uuid.test(body.shopId) ||
    (body.userId !== undefined &&
      (typeof body.userId !== "string" || !uuid.test(body.userId)))
  )
    return { status: 400, data: { error: "Choose a valid shop and account" } };
  const scoped = (selection: string, count?: "exact") => {
    let query = admin
      .from("records")
      .select(selection, { count })
      .eq("shop_id", body.shopId);
    if (body.userId !== undefined) query = query.eq("created_by", body.userId);
    return query;
  };
  if (body.action === "list-records") {
    const page = body.page ?? 0;
    if (
      !Number.isInteger(page) ||
      Number(page) < 0 ||
      Number(page) > 100000 ||
      (body.direction !== undefined &&
        !["buy", "sell"].includes(String(body.direction)))
    )
      return { status: 400, data: { error: "Invalid record filter" } };
    let query = scoped(
      "id,created_by,reference:snapshot->>reference,direction:snapshot->>direction,occurredAt:snapshot->>occurredAt,customerName:snapshot->customer->>name,brand:snapshot->phone->>brand,model:snapshot->phone->>model,imei:snapshot->phone->>imei1,price:snapshot->>price",
      "exact",
    )
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .range(Number(page) * 20, Number(page) * 20 + 19);
    if (body.direction)
      query = query.eq("snapshot->>direction", body.direction);
    const result = await query;
    if (result.error)
      return { status: 500, data: { error: "Could not load records" } };
    return {
      status: 200,
      data: { records: result.data, total: result.count ?? 0 },
    };
  }
  if (
    !["record-detail", "record-photos"].includes(String(body.action)) ||
    typeof body.recordId !== "string" ||
    !uuid.test(body.recordId)
  )
    return { status: 400, data: { error: "Choose a valid record" } };
  const record = await scoped("snapshot").eq("id", body.recordId).maybeSingle();
  if (record.error)
    return { status: 500, data: { error: "Could not load record" } };
  if (!record.data)
    return {
      status: 404,
      data: { error: "Record not found in this shop/account" },
    };
  if (body.action === "record-photos") {
    const result = await admin
      .from("record_photos")
      .select(
        "id,shop_id,record_id,slot,state,bytes,md5,preview_bytes,preview_md5,completed_at",
      )
      .eq("shop_id", body.shopId)
      .eq("record_id", body.recordId)
      .eq("state", "current")
      .in("slot", ["person", "idFront"])
      .order("slot")
      .limit(2);
    if (result.error || !signPhoto)
      return {
        status: 500,
        data: { error: "Could not load record photos. Please try again." },
      };
    try {
      const photos = await Promise.all(
        result.data.map(async (photo) => ({
          id: photo.id,
          slot: photo.slot,
          uploadedAt: photo.completed_at,
          url: (await signPhoto(photo)).url,
        })),
      );
      return { status: 200, data: { photos } };
    } catch {
      return {
        status: 503,
        data: { error: "Photo storage is unavailable. Please try again." },
      };
    }
  }
  const amendments = [];
  for (let offset = 0; ; offset += 100) {
    const result = await admin
      .from("amendments")
      .select("payload")
      .eq("shop_id", body.shopId)
      .eq("record_id", body.recordId)
      .order("created_at")
      .order("id")
      .range(offset, offset + 99);
    if (result.error)
      return { status: 500, data: { error: "Could not load record history" } };
    amendments.push(...result.data.map((a) => a.payload));
    if (result.data.length < 100) break;
  }
  // No customer templates, photo paths or auth credentials are queried.
  return {
    status: 200,
    data: {
      record: (record.data as unknown as { snapshot: unknown }).snapshot,
      amendments,
    },
  };
}
