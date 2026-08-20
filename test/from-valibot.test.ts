import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import * as v from "valibot";
import { z } from "zod";

import { analyze } from "../src/ci/analyze.js";
import { loadSamples } from "../src/ci/sources.js";
import { isDeclaredSchema, schemaSides, toShape } from "../src/core/compile.js";
import { fromOpenApi, schemasFromOpenApi } from "../src/core/from-openapi.js";
import { fromValibot, isOptionalValibotSchema, isValibotSchema } from "../src/core/from-valibot.js";
import { fromZod } from "../src/core/from-zod.js";
import { STRING, render } from "../src/core/shape.js";

const shown = (schema: unknown) => render(fromValibot(schema));

const spec = JSON.parse(await readFile("test/fixtures/openapi.json", "utf8")) as unknown;

describe("fromValibot — scalars", () => {
  it("maps the primitives", () => {
    expect(shown(v.string())).toBe("string");
    expect(shown(v.boolean())).toBe("boolean");
    expect(shown(v.null())).toBe("null");
    expect(shown(v.number())).toBe("number");
    expect(shown(v.bigint())).toBe("integer");
  });

  it("finds the integer action inside a pipe", () => {
    expect(shown(v.pipe(v.number(), v.integer()))).toBe("integer");
    expect(shown(v.pipe(v.number(), v.minValue(3)))).toBe("number");
  });

  it("treats dates as the strings they serialise to", () => {
    expect(shown(v.date())).toBe("string");
  });

  it("returns unknown for what JSON cannot carry", () => {
    expect(shown(v.any())).toBe("unknown");
    expect(shown(v.unknown())).toBe("unknown");
    expect(shown(v.undefined())).toBe("unknown");
    expect(shown({})).toBe("unknown");
  });
});

describe("fromValibot — literals and enums", () => {
  it("maps a literal", () => {
    expect(shown(v.literal("a"))).toBe('"a"');
    expect(shown(v.literal(7))).toBe("7");
  });

  it("maps a picklist", () => {
    expect(shown(v.picklist(["admin", "member"]))).toBe('"admin" | "member"');
  });

  it("maps an enum", () => {
    expect(shown(v.enum({ Admin: "admin", Member: "member" }))).toBe('"admin" | "member"');
  });
});

describe("fromValibot — containers", () => {
  it("maps arrays", () => {
    expect(shown(v.array(v.string()))).toBe("string[]");
  });

  it("maps objects and marks optional entries", () => {
    expect(
      shown(v.object({ id: v.pipe(v.number(), v.integer()), nick: v.optional(v.string()) })),
    ).toBe("{ id: integer; nick?: string }");
  });

  it("distinguishes strict, plain and loose objects", () => {
    expect(shown(v.object({ a: v.string() }))).toBe("{ a: string }");
    expect(shown(v.strictObject({ a: v.string() }))).toBe("{ a: string }");
    expect(shown(v.looseObject({ a: v.string() }))).toBe("{ a: string; ... }");
    expect(shown(v.objectWithRest({ a: v.string() }, v.string()))).toBe("{ a: string; ... }");
  });

  it("maps a record to an open object", () => {
    expect(shown(v.record(v.string(), v.number()))).toBe("{ ... }");
  });

  it("maps unions and variants", () => {
    expect(shown(v.union([v.string(), v.null()]))).toBe("string | null");
    const variant = v.variant("kind", [
      v.object({ kind: v.literal("a") }),
      v.object({ kind: v.literal("b") }),
    ]);
    expect(shown(variant)).toBe('{ kind: "a" } | { kind: "b" }');
  });

  it("merges an intersection of objects", () => {
    expect(shown(v.intersect([v.object({ a: v.string() }), v.object({ b: v.string() })]))).toBe(
      "{ a: string; b: string }",
    );
  });

  it("approximates a tuple as an array of its member union", () => {
    expect(shown(v.tuple([v.string(), v.pipe(v.number(), v.integer())]))).toBe(
      "(string | integer)[]",
    );
  });
});

