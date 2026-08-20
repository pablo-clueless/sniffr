import { endpointKey, normalizeRoute } from "../core/route.js";
import { schemaSides, toShape } from "../core/compile.js";
import { asRequest, diff } from "../core/diff.js";
import type { Change } from "../core/diff.js";
import type { Shape } from "../core/shape.js";
import { UNKNOWN } from "../core/shape.js";
import { infer } from "../core/infer.js";
import { merge } from "../core/merge.js";
import type { Sample } from "./har.js";

export type EndpointReport = {
  readonly key: string;
  readonly method: string;
  readonly route: string;
  readonly samples: number;
  readonly observed: Shape;
  readonly expected: Shape | null;
  readonly request: Shape | null;
  readonly expectedRequest: Shape | null;
  readonly changes: readonly Change[];
};

export type Analysis = {
  readonly endpoints: readonly EndpointReport[];
  readonly breaking: number;
  readonly additive: number;
  readonly info: number;
  readonly unmatched: readonly string[];
};

export type AnalyzeOptions = {
  readonly schemas?: Readonly<Record<string, unknown>>;
  readonly routes?: readonly string[];
};

const schemaKey = (raw: string, routes: readonly string[]): string => {
  const parts = raw.trim().split(/\s+/);
  if (parts.length >= 2) {
    return endpointKey(parts[0] as string, normalizeRoute(parts[1] as string, routes));
  }
  return normalizeRoute(raw, routes);
};

export const analyze = (samples: readonly Sample[], options: AnalyzeOptions = {}): Analysis => {
  const routes = options.routes ?? [];

  const expectedByKey = new Map<string, Shape>();
  const expectedRequestByKey = new Map<string, Shape>();
  for (const [raw, value] of Object.entries(options.schemas ?? {})) {
    const key = schemaKey(raw, routes);
    const { request, response } = schemaSides(value);
    if (response !== undefined) expectedByKey.set(key, toShape(response));
    if (request !== undefined) expectedRequestByKey.set(key, toShape(request));
  }

  const observedByKey = new Map<
    string,
    { method: string; route: string; shape: Shape; request: Shape | null; samples: number }
  >();
  for (const sample of samples) {
    const route = normalizeRoute(sample.url, routes);
    const key = endpointKey(sample.method, route);
    const previous = observedByKey.get(key);
    observedByKey.set(key, {
      method: sample.method.toUpperCase(),
      route,
      shape: merge(previous?.shape ?? UNKNOWN, infer(sample.body)),
      request:
        sample.requestBody === undefined
          ? (previous?.request ?? null)
          : merge(previous?.request ?? UNKNOWN, infer(sample.requestBody)),
      samples: (previous?.samples ?? 0) + 1,
    });
  }

  const endpoints: EndpointReport[] = [];
  let breaking = 0;
  let additive = 0;
  let info = 0;

  for (const [key, entry] of observedByKey) {
    const expected = expectedByKey.get(key) ?? expectedByKey.get(entry.route) ?? null;
    const expectedRequest =
      expectedRequestByKey.get(key) ?? expectedRequestByKey.get(entry.route) ?? null;

    const changes = [
      ...(expected ? diff(expected, entry.shape) : []),
      ...(expectedRequest && entry.request ? asRequest(diff(expectedRequest, entry.request)) : []),
    ];

    for (const change of changes) {
      if (change.severity === "breaking") breaking += 1;
      else if (change.severity === "additive") additive += 1;
      else info += 1;
    }

    endpoints.push({
      key,
      method: entry.method,
      route: entry.route,
      samples: entry.samples,
      observed: entry.shape,
      expected,
      request: entry.request,
      expectedRequest,
      changes,
    });
  }

  const matched = new Set(
    endpoints
      .filter((endpoint) => endpoint.expected !== null || endpoint.expectedRequest !== null)
      .map((endpoint) => endpoint.key),
  );
  const unmatched = [...new Set([...expectedByKey.keys(), ...expectedRequestByKey.keys()])]
    .filter((key) => !matched.has(key))
    .toSorted();

  return {
    endpoints: endpoints.toSorted((a, b) => a.key.localeCompare(b.key)),
    breaking,
    additive,
    info,
    unmatched,
  };
};
