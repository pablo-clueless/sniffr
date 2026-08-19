import { describe, expect, it } from "vitest";
import { assignable, diff, isBreaking } from "../src/core/diff.js";
import type { ChangeCode } from "../src/core/diff.js";
import { infer } from "../src/core/infer.js";
import {
  BOOLEAN,
  INTEGER,
  NULL,
  NUMBER,
  STRING,
  UNKNOWN,
  array,
  field,
  literal,
  object,
  union,
} from "../src/core/shape.js";

const codes = (expected: Parameters<typeof diff>[0], observed: Parameters<typeof diff>[1]) =>
  diff(expected, observed).map((change) => change.code);

const only = (expected: Parameters<typeof diff>[0], observed: Parameters<typeof diff>[1]) => {
  const changes = diff(expected, observed);
  expect(changes).toHaveLength(1);
  return changes[0]!;
};

describe("diff — every ChangeCode", () => {
  it("field.removed when a required field is gone", () => {
    const change = only(object({ id: field(INTEGER) }), object({}));
    expect(change.code).toBe<ChangeCode>("field.removed");
    expect(change.severity).toBe("breaking");
    expect(change.observed).toBe("absent");
    expect(change.path).toBe("$.id");
  });

  it("field.optional when a required field is only sometimes present", () => {
    const change = only(object({ id: field(INTEGER) }), object({ id: field(literal(1), true) }));
    expect(change.code).toBe<ChangeCode>("field.optional");
    expect(change.severity).toBe("breaking");
    expect(change.observed).toBe("integer | absent");
  });

  it("field.added when the response carries an undescribed field", () => {
    const change = only(object({}), object({ extra: field(literal("x")) }));
    expect(change.code).toBe<ChangeCode>("field.added");
    expect(change.severity).toBe("additive");
    expect(change.expected).toBe("absent");
    expect(change.observed).toBe("string");
  });

  it("type.changed when the type is not assignable", () => {
    const change = only(object({ id: field(INTEGER) }), object({ id: field(literal("x")) }));
    expect(change.code).toBe<ChangeCode>("type.changed");
    expect(change.severity).toBe("breaking");
  });

  it("null.added when an unexpected null appears", () => {
    const change = only(
      object({ a: field(STRING) }),
      object({ a: field(union([literal("x"), NULL])) }),
    );
    expect(change.code).toBe<ChangeCode>("null.added");
    expect(change.expected).toBe("string");
    expect(change.observed).toBe("string | null");
  });

  it("enum.value.added when a value falls outside the enum", () => {
    const expected = object({ role: field(union([literal("admin"), literal("member")])) });
    const observed = object({ role: field(union([literal("admin"), literal("owner")])) });
    const change = only(expected, observed);
    expect(change.code).toBe<ChangeCode>("enum.value.added");
    expect(change.expected).toBe('"admin" | "member"');
    expect(change.observed).toBe('"admin" | "owner"');
  });

  it("array.changed when an array and a scalar swap", () => {
    expect(only(array(STRING), STRING).code).toBe<ChangeCode>("array.changed");
    expect(only(STRING, array(STRING)).code).toBe<ChangeCode>("array.changed");
  });

  it("field.unobserved (info) when an optional field has not appeared", () => {
    const change = only(object({ nick: field(STRING, true) }), object({}));
    expect(change.code).toBe<ChangeCode>("field.unobserved");
    expect(change.severity).toBe("info");
  });

  it("union.branch.unobserved (info) when a branch has not appeared", () => {
    const change = only(union([STRING, NULL]), literal("x"));
    expect(change.code).toBe<ChangeCode>("union.branch.unobserved");
    expect(change.severity).toBe("info");
    expect(change.expected).toBe("null");
  });
});

describe("diff — what must NOT produce a change (HANDOFF 10)", () => {
  it("stays silent when only the value changed", () => {
    expect(diff(STRING, literal("a"))).toEqual([]);
    expect(diff(object({ a: field(STRING) }), object({ a: field(literal("zzz")) }))).toEqual([]);
  });

  it("stays silent for an open object receiving extra fields", () => {
    expect(diff(object({}, true), object({ extra: field(literal("x")) }))).toEqual([]);
  });

  it("stays silent when nothing was observed", () => {
    expect(diff(object({ id: field(INTEGER) }), UNKNOWN)).toEqual([]);
    expect(diff(array(STRING), array(UNKNOWN))).toEqual([]);
  });

  it("accepts an integer where a number is expected", () => {
    expect(diff(NUMBER, literal(3))).toEqual([]);
  });
});

describe("diff — literal re-widening for display (HANDOFF 6.3)", () => {
  it("widens the observed side when expected has no literals", () => {
    const change = only(
      object({ a: field(STRING) }),
      object({ a: field(union([literal("x"), NULL])) }),
    );
    expect(change.observed).toBe("string | null");
  });

  it("keeps literals when expected is an enum", () => {
    const expected = object({ a: field(union([literal("x"), literal("y")])) });
    const observed = object({ a: field(literal("z")) });
    expect(only(expected, observed).observed).toBe('"z"');
  });
});

describe("diff — paths", () => {
  it("marks array traversal with []", () => {
    const expected = object({ data: field(array(object({ email: field(STRING) }))) });
    const observed = object({ data: field(array(object({ email: field(NULL) }))) });
    expect(only(expected, observed).path).toBe("$.data[].email");
  });
});

describe("assignable", () => {
  it("requires every observed union member to fit", () => {
    expect(assignable(union([literal("a"), NULL]), STRING)).toBe(false);
    expect(assignable(union([literal("a"), literal("b")]), STRING)).toBe(true);
  });

  it("accepts anything against unknown, in either direction", () => {
    expect(assignable(STRING, UNKNOWN)).toBe(true);
    expect(assignable(UNKNOWN, STRING)).toBe(true);
  });

  it("separates booleans from strings", () => {
    expect(assignable(BOOLEAN, STRING)).toBe(false);
  });
});

describe("isBreaking", () => {
  it("is true only when a breaking change is present", () => {
    expect(isBreaking(diff(object({ nick: field(STRING, true) }), object({})))).toBe(false);
    expect(isBreaking(diff(object({ id: field(INTEGER) }), object({})))).toBe(true);
  });
});

describe("diff — end to end through infer", () => {
  it("reports nothing for a payload that matches", () => {
    const expected = object({ id: field(INTEGER), tags: field(array(STRING)) });
    expect(diff(expected, infer({ id: 1, tags: ["a", "b"] }))).toEqual([]);
  });

  it("catches drift introduced by real JSON", () => {
    const expected = object({ id: field(INTEGER) });
    expect(codes(expected, infer({ id: null }))).toEqual(["null.added"]);
  });
});
