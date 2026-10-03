export type { UsbStatus, Template } from "./fingerprint";
export const canUseFingerprint = false;
export function onCaptureProgress(_listener: (step: number) => void) {
  return undefined;
}
export async function openReader() {
  throw new Error("fingerprintNativeRequired");
}
export async function closeReader() {}
export async function getReaderUsbStatus() {
  return null;
}
export async function loadFingerprintTemplates(
  _items: { id: string; template: string }[],
) {
  throw new Error("fingerprintNativeRequired");
}
export async function enrollFingerprint() {
  throw new Error("fingerprintNativeRequired");
}
export async function identifyFingerprint() {
  throw new Error("fingerprintNativeRequired");
}

export function onReaderStatus(_listener: (status: string) => void) {
  return undefined;
}
export function onDuplicateFingerprint(
  _listener: (customerId: string) => void,
) {
  return undefined;
}

export function claimReader() {
  return async () => {};
}
