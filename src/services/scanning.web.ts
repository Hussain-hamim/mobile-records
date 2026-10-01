export const canRecognize = false;
export async function cleanupScans() {}
export async function keepScan(uri: string) {
  return uri;
}
export async function deleteScans(_uris: string[]) {}
export async function editScan(
  _uri: string,
  _width: number,
  _height: number,
  _action: "rotate" | "crop",
): Promise<{ uri: string; width: number; height: number }> {
  throw new Error("nativeRequired");
}
export async function recognize(
  _uri: string,
  _mode: "id" | "imei",
): Promise<{ text: string; confidence: number }> {
  throw new Error("nativeRequired");
}
