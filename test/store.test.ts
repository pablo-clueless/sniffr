import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { endpoints, sniffrStore } from "../src/runtime/store.js";
import type { Capture } from "../src/runtime/store.js";

const capture = (overrides: Partial<Capture> = {}): Capture => ({
  method: "GET",
  url: "/api/users/42",
  status: 200,
  body: { id: 42, email: "ada@example.com" },
  at: Date.now(),
  ...overrides,
});

beforeEach(() => {
  sniffrStore.setState({ models: {}, schemas: {}, routes: [] });
});

describe("store — recording", () => {
  it("keys a model by method and normalised route", () => {
    sniffrStore.getState().record(capture());
    expect(Object.keys(sniffrStore.getState().models)).toEqual(["GET /api/users/:id"]);
  });

  it("counts samples and merges successive responses into one model", () => {
    sniffrStore.getState().record(capture());
    sniffrStore.getState().record(capture({ url: "/api/users/43", body: { id: 43, email: null } }));

    const models = Object.values(sniffrStore.getState().models);
    expect(models).toHaveLength(1);
    expect(models[0]!.samples).toBe(2);
    expect(models[0]!.observed.kind).toBe("object");
  });

  it("records nothing against a schema it does not have", () => {
    sniffrStore.getState().record(capture());
    expect(Object.values(sniffrStore.getState().models)[0]!.changes).toEqual([]);
  });
});

describe("store — schemas", () => {
  it("matches a schema registered with a method", () => {
    sniffrStore.getState().registerSchemas({
      "GET /api/users/:id": z.object({ id: z.number().int(), email: z.string() }),
    });
    sniffrStore.getState().record(capture({ body: { id: 42, email: null } }));

    const changes = Object.values(sniffrStore.getState().models)[0]!.changes;
    expect(changes.map((change) => change.code)).toEqual(["null.added"]);
  });

  it("matches a schema registered without a method", () => {
    sniffrStore.getState().registerSchemas({
      "/api/users/:id": z.object({ id: z.number().int() }),
    });
    sniffrStore.getState().record(capture({ body: { id: "not-a-number" } }));

    expect(Object.values(sniffrStore.getState().models)[0]!.changes).toHaveLength(1);
  });

  it("normalises a schema key written with a concrete id", () => {
    sniffrStore.getState().registerSchemas({
      "GET /api/users/42": z.object({ id: z.number().int() }),
    });
    sniffrStore.getState().record(capture({ url: "/api/users/999", body: { id: null } }));

    expect(Object.values(sniffrStore.getState().models)[0]!.changes).toHaveLength(1);
  });

  it("honours explicit routes when keying", () => {
    sniffrStore.getState().setRoutes(["/api/posts/:slug"]);
    sniffrStore.getState().record(capture({ url: "/api/posts/how-to-build-a-dev-tool", body: {} }));
    expect(Object.keys(sniffrStore.getState().models)).toEqual(["GET /api/posts/:slug"]);
  });
});

describe("store — helpers", () => {
  it("clear drops models but keeps schemas", () => {
    sniffrStore.getState().registerSchemas({ "/api/users/:id": z.object({}) });
    sniffrStore.getState().record(capture());
    sniffrStore.getState().clear();

    expect(sniffrStore.getState().models).toEqual({});
    expect(Object.keys(sniffrStore.getState().schemas)).toHaveLength(1);
  });

  it("endpoints sorts most recently seen first", () => {
    sniffrStore.getState().record(capture({ url: "/api/a", at: 1 }));
    sniffrStore.getState().record(capture({ url: "/api/b", at: 2 }));
    expect(endpoints(sniffrStore.getState()).map((model) => model.route)).toEqual([
      "/api/b",
      "/api/a",
    ]);
  });

  it("notifies subscribers", () => {
    let notified = 0;
    const unsubscribe = sniffrStore.subscribe(() => {
      notified += 1;
    });
    sniffrStore.getState().record(capture());
    unsubscribe();
    expect(notified).toBe(1);
  });
});
