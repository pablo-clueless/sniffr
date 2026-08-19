import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type * as DiffModule from "../src/core/diff.js";

vi.mock("../src/core/diff.js", async (importOriginal) => {
  const actual = await importOriginal<typeof DiffModule>();
  return { ...actual, diff: vi.fn(actual.diff) };
});

const { diff } = await import("../src/core/diff.js");
const { sniffrStore } = await import("../src/runtime/store.js");

const diffCalls = () => vi.mocked(diff).mock.calls.length;

const record = (body: unknown, url = "/api/users/1") => {
  sniffrStore.getState().record({ method: "GET", url, status: 200, body, at: Date.now() });
};

beforeEach(() => {
  vi.mocked(diff).mockClear();
  sniffrStore.setState({ models: {}, schemas: {}, routes: [] });
  sniffrStore.getState().registerSchemas({
    "GET /api/users/:id": z.object({ id: z.number().int(), email: z.string() }),
  });
});

describe("store — short-circuiting redundant diffs (task 2.1)", () => {
  it("diffs once across 100 identical responses", () => {
    for (let i = 0; i < 100; i += 1) record({ id: 1, email: "ada@example.com" });
    expect(diffCalls()).toBe(1);
  });

  it("still advances samples and lastSeen while short-circuiting", () => {
    record({ id: 1, email: "ada@example.com" });
    const first = sniffrStore.getState().models["GET /api/users/:id"]!;

    record({ id: 1, email: "ada@example.com" });
    const second = sniffrStore.getState().models["GET /api/users/:id"]!;

    expect(second.samples).toBe(2);
    expect(second.lastSeen).toBeGreaterThanOrEqual(first.lastSeen);
    expect(diffCalls()).toBe(1);
  });

  it("keeps the previously computed changes when it skips", () => {
    record({ id: 1, email: null });
    const before = sniffrStore.getState().models["GET /api/users/:id"]!.changes;

    record({ id: 1, email: null });
    const after = sniffrStore.getState().models["GET /api/users/:id"]!.changes;

    expect(after).toBe(before);
    expect(after.map((change) => change.code)).toEqual(["null.added"]);
  });

  it("diffs again as soon as the shape actually widens", () => {
    record({ id: 1, email: "ada@example.com" });
    expect(diffCalls()).toBe(1);

    record({ id: 2, email: null });
    expect(diffCalls()).toBe(2);
  });

  it("does not short-circuit a value change that widens an enum", () => {
    record({ id: 1, email: "a@b.c" });
    record({ id: 1, email: "d@e.f" });
    expect(diffCalls()).toBe(2);
  });

  it("re-diffs when a schema arrives after the first response", () => {
    sniffrStore.setState({ models: {}, schemas: {}, routes: [] });
    record({ id: 1, email: "ada@example.com" });
    const withoutSchema = diffCalls();

    sniffrStore.getState().registerSchemas({
      "GET /api/users/:id": z.object({ id: z.number().int(), email: z.string() }),
    });
    record({ id: 1, email: "ada@example.com" });

    expect(diffCalls()).toBeGreaterThan(withoutSchema);
  });
});
