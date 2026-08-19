import type { StorageLike } from "./runtime/persist.js";
import { defaultStorage } from "./runtime/persist.js";
import { intercept } from "./runtime/intercept.js";
import { sniffrStore } from "./runtime/store.js";
import { mountOverlay } from "./ui/overlay.js";

export type SniffrOptions = {
  readonly persist?: boolean | StorageLike;
  readonly schemas?: Readonly<Record<string, unknown>>;
  readonly routes?: readonly string[];
  readonly overlay?: boolean;
  readonly target?: Element;
  readonly maxBodyBytes?: number;
};

export type SniffrHandle = {
  readonly stop: () => void;
};

const NOOP: SniffrHandle = { stop: () => {} };

export const sniffr = (options: SniffrOptions = {}): SniffrHandle => {
  if (typeof window === "undefined") return NOOP;

  const { setRoutes, registerSchemas } = sniffrStore.getState();
  if (options.routes) setRoutes(options.routes);
  if (options.schemas) registerSchemas(options.schemas);

  // after registerSchemas: the storage key is derived from the schemas, so
  // hydrating earlier would read under the wrong hash
  if (options.persist) {
    const storage = options.persist === true ? defaultStorage() : options.persist;
    if (storage) sniffrStore.getState().persistTo(storage);
  }

  const stopIntercept = intercept({
    onCapture: (capture) => sniffrStore.getState().record(capture),
    maxBodyBytes: options.maxBodyBytes,
  });

  const overlay = options.overlay === false ? null : mountOverlay(options.target);

  return {
    stop: () => {
      stopIntercept();
      overlay?.unmount();
    },
  };
};

export { canonical, hash, hashSchemas, hashShape, parseShape } from "./core/serialize.js";
export type { Field, LiteralValue, PrimitiveType, Shape } from "./core/shape.js";
export type { CaptureHandler, InterceptOptions } from "./runtime/intercept.js";
export type { Capture, EndpointModel, SniffrState } from "./runtime/store.js";
export type { PersistedModel, StorageLike } from "./runtime/persist.js";
export { intercept, MAX_BODY_BYTES } from "./runtime/intercept.js";
export type { Change, ChangeCode, Severity } from "./core/diff.js";
export { fromZod, isOptionalSchema } from "./core/from-zod.js";
export { ENUM_CARDINALITY_CAP, merge } from "./core/merge.js";
export { assignable, diff, isBreaking } from "./core/diff.js";
export { endpointKey, normalizeRoute } from "./core/route.js";
export { endpoints, sniffrStore } from "./runtime/store.js";
export type { OverlayHandle } from "./ui/overlay.js";
export { mountOverlay } from "./ui/overlay.js";
export { infer } from "./core/infer.js";
export {
  clear as clearPersisted,
  defaultStorage,
  MAX_STORED_BYTES,
  STORAGE_PREFIX,
  storageKey,
} from "./runtime/persist.js";
export {
  array,
  equals,
  field,
  literal,
  object,
  primitive,
  render,
  union,
  widenLiterals,
} from "./core/shape.js";