describe("fromValibot — wrappers", () => {
  it("unwraps to the inner type", () => {
    expect(shown(v.optional(v.string()))).toBe("string");
    expect(shown(v.nonOptional(v.optional(v.string())))).toBe("string");
  });

  it("turns nullable and nullish into a union with null", () => {
    expect(shown(v.nullable(v.string()))).toBe("string | null");
    expect(shown(v.nullish(v.string()))).toBe("string | null");
  });

  it("resolves lazy", () => {
    expect(shown(v.lazy(() => v.string()))).toBe("string");
  });

  it("does not hang on a self-referential lazy", () => {
    const node: v.GenericSchema = v.lazy(() => v.object({ self: node }));
    expect(() => fromValibot(node)).not.toThrow();
  });
});

describe("isOptionalValibotSchema", () => {
  it("recognises the optional wrappers", () => {
    expect(isOptionalValibotSchema(v.optional(v.string()))).toBe(true);
    expect(isOptionalValibotSchema(v.nullish(v.string()))).toBe(true);
    expect(isOptionalValibotSchema(v.string())).toBe(false);
    expect(isOptionalValibotSchema(v.nullable(v.string()))).toBe(false);
  });
});

describe("detection stays structural (HANDOFF 7.4)", () => {
  it("tells valibot apart from zod and from a Shape", () => {
    expect(isValibotSchema(v.string())).toBe(true);
    expect(isValibotSchema(z.string())).toBe(false);
    expect(isValibotSchema(STRING)).toBe(false);
    expect(isValibotSchema(null)).toBe(false);
  });

  it("never imports valibot to do it", async () => {
    const source = await readFile("src/core/from-valibot.ts", "utf8");
    expect(source).not.toMatch(/from\s+["']valibot["']/);
  });
});

describe("toShape — the one dispatch point", () => {
  it("passes an already-compiled Shape straight through", () => {
    expect(toShape(STRING)).toBe(STRING);
  });

  it("reads valibot, zod and OpenAPI alike", () => {
    expect(toShape(v.string())).toEqual(STRING);
    expect(toShape(z.string())).toEqual(STRING);
    expect(toShape(fromOpenApi({ type: "string" }))).toEqual(STRING);
  });

  it("treats a bare valibot schema as the response side", () => {
    const sides = schemaSides(v.object({ a: v.string() }));
    expect(sides.response).toBeDefined();
    expect(sides.request).toBeUndefined();
  });

  it("still splits an explicit request/response pair", () => {
    const sides = schemaSides({ request: v.string(), response: v.number() });
    expect(sides.request).toBeDefined();
    expect(sides.response).toBeDefined();
  });

  it("recognises every declared form", () => {
    expect(isDeclaredSchema(v.string())).toBe(true);
    expect(isDeclaredSchema(z.string())).toBe(true);
    expect(isDeclaredSchema(STRING)).toBe(true);
    expect(isDeclaredSchema({ nope: 1 })).toBe(false);
  });
});

describe("three sources of truth, one Shape (HANDOFF 4)", () => {
  it("valibot, zod and OpenAPI agree on the same contract", () => {
    const valibot = fromValibot(v.object({ ok: v.boolean() }));
    const zod = fromZod(z.object({ ok: z.boolean() }));
    const openapi = schemasFromOpenApi(spec)["GET /api/health"]!.response!;

    expect(valibot).toEqual(zod);
    expect(valibot).toEqual(openapi);
  });

  it("valibot finds the same drift in the same HAR", async () => {
    const { samples } = await loadSamples(["test/fixtures/users.har"]);
    const analysis = analyze(samples, {
      schemas: {
        "GET /api/users": v.object({
          data: v.array(
            v.object({
              id: v.pipe(v.number(), v.integer()),
              email: v.string(),
              role: v.picklist(["admin", "member"]),
              nickname: v.optional(v.string()),
            }),
          ),
        }),
      },
    });

    expect(analysis.breaking).toBe(2);
    expect(analysis.additive).toBe(1);
    expect(analysis.info).toBe(1);
  });
});
