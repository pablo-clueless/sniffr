import { createStore } from "zustand/vanilla";

import { endpointKey, normalizeRoute } from "../core/route.js";
import type { Change } from "../core/diff.js";
import { fromZod } from "../core/from-zod.js";
import type { Shape } from "../core/shape.js";
import { UNKNOWN } from "../core/shape.js";
import { infer } from "../core/infer.js";
import { merge } from "../core/merge.js";
import { diff } from "../core/diff.js";
import { hashSchemas } from "../core/serialize.js";
import { load, save } from "./persist.js";
import type { PersistedModel, StorageLike } from "./persist.js";

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
  readonly storage: StorageLike | null;
  readonly schemaHash: string;
  readonly record: (capture: Capture) => void;
  readonly registerSchemas: (schemas: Readonly<Record<string, unknown>>) => void;
  readonly setRoutes: (routes: readonly string[]) => void;
  readonly persistTo: (storage: StorageLike) => void;
  readonly clear: () => void;
};

const persistable = (
  models: Readonly<Record<string, EndpointModel>>,
): Record<string, PersistedModel> => {
  const out: Record<string, PersistedModel> = {};
  for (const [key, model] of Object.entries(models)) {
    out[key] = {
      method: model.method,
      route: model.route,
      observed: model.observed,
      samples: model.samples,
      lastSeen: model.lastSeen,
    };
  }
  return out;
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
  storage: null,
  schemaHash: hashSchemas({}),

  record: (capture) => {
    const { models, schemas, routes } = get();
    const route = normalizeRoute(capture.url, routes);
    const key = endpointKey(capture.method, route);
    const previous = models[key];

    const seen = previous?.observed ?? UNKNOWN;
    const observed = merge(seen, infer(capture.body));
    const expected = schemas[key] ?? schemas[route] ?? previous?.expected ?? null;

    const settled = previous !== undefined && observed === seen && expected === previous.expected;
    const changes = settled ? previous.changes : expected ? diff(expected, observed) : [];

    const next = {
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
    };

    set({ models: next });

    const { storage, schemaHash } = get();
    if (storage && !settled) save(storage, schemaHash, persistable(next));
  },

  registerSchemas: (input) => {
    const { schemas, routes } = get();
    const next: Record<string, Shape> = { ...schemas };
    for (const [raw, schema] of Object.entries(input)) {
      next[schemaKey(raw, routes)] = fromZod(schema);
    }
    set({ schemas: next, schemaHash: hashSchemas(next) });
  },

  persistTo: (storage) => {
    const { models, schemas, schemaHash } = get();
    const stored = load(storage, schemaHash);
    const hydrated: Record<string, EndpointModel> = { ...models };

    for (const [key, entry] of Object.entries(stored)) {
      const current = hydrated[key];
      const observed = current ? merge(current.observed, entry.observed) : entry.observed;
      const expected = current?.expected ?? schemas[key] ?? schemas[entry.route] ?? null;

      hydrated[key] = {
        key,
        method: entry.method,
        route: entry.route,
        expected,
        observed,
        changes: expected ? diff(expected, observed) : [],
        samples: (current?.samples ?? 0) + entry.samples,
        lastSeen: Math.max(current?.lastSeen ?? 0, entry.lastSeen),
      };
    }

    set({ storage, models: hydrated });
  },

  setRoutes: (routes) => set({ routes: [...routes] }),

  clear: () => set({ models: {} }),
}));

export const endpoints = (state: SniffrState): readonly EndpointModel[] =>
  Object.values(state.models).toSorted((a, b) => b.lastSeen - a.lastSeen);
