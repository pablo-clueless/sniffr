import { describe, expect, it } from "vitest";

import { ENUM_CARDINALITY_CAP, merge } from "../src/core/merge.js";
import {
  INTEGER,
  NULL,
  STRING,
  UNKNOWN,
  array,
  field,
  literal,
  object,
  render,
} from "../src/core/shape.js";

const literals = (count: number, prefix = "v") =>
  Array.from({ length: count }, (_, index) => literal(`${prefix}${index}`));

const mergeAll = (shapes: ReturnType<typeof literal>[]) =>
  shapes.reduce((acc, shape) => merge(acc, shape), UNKNOWN);

describe("merge — identity (HANDOFF 7.8)", () => {
  it("returns `a` by identity when the shapes are equal", () => {
    const a = object({ id: field(INTEGER) });
    const b = object({ id: field(INTEGER) });
    expect(merge(a, b)).toBe(a);
  });

  it("returns `a` by identity when b adds nothing new", () => {
    const a = object({ id: field(INTEGER), nick: field(STRING, true) });
    expect(merge(a, object({ id: field(INTEGER), nick: field(STRING, true) }))).toBe(a);
  });

  it("returns a new shape once b widens a", () => {
    const a = object({ id: field(INTEGER) });
    expect(merge(a, object({ id: field(STRING) }))).not.toBe(a);
  });
});

describe("merge — the cardinality cap", () => {
  it("is 12", () => {
    expect(ENUM_CARDINALITY_CAP).toBe(12);
  });

  it("keeps 12 distinct string literals as an enum", () => {
    const shape = mergeAll(literals(ENUM_CARDINALITY_CAP));
    expect(shape.kind).toBe("union");
    expect(shape.kind === "union" && shape.members).toHaveLength(12);
  });

  it("widens 13 distinct string literals to the primitive", () => {
    expect(mergeAll(literals(ENUM_CARDINALITY_CAP + 1))).toEqual(STRING);
  });

  it("caps integer literals independently of strings", () => {
    const ints = Array.from({ length: 13 }, (_, index) => literal(index));
    expect(ints.reduce((acc, shape) => merge(acc, shape), UNKNOWN as never)).toEqual(INTEGER);
  });

  it("keeps null through a widening cap", () => {
    const widened = merge(mergeAll(literals(13)), NULL);
    expect(render(widened)).toBe("string | null");
  });
});

describe("merge — unknown and arrays", () => {
  it("treats unknown as no information", () => {
    expect(merge(UNKNOWN, STRING)).toEqual(STRING);
    expect(merge(STRING, UNKNOWN)).toEqual(STRING);
  });

  it("merges [] into [x] without leaving unknown behind", () => {
    expect(merge(array(UNKNOWN), array(literal("a")))).toEqual(array(literal("a")));
  });

  it("merges [x] into [] the same way", () => {
    expect(merge(array(literal("a")), array(UNKNOWN))).toEqual(array(literal("a")));
  });

  it("widens array items across samples", () => {
    expect(render(merge(array(literal("a")), array(NULL)))).toBe('("a" | null)[]');
  });
});

describe("merge — objects", () => {
  it("marks a key missing from either side as optional", () => {
    const merged = merge(
      object({ a: field(STRING), b: field(STRING) }),
      object({ a: field(STRING) }),
    );
    expect(render(merged)).toBe("{ a: string; b?: string }");
  });

  it("keeps a field optional once either side saw it optional", () => {
    const merged = merge(object({ a: field(STRING, true) }), object({ a: field(STRING) }));
    expect(render(merged)).toBe("{ a?: string }");
  });

  it("propagates openness", () => {
    const merged = merge(object({ a: field(STRING) }), object({ a: field(STRING) }, true));
    expect(merged.kind === "object" && merged.open).toBe(true);
  });

  it("absorbs a second object into the same union member rather than growing", () => {
    const merged = merge(object({ a: field(STRING) }), object({ b: field(STRING) }));
    expect(merged.kind).toBe("object");
    expect(render(merged)).toBe("{ a?: string; b?: string }");
  });

  it("unions genuinely different kinds", () => {
    expect(render(merge(STRING, NULL))).toBe("string | null");
  });
});
