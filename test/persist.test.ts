import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { INTEGER, NULL, STRING, array, field, literal, object, union } from "../src/core/shape.js";
import { canonical, hash, hashSchemas, hashShape, parseShape } from "../src/core/serialize.js";
import type { StorageLike } from "../src/runtime/persist.js";
import { sniffrStore } from "../src/runtime/store.js";
import {
  MAX_STORED_BYTES,
  STORAGE_PREFIX,
  clear,
  load,
  save,
  storageKey,
} from "../src/runtime/persist.js";

class FakeStorage implements StorageLike {
  private readonly map = new Map<string, string>();
  public throwOnSet = false;

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.throwOnSet) throw new Error("QuotaExceededError");
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  get length(): number {
    return this.map.size;
  }
  key(index: number): string | null {
    return [...this.map.keys()][index] ?? null;
  }
  keys(): string[] {
    return [...this.map.keys()];
  }
}

const schema = z.object({ id: z.number().int(), email: z.string() });

const record = (body: unknown, at = Date.now()) => {
  sniffrStore.getState().record({ method: "GET", url: "/api/users/1", status: 200, body, at });
};

const reset = () => {
  sniffrStore.setState({ models: {}, schemas: {}, routes: [], storage: null });
  sniffrStore.getState().registerSchemas({ "GET /api/users/:id": schema });
};

beforeEach(reset);

describe("canonical", () => {
  it("ignores incidental field order", () => {
    const a = object({ x: field(STRING), y: field(INTEGER) });
    const b = object({ y: field(INTEGER), x: field(STRING) });
    expect(canonical(a)).toBe(canonical(b));
  });

  it("ignores incidental union member order", () => {
    expect(canonical(union([STRING, NULL]))).toBe(canonical(union([NULL, STRING])));
  });

  it("still separates genuinely different shapes", () => {
    expect(canonical(object({ x: field(STRING) }))).not.toBe(
      canonical(object({ x: field(STRING, true) })),
    );
    expect(canonical(object({}, true))).not.toBe(canonical(object({})));
    expect(canonical(STRING)).not.toBe(canonical(literal("a")));
  });
});

describe("hash", () => {
  it("is stable and differs for different input", () => {
    expect(hash("abc")).toBe(hash("abc"));
    expect(hash("abc")).not.toBe(hash("abd"));
  });

  it("hashes equal shapes alike regardless of construction order", () => {
    expect(hashShape(union([STRING, NULL]))).toBe(hashShape(union([NULL, STRING])));
  });

  it("hashes a schema map independently of key order", () => {
    const a = hashSchemas({ b: STRING, a: INTEGER });
    const b = hashSchemas({ a: INTEGER, b: STRING });
    expect(a).toBe(b);
  });

  it("changes when a schema changes", () => {
    expect(hashSchemas({ a: STRING })).not.toBe(hashSchemas({ a: INTEGER }));
  });
});

describe("parseShape", () => {
  it("round-trips every kind through JSON", () => {
    const shape = object(
      {
        id: field(INTEGER),
        email: field(union([literal("a"), NULL])),
        tags: field(array(STRING), true),
      },
      true,
    );
    expect(parseShape(JSON.parse(JSON.stringify(shape)))).toEqual(shape);
  });

  it("rejects anything malformed rather than letting it reach diff", () => {
    expect(parseShape(null)).toBeNull();
    expect(parseShape({ kind: "nope" })).toBeNull();
    expect(parseShape({ kind: "primitive", type: "banana" })).toBeNull();
    expect(parseShape({ kind: "literal", value: { a: 1 } })).toBeNull();
    expect(parseShape({ kind: "array" })).toBeNull();
    expect(parseShape({ kind: "object", fields: { a: { shape: { kind: "bad" } } } })).toBeNull();
    expect(parseShape({ kind: "union", members: [{ kind: "bad" }] })).toBeNull();
  });
});

