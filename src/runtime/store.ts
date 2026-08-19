import { createStore } from "zustand/vanilla";

import { endpointKey, normalizeRoute } from "../core/route.js";
import type { Change } from "../core/diff.js";
import { fromZod } from "../core/from-zod.js";
import type { Shape } from "../core/shape.js";
import { UNKNOWN } from "../core/shape.js";
import { infer } from "../core/infer.js";
import { merge } from "../core/merge.js";
import { diff } from "../core/diff.js";

export type Capture = {
  readonly method: string;
  readonly url: string;
  readonly status: number;
  readonly body: unknown;
  readonly at: number;
};

export type EndpointModel = {
  readonly key: string;
  readonly method: string;
  readonly route: string;
  readonly expected: Shape | null;
  readonly observed: Shape;
  readonly changes: readonly Change[];
  readonly samples: number;
  readonly lastSeen: number;
};

export type SniffrState = {
  readonly models: Readonly<Record<string, EndpointModel>>;
  readonly schemas: Readonly<Record<string, Shape>>;
  readonly routes: readonly string[];
  readonly record: (capture: Capture) => void;
  readonly registerSchemas: (schemas: Readonly<Record<string, unknown>>) => void;
  readonly setRoutes: (routes: readonly string[]) => void;
  readonly clear: () => void;
};

const schemaKey = (raw: string, routes: readonly string[]): string => {
  const parts = raw.trim().split(/\s+/);
  if (parts.length >= 2) {
    return endpointKey(parts[0] as string, normalizeRoute(parts[1] as string, routes));
  }
  return normalizeRoute(raw, routes);
};

export const sniffrStore = createStore<SniffrState>((set, get) => ({
  models: {},
  schemas: {},
  routes: [],

  record: (capture) => {
    const { models, schemas, routes } = get();
    const route = normalizeRoute(capture.url, routes);
    const key = endpointKey(capture.method, route);
    const previous = models[key];

    const observed = merge(previous?.observed ?? UNKNOWN, infer(capture.body));
    const expected = schemas[key] ?? schemas[route] ?? previous?.expected ?? null;
    const changes = expected ? diff(expected, observed) : [];

    set({
      models: {
        ...models,
        [key]: {
          key,
          method: capture.method.toUpperCase(),
          route,
          expected,
          observed,
          changes,
          samples: (previous?.samples ?? 0) + 1,
          lastSeen: capture.at,
        },
      },
    });
  },

  registerSchemas: (input) => {
    const { schemas, routes } = get();
    const next: Record<string, Shape> = { ...schemas };
    for (const [raw, schema] of Object.entries(input)) {
      next[schemaKey(raw, routes)] = fromZod(schema);
    }
    set({ schemas: next });
  },

  setRoutes: (routes) => set({ routes: [...routes] }),

  clear: () => set({ models: {} }),
}));

export const endpoints = (state: SniffrState): readonly EndpointModel[] =>
  Object.values(state.models).sort((a, b) => b.lastSeen - a.lastSeen);
