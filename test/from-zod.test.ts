import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { fromZod, isOptionalSchema } from "../src/core/from-zod.js";
import { render } from "../src/core/shape.js";

const shown = (schema: unknown) => render(fromZod(schema));

describe("fromZod — scalars", () => {
  it("maps the primitives", () => {
    expect(shown(z.string())).toBe("string");
    expect(shown(z.boolean())).toBe("boolean");
    expect(shown(z.null())).toBe("null");
    expect(shown(z.number())).toBe("number");
  });

  it("distinguishes an integer from a float", () => {
    expect(shown(z.number().int())).toBe("integer");
    expect(shown(z.number())).toBe("number");
    expect(shown(z.bigint())).toBe("integer");
  });

  it("does not mistake a plain constraint for an integer check", () => {
    expect(shown(z.number().min(3))).toBe("number");
  });

  it("treats dates as the strings they serialise to", () => {
    expect(shown(z.date())).toBe("string");
  });

  it("falls back to unknown for anything opaque", () => {
    expect(shown(z.any())).toBe("unknown");
    expect(shown(z.unknown())).toBe("unknown");
    expect(shown(z.undefined())).toBe("unknown");
    expect(shown({})).toBe("unknown");
    expect(shown(null)).toBe("unknown");
  });
});

describe("fromZod — literals and enums", () => {
  it("maps a literal", () => {
    expect(shown(z.literal("a"))).toBe('"a"');
    expect(shown(z.literal(7))).toBe("7");
  });

  it("maps an enum to a union of literals", () => {
    expect(shown(z.enum(["admin", "member"]))).toBe('"admin" | "member"');
  });

  it("maps a native enum", () => {
    enum Role {
      Admin = "admin",
      Member = "member",
    }
    expect(shown(z.nativeEnum(Role))).toBe('"admin" | "member"');
  });
});

describe("fromZod — containers", () => {
  it("maps arrays", () => {
    expect(shown(z.array(z.string()))).toBe("string[]");
  });

  it("maps objects, marking optional fields", () => {
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

  it("maps a record to an open object, so extra keys are not additive", () => {
    expect(shown(z.record(z.string(), z.number()))).toBe("{ ... }");
  });
});

describe("fromZod — openness (HANDOFF 8)", () => {
  it("treats a plain object as closed", () => {
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
});

describe("fromZod — wrappers", () => {
  it("unwraps to the inner type", () => {
    expect(shown(z.string().optional())).toBe("string");
    expect(shown(z.string().default("x"))).toBe("string");
    expect(shown(z.string().catch("x"))).toBe("string");
    expect(shown(z.string().readonly())).toBe("string");
    expect(shown(z.lazy(() => z.string()))).toBe("string");
  });

  it("turns nullable into a union with null", () => {
    expect(shown(z.string().nullable())).toBe("string | null");
  });

  it("handles nullish, which is optional over nullable", () => {
    expect(shown(z.string().nullish())).toBe("string | null");
  });

  it("takes the input side of a transform, whose output is opaque", () => {
    expect(shown(z.string().transform((value) => value.length))).toBe("string");
  });
});

describe("isOptionalSchema", () => {
  it("is true for optional and default", () => {
    expect(isOptionalSchema(z.string().optional())).toBe(true);
    expect(isOptionalSchema(z.string().default("x"))).toBe(true);
  });

  it("is false for a bare or merely nullable schema", () => {
    expect(isOptionalSchema(z.string())).toBe(false);
    expect(isOptionalSchema(z.string().nullable())).toBe(false);
  });

  it("sees through a wrapper to the optional underneath", () => {
    expect(isOptionalSchema(z.string().optional().readonly())).toBe(true);
  });
});

describe("fromZod — the zod boundary (HANDOFF 7.4)", () => {
  let calls = 0;

  beforeEach(() => {
    calls = 0;
  });

  it("reads _def structurally rather than calling zod's api", () => {
    const schema = z.object({ a: z.string() });
    const proxy = new Proxy(schema, {
      get(target, key, receiver) {
        if (key !== "_def" && key !== "def") calls += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    expect(shown(proxy)).toBe("{ a: string }");
    expect(calls).toBe(0);
  });
});
