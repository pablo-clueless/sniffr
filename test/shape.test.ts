import { describe, expect, it } from "vitest";

import {
  BOOLEAN,
  INTEGER,
  NULL,
  NUMBER,
  STRING,
  UNKNOWN,
  array,
  equals,
  field,
  hasLiterals,
  literal,
  object,
  render,
  union,
  widenLiterals,
} from "../src/core/shape.js";

describe("union", () => {
  it("collapses a single member", () => {
    expect(union([STRING])).toEqual(STRING);
  });

  it("flattens nested unions", () => {
    const nested = union([union([STRING, NULL]), INTEGER]);
    expect(nested.kind).toBe("union");
    expect(nested.kind === "union" && nested.members).toHaveLength(3);
  });

  it("dedupes structurally equal members", () => {
    expect(union([STRING, STRING, STRING])).toEqual(STRING);
    expect(union([literal("a"), literal("a")])).toEqual(literal("a"));
  });

  it("is absorbed by unknown", () => {
    expect(union([STRING, UNKNOWN])).toEqual(UNKNOWN);
  });

  it("returns unknown for no members", () => {
    expect(union([])).toEqual(UNKNOWN);
  });
});

describe("equals", () => {
  it("compares objects by field set, optionality, and openness", () => {
    const a = object({ id: field(INTEGER) });
    expect(equals(a, object({ id: field(INTEGER) }))).toBe(true);
    expect(equals(a, object({ id: field(INTEGER, true) }))).toBe(false);
    expect(equals(a, object({ id: field(INTEGER) }, true))).toBe(false);
    expect(equals(a, object({ id: field(STRING) }))).toBe(false);
    expect(equals(a, object({}))).toBe(false);
  });

  it("compares unions irrespective of member order", () => {
    expect(equals(union([STRING, NULL]), union([NULL, STRING]))).toBe(true);
  });

  it("separates integer from number", () => {
    expect(equals(INTEGER, NUMBER)).toBe(false);
  });
});

describe("render", () => {
  it("renders literals as JSON", () => {
    expect(render(literal("admin"))).toBe('"admin"');
    expect(render(literal(42))).toBe("42");
  });

  it("always sorts null last so display is stable", () => {
    expect(render(union([NULL, STRING]))).toBe("string | null");
    expect(render(union([STRING, NULL]))).toBe("string | null");
  });

  it("parenthesises union array items", () => {
    expect(render(array(union([STRING, NULL])))).toBe("(string | null)[]");
    expect(render(array(STRING))).toBe("string[]");
  });

  it("marks optional fields and open objects", () => {
    const shape = object({ id: field(INTEGER), nick: field(STRING, true) }, true);
    expect(render(shape)).toBe("{ id: integer; nick?: string; ... }");
  });
});

describe("widenLiterals", () => {
  it("widens by base type, including inside arrays and objects", () => {
    expect(widenLiterals(literal("a"))).toEqual(STRING);
    expect(widenLiterals(literal(1))).toEqual(INTEGER);
    expect(widenLiterals(literal(1.5))).toEqual(NUMBER);
    expect(widenLiterals(literal(true))).toEqual(BOOLEAN);
    expect(widenLiterals(array(literal("a")))).toEqual(array(STRING));
    expect(widenLiterals(object({ a: field(literal("x")) }))).toEqual(object({ a: field(STRING) }));
  });

  it("collapses a literal union to one primitive", () => {
    expect(widenLiterals(union([literal("a"), literal("b")]))).toEqual(STRING);
  });

  it("keeps null distinct from the widened primitive", () => {
    expect(render(widenLiterals(union([literal("a"), NULL])))).toBe("string | null");
  });
});

describe("hasLiterals", () => {
  it("finds literals at any depth", () => {
    expect(hasLiterals(STRING)).toBe(false);
    expect(hasLiterals(literal("a"))).toBe(true);
    expect(hasLiterals(array(object({ a: field(literal(1)) })))).toBe(true);
    expect(hasLiterals(array(object({ a: field(STRING) })))).toBe(false);
  });
});
