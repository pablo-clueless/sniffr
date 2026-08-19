import { describe, expect, it } from "vitest";
import { infer } from "../src/core/infer.js";
import {
  BOOLEAN,
  NULL,
  NUMBER,
  STRING,
  UNKNOWN,
  array,
  field,
  literal,
  object,
  render,
} from "../src/core/shape.js";

describe("infer — the literal trap (HANDOFF 6)", () => {
  it("emits strings as literals, not primitives", () => {
    expect(infer("admin")).toEqual(literal("admin"));
    expect(infer("admin")).not.toEqual(STRING);
  });

  it("emits integers as literals", () => {
    expect(infer(42)).toEqual(literal(42));
  });

  it("emits non-integer numbers as the primitive", () => {
    expect(infer(1.5)).toEqual(NUMBER);
    expect(infer(Number.NaN)).toEqual(NUMBER);
    expect(infer(Number.POSITIVE_INFINITY)).toEqual(NUMBER);
  });

  it("emits booleans as the primitive", () => {
    expect(infer(true)).toEqual(BOOLEAN);
  });
});

describe("infer", () => {
  it("maps null", () => {
    expect(infer(null)).toEqual(NULL);
  });

  it("gives an empty array an unknown item", () => {
    expect(infer([])).toEqual(array(UNKNOWN));
  });

  it("merges array items, so a mixed array widens", () => {
    expect(render(infer(["a", null]))).toBe('("a" | null)[]');
  });

  it("caps a long array of distinct strings back to the primitive", () => {
    const many = Array.from({ length: 13 }, (_, index) => `value-${index}`);
    expect(infer(many)).toEqual(array(STRING));
  });

  it("treats every observed key as required", () => {
    expect(infer({ id: 1 })).toEqual(object({ id: field(literal(1)) }));
  });

  it("skips keys whose value is undefined, matching JSON.stringify", () => {
    expect(infer({ a: 1, b: undefined })).toEqual(object({ a: field(literal(1)) }));
  });

  it("recurses into nested structures", () => {
    const shape = infer({ data: [{ id: 1 }] });
    expect(render(shape)).toBe("{ data: { id: 1 }[] }");
  });

  it("returns unknown for values JSON cannot carry", () => {
    expect(infer(() => {})).toEqual(UNKNOWN);
    expect(infer(Symbol("x"))).toEqual(UNKNOWN);
  });

  it("stops recursing at the depth cap instead of overflowing", () => {
    let deep: Record<string, unknown> = { end: 1 };
    for (let i = 0; i < 40; i += 1) deep = { nest: deep };
    expect(() => infer(deep)).not.toThrow();
  });
});
