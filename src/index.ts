import { intercept } from "./runtime/intercept.js";
import { sniffrStore } from "./runtime/store.js";
import { mountOverlay } from "./ui/overlay.js";

export type SniffrOptions = {
  readonly schemas?: Readonly<Record<string, unknown>>;
  readonly routes?: readonly string[];
  readonly overlay?: boolean;
  readonly target?: Element;
  readonly maxBodyBytes?: number;
};

export type SniffrHandle = {
  readonly stop: () => void;
};

export const sniffr = (options: SniffrOptions = {}): SniffrHandle => {
  const { setRoutes, registerSchemas } = sniffrStore.getState();
  if (options.routes) setRoutes(options.routes);
  if (options.schemas) registerSchemas(options.schemas);

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

export { mountOverlay } from "./ui/overlay.js";
export type { OverlayHandle } from "./ui/overlay.js";

export { endpoints, sniffrStore } from "./runtime/store.js";
export type { Capture, EndpointModel, SniffrState } from "./runtime/store.js";

export { intercept, MAX_BODY_BYTES } from "./runtime/intercept.js";
export type { CaptureHandler, InterceptOptions } from "./runtime/intercept.js";

export { assignable, diff, isBreaking } from "./core/diff.js";
export type { Change, ChangeCode, Severity } from "./core/diff.js";

export { fromZod, isOptionalSchema } from "./core/from-zod.js";
export { infer } from "./core/infer.js";
export { ENUM_CARDINALITY_CAP, merge } from "./core/merge.js";
export { endpointKey, normalizeRoute } from "./core/route.js";

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
export type { Field, LiteralValue, PrimitiveType, Shape } from "./core/shape.js";
