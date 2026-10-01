import * as SecureStore from "expo-secure-store";
import { randomUUID } from "expo-crypto";
import { createChunkStorage } from "./chunk-storage";
export const secureStorage = createChunkStorage(SecureStore, randomUUID);
