import { requireOptionalNativeModule } from "expo-modules-core";

export type Template = { id: string; customerId: string; template: string };
type Hit = { customerId: string; fingerprintId: string; score: number };
export type UsbStatus = {
  hostSupported: boolean;
  devices: {
    vendorId: number;
    productId: number;
    supported: boolean;
    permissionGranted: boolean;
  }[];
};
type Native = {
  apiVersion?: number;
  openDevice(): Promise<void>;
  closeDevice(): Promise<void>;
  getUsbStatus?(): Promise<UsbStatus>;
  loadTemplates(items: Template[]): Promise<void>;
  enroll(): Promise<string>;
  identify(): Promise<Hit | null>;
  addListener(
    event: string,
    listener: (event: {
      step: number;
      status: string;
      customerId: string;
    }) => void,
  ): { remove(): void };
};

const native = requireOptionalNativeModule<Native>("RecordFingerprint");
export const canUseFingerprint = !!native;
const known = [
  "fingerprintAmbiguous",
  "fingerprintBusy",
  "fingerprintInvalid",
  "fingerprintUpdateRequired",
  "readerNotFound",
  "readerNoHost",
  "readerUnsupported",
  "readerPermissionTimeout",
  "readerDenied",
  "readerFailed",
  "readerClosed",
  "fingerprintMismatch",
  "fingerprintExists",
  "fingerprintFailed",
  "fingerprintTimeout",
  "fingerprintNativeRequired",
] as const;

function unwrap(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  const key = known.find((item) => message.includes(item));
  if (__DEV__) console.info("[Fingerprint] Reader operation failed:", key ?? "native error");
  throw new Error(key ?? message);
}

export function onCaptureProgress(listener: (step: number) => void) {
  return native?.addListener("onCaptureProgress", (event) =>
    listener(event.step),
  );
}

export function onReaderStatus(listener: (status: string) => void) {
  return native?.addListener("onDeviceStatus", (event) =>
    listener(event.status),
  );
}
export function onDuplicateFingerprint(listener: (customerId: string) => void) {
  return native?.addListener("onDuplicate", (event) =>
    listener(event.customerId),
  );
}
export async function openReader() {
  if (!native) throw new Error("fingerprintNativeRequired");
  if (native.apiVersion !== 2) throw new Error("fingerprintUpdateRequired");
  try {
    await native.openDevice();
  } catch (error) {
    unwrap(error);
  }
}

export async function closeReader() {
  try {
    await native?.closeDevice();
  } catch {
    // Closing a missing or already closed reader should not block the form.
  }
}

export async function getReaderUsbStatus(): Promise<UsbStatus | null> {
  // Old development builds may not include this diagnostic method yet.
  try {
    return (await native?.getUsbStatus?.()) ?? null;
  } catch {
    return null;
  }
}

export async function loadFingerprintTemplates(items: Template[]) {
  if (!native) throw new Error("fingerprintNativeRequired");
  try {
    await native.loadTemplates(items);
  } catch (error) {
    unwrap(error);
  }
}

export async function enrollFingerprint() {
  if (!native) throw new Error("fingerprintNativeRequired");
  try {
    const template = await native.enroll();
    if (!template.trim()) throw new Error("fingerprintFailed");
    return template;
  } catch (error) {
    unwrap(error);
  }
}

export async function identifyFingerprint() {
  if (!native) throw new Error("fingerprintNativeRequired");
  try {
    return await native.identify();
  } catch (error) {
    unwrap(error);
  }
}

let owner: symbol | null = null;
export function claimReader(): () => Promise<void> {
  if (owner) throw new Error("fingerprintBusy");
  const token = Symbol();
  owner = token;
  let closing: Promise<void> | undefined;
  return () =>
    (closing ??= (async () => {
      if (owner !== token) return;
      try {
        await closeReader();
      } finally {
        if (owner === token) owner = null;
      }
    })());
}
