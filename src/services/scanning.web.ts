import type { MrzRegion } from "../domain/mrz-capture";
import type { MrzResult } from "../domain/mrz";
import type { Language, Person } from "../domain/models";
export const canRecognize = false;
export const canReadMrz = false;
export const canReadPrintedId = false;
export async function recognizePrintedId(
  _uri: string,
  _language: Language,
): Promise<Partial<Person>> {
  throw new Error("printedIdNativeRequired");
}
export async function cleanupScans() {}
export async function keepScan(uri: string) {
  return uri;
}
export async function deleteScans(_uris: string[]) {}
export async function cropScan(
  _uri: string,
  _width: number,
  _height: number,
  _region: MrzRegion,
  _maxDimension?: number,
): Promise<{ uri: string; width: number; height: number }> {
  throw new Error("nativeRequired");
}
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
  _mode: "imei",
): Promise<{ text: string; confidence: number }> {
  throw new Error("nativeRequired");
}
export async function recognizeMrz(
  _uri: string,
  _region?: MrzRegion,
  _isActive?: () => boolean,
): Promise<MrzResult | null> {
  throw new Error("mrzNativeRequired");
}

export const canReadCard = false;
export async function rectifyCard(
  _uri: string,
  _corners: import("../domain/tazkira").CardCorners,
): Promise<import("../domain/tazkira").ScanPhoto> {
  throw new Error("nativeRequired");
}
export async function recognizeCard(
  _uri: string,
  _language: Language,
  _side: "front" | "back",
  _isActive: () => boolean,
): Promise<import("../domain/tazkira").ScanCandidate[]> {
  throw new Error("nativeRequired");
}
export async function scanUpload(_uri: string): Promise<string> {
  throw new Error("nativeRequired");
}
