import { parseShape } from "../core/serialize.js";
import type { Shape } from "../core/shape.js";

export type StorageLike = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
  readonly length?: number;
  key?: (index: number) => string | null;
};

export const STORAGE_PREFIX = "sniffr:v1:";
export const MAX_STORED_BYTES = 256 * 1024;

export type PersistedModel = {
  readonly method: string;
  readonly route: string;
  readonly observed: Shape;
  readonly request: Shape | null;
  readonly samples: number;
  readonly lastSeen: number;
};

export const storageKey = (schemaHash: string): string => `${STORAGE_PREFIX}${schemaHash}`;

export const defaultStorage = (): StorageLike | null => {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
};

export const load = (
  storage: StorageLike,
  schemaHash: string,
): Readonly<Record<string, PersistedModel>> => {
  let raw: string | null = null;
  try {
    raw = storage.getItem(storageKey(schemaHash));
  } catch {
    return {};
  }
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return {};
  }

  const models = (parsed as { models?: unknown })?.models;
  if (!models || typeof models !== "object") return {};

  const result: Record<string, PersistedModel> = {};
  for (const [key, raw_] of Object.entries(models as Record<string, unknown>)) {
    if (!raw_ || typeof raw_ !== "object") continue;
    const entry = raw_ as Record<string, unknown>;
    const observed = parseShape(entry.observed);
    if (!observed) continue;

    result[key] = {
      method: typeof entry.method === "string" ? entry.method : "GET",
      route: typeof entry.route === "string" ? entry.route : key,
      observed,
      request:
        entry.request === null || entry.request === undefined ? null : parseShape(entry.request),
      samples: typeof entry.samples === "number" ? entry.samples : 0,
      lastSeen: typeof entry.lastSeen === "number" ? entry.lastSeen : 0,
    };
  }
  return result;
};

const dropOtherHashes = (storage: StorageLike, keep: string): void => {
  if (typeof storage.length !== "number" || typeof storage.key !== "function") return;
  const stale: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(STORAGE_PREFIX) && key !== keep) stale.push(key);
  }
  for (const key of stale) storage.removeItem(key);
};

export const save = (
  storage: StorageLike,
  schemaHash: string,
  models: Readonly<Record<string, PersistedModel>>,
): boolean => {
  const key = storageKey(schemaHash);
  const payload = JSON.stringify({ version: 1, schemaHash, savedAt: Date.now(), models });
  if (payload.length > MAX_STORED_BYTES) return false;

  try {
    storage.setItem(key, payload);
    dropOtherHashes(storage, key);
    return true;
  } catch {
    return false;
  }
};

export const clear = (storage: StorageLike, schemaHash: string): void => {
  try {
    storage.removeItem(storageKey(schemaHash));
  } catch {
    /* storage can be unavailable; persistence is best effort */
  }
};
