import { describe, expect, it } from "vitest";
import { z as z4 } from "zod";
import { z } from "zod-v3";

import { fromZod, isOptionalSchema } from "../src/core/from-zod.js";
import { render } from "../src/core/shape.js";

const shown = (schema: unknown) => render(fromZod(schema));

describe("fromZod v3 — scalars", () => {
  it("maps the primitives", () => {
    expect(shown(z.string())).toBe("string");
    expect(shown(z.boolean())).toBe("boolean");
    expect(shown(z.null())).toBe("null");
    expect(shown(z.number())).toBe("number");
  });

  it("reads the v3 integer check, which is {kind:'int'} not a format string", () => {
    expect(shown(z.number().int())).toBe("integer");
    expect(shown(z.number())).toBe("number");
    expect(shown(z.number().min(3))).toBe("number");
    expect(shown(z.bigint())).toBe("integer");
  });

  it("treats dates as the strings they serialise to", () => {
    expect(shown(z.date())).toBe("string");
  });

  it("falls back to unknown for anything opaque", () => {
    expect(shown(z.any())).toBe("unknown");
    expect(shown(z.unknown())).toBe("unknown");
    expect(shown(z.undefined())).toBe("unknown");
  });
});

describe("fromZod v3 — literals and enums", () => {
  it("reads a literal from _def.value, not _def.values", () => {
    expect(shown(z.literal("a"))).toBe('"a"');
    expect(shown(z.literal(7))).toBe("7");
  });

  it("maps an enum to a union of literals", () => {
    expect(shown(z.enum(["admin", "member"]))).toBe('"admin" | "member"');
  });

  it("maps a native enum, whose values are an object", () => {
    enum Role {
      Admin = "admin",
      Member = "member",
    }
    expect(shown(z.nativeEnum(Role))).toBe('"admin" | "member"');
  });
});

describe("fromZod v3 — containers", () => {
  it("reads an array element from _def.type, which is a schema in v3", () => {
    expect(shown(z.array(z.string()))).toBe("string[]");
    expect(shown(z.array(z.array(z.number().int())))).toBe("integer[][]");
  });

  it("calls _def.shape(), which is a function in v3", () => {
    expect(shown(z.object({ id: z.number().int(), nick: z.string().optional() }))).toBe(
      "{ id: integer; nick?: string }",
    );
  });

  it("maps unions and discriminated unions", () => {
    expect(shown(z.union([z.string(), z.null()]))).toBe("string | null");
    const discriminated = z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("a") }),
      z.object({ kind: z.literal("b") }),
    ]);
    expect(shown(discriminated)).toBe('{ kind: "a" } | { kind: "b" }');
  });

  it("merges an intersection of objects", () => {
    expect(shown(z.intersection(z.object({ a: z.string() }), z.object({ b: z.string() })))).toBe(
      "{ a: string; b: string }",
    );
  });

  it("approximates a tuple as an array of its member union", () => {
    expect(shown(z.tuple([z.string(), z.number().int()]))).toBe("(string | integer)[]");
  });

  it("maps a record to an open object", () => {
    expect(shown(z.record(z.number()))).toBe("{ ... }");
  });
});

describe("fromZod v3 — openness uses unknownKeys, not an undefined catchall", () => {
  it("treats a plain object as closed even though catchall is ZodNever", () => {
    const shape = fromZod(z.object({ a: z.string() }));
    expect(shape.kind === "object" && shape.open).toBe(false);
  });

  it("treats passthrough as open", () => {
    const shape = fromZod(z.object({ a: z.string() }).passthrough());
    expect(shape.kind === "object" && shape.open).toBe(true);
  });

  it("treats an explicit catchall as open", () => {
    const shape = fromZod(z.object({ a: z.string() }).catchall(z.string()));
    expect(shape.kind === "object" && shape.open).toBe(true);
  });

  it("treats strict as closed", () => {
    const shape = fromZod(z.object({ a: z.string() }).strict());
    expect(shape.kind === "object" && shape.open).toBe(false);
  });
});

describe("fromZod v3 — wrappers", () => {
  it("unwraps to the inner type", () => {
    expect(shown(z.string().optional())).toBe("string");
    expect(shown(z.string().default("x"))).toBe("string");
    expect(shown(z.string().catch("x"))).toBe("string");
    expect(shown(z.string().readonly())).toBe("string");
    expect(shown(z.lazy(() => z.string()))).toBe("string");
  });

  it("turns nullable into a union with null", () => {
    expect(shown(z.string().nullable())).toBe("string | null");
    expect(shown(z.string().nullish())).toBe("string | null");
  });

  it("reads ZodEffects through _def.schema", () => {
    expect(shown(z.string().transform((value) => value.length))).toBe("string");
  });

  it("reads a pipeline", () => {
    expect(shown(z.string().pipe(z.string()))).toBe("string");
  });
});

describe("isOptionalSchema on v3", () => {
  it("recognises optional and default", () => {
    expect(isOptionalSchema(z.string().optional())).toBe(true);
    expect(isOptionalSchema(z.string().default("x"))).toBe(true);
    expect(isOptionalSchema(z.string())).toBe(false);
    expect(isOptionalSchema(z.string().nullable())).toBe(false);
  });
});

describe("v3 and v4 agree", () => {
  it("compiles the same schema to the same shape from either major", () => {
    const v3 = z.object({
      id: z.number().int(),
      email: z.string(),
      role: z.enum(["admin", "member"]),
      nickname: z.string().optional(),
      tags: z.array(z.string()),
      meta: z.string().nullable(),
    });
    const v4 = z4.object({
      id: z4.number().int(),
      email: z4.string(),
      role: z4.enum(["admin", "member"]),
      nickname: z4.string().optional(),
      tags: z4.array(z4.string()),
      meta: z4.string().nullable(),
    });

    expect(fromZod(v3)).toEqual(fromZod(v4));
  });
});