describe("persist — storage round trip", () => {
  it("saves and loads a model", () => {
    const storage = new FakeStorage();
    const models = {
      "GET /api/users/:id": {
        method: "GET",
        route: "/api/users/:id",
        observed: object({ id: field(INTEGER) }),
        request: null,
        samples: 3,
        lastSeen: 100,
      },
    };

    expect(save(storage, "abc", models)).toBe(true);
    expect(load(storage, "abc")).toEqual(models);
  });

  it("keys by the schema hash, so a changed schema does not read stale data", () => {
    const storage = new FakeStorage();
    save(storage, "abc", {
      a: { method: "GET", route: "/a", observed: STRING, request: null, samples: 1, lastSeen: 1 },
    });
    expect(load(storage, "different")).toEqual({});
  });

  it("drops blobs written under other schema hashes", () => {
    const storage = new FakeStorage();
    save(storage, "old", {
      a: { method: "GET", route: "/a", observed: STRING, request: null, samples: 1, lastSeen: 1 },
    });
    save(storage, "new", {
      a: { method: "GET", route: "/a", observed: STRING, request: null, samples: 1, lastSeen: 1 },
    });

    expect(storage.keys()).toEqual([storageKey("new")]);
  });

  it("survives corrupt storage", () => {
    const storage = new FakeStorage();
    storage.setItem(storageKey("abc"), "{not json");
    expect(load(storage, "abc")).toEqual({});

    storage.setItem(
      storageKey("abc"),
      JSON.stringify({ models: { a: { observed: { kind: "junk" } } } }),
    );
    expect(load(storage, "abc")).toEqual({});
  });

  it("refuses to write more than the cap", () => {
    const storage = new FakeStorage();
    const fields: Record<string, ReturnType<typeof field>> = {};
    for (let i = 0; i < 4000; i += 1) fields[`field_${i}_with_a_long_name`] = field(STRING);
    const big = {
      a: {
        method: "GET",
        route: "/a",
        observed: object(fields),
        request: null,
        samples: 1,
        lastSeen: 1,
      },
    };

    expect(JSON.stringify(big).length).toBeGreaterThan(MAX_STORED_BYTES);
    expect(save(storage, "abc", big)).toBe(false);
  });

  it("never throws when storage does", () => {
    const storage = new FakeStorage();
    storage.throwOnSet = true;
    expect(save(storage, "abc", {})).toBe(false);
    expect(() => clear(storage, "abc")).not.toThrow();
  });

  it("namespaces its keys", () => {
    expect(storageKey("abc").startsWith(STORAGE_PREFIX)).toBe(true);
  });
});

describe("persist — measuring drift against yesterday (task 4.2)", () => {
  it("carries an observation across a reload", () => {
    const storage = new FakeStorage();

    sniffrStore.getState().persistTo(storage);
    record({ id: 1, email: "ada@example.com" });
    expect(storage.length).toBe(1);

    // a new session: same schemas, empty models
    reset();
    expect(sniffrStore.getState().models).toEqual({});

    sniffrStore.getState().persistTo(storage);
    const model = sniffrStore.getState().models["GET /api/users/:id"];
    expect(model?.samples).toBe(1);
    expect(model?.observed.kind).toBe("object");
  });

  it("merges yesterday's shape with today's, so drift spans sessions", () => {
    const storage = new FakeStorage();

    sniffrStore.getState().persistTo(storage);
    record({ id: 1, email: "ada@example.com" });

    reset();
    sniffrStore.getState().persistTo(storage);
    record({ id: 2, email: null });

    const model = sniffrStore.getState().models["GET /api/users/:id"];
    expect(model?.changes.map((change) => change.code)).toEqual(["null.added"]);
    expect(model?.samples).toBe(2);
  });

  it("ignores yesterday once the schema changes", () => {
    const storage = new FakeStorage();
    sniffrStore.getState().persistTo(storage);
    record({ id: 1, email: "ada@example.com" });

    sniffrStore.setState({ models: {}, schemas: {}, routes: [], storage: null });
    sniffrStore.getState().registerSchemas({
      "GET /api/users/:id": z.object({
        id: z.number().int(),
        email: z.string(),
        extra: z.string(),
      }),
    });
    sniffrStore.getState().persistTo(storage);

    expect(sniffrStore.getState().models).toEqual({});
  });

  it("does not write when nothing changed", () => {
    const storage = new FakeStorage();
    sniffrStore.getState().persistTo(storage);

    record({ id: 1, email: "ada@example.com" });
    const first = storage.getItem(storageKey(sniffrStore.getState().schemaHash));

    record({ id: 1, email: "ada@example.com" });
    expect(storage.getItem(storageKey(sniffrStore.getState().schemaHash))).toBe(first);
  });

  it("stays inert when no storage is attached", () => {
    expect(() => record({ id: 1, email: "ada@example.com" })).not.toThrow();
    expect(sniffrStore.getState().storage).toBeNull();
  });
});
