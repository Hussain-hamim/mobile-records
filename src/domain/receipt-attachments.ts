import type { LocalPhotoSet, PhotoScope, PhotoSlot } from "./local-photos";
import type { Transaction } from "./models";

export type ReceiptContext = {
  shopId: string;
  userId: string;
  fingerprintEnrolled?: boolean;
};

export type ReceiptAttachments = {
  person?: string;
  idFront?: string;
  fingerprintEnrolled?: boolean;
};

// Only embedded JPEGs may enter the document: never remote URLs or local paths.
export function receiptImage(value?: string): string | undefined {
  return value && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
    ? value
    : undefined;
}

export async function loadReceiptAttachments(
  record: Pick<Transaction, "id" | "shopId">,
  context: ReceiptContext,
  load: (scope: PhotoScope) => Promise<LocalPhotoSet>,
  read: (uri: string) => Promise<string | undefined>,
): Promise<ReceiptAttachments> {
  if (!context.userId || context.shopId !== record.shopId)
    throw new Error("Receipt photo scope does not match the active shop.");
  const result: ReceiptAttachments = {
    fingerprintEnrolled: context.fingerprintEnrolled,
  };
  let set: LocalPhotoSet;
  try {
    set = await load({
      shopId: context.shopId,
      userId: context.userId,
      recordId: record.id,
    });
  } catch {
    return result;
  }
  // Sequential decoding bounds memory usage on Android.
  for (const slot of ["person", "idFront"] as PhotoSlot[]) {
    const uri = set.photos[slot];
    if (!uri) continue;
    try {
      result[slot] = receiptImage(await read(uri));
    } catch {
      // A removed file or revoked folder permission must not block the receipt.
    }
  }
  return result;
}
