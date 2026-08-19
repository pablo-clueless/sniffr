import { baseType, hasLiterals, isNull, isUnknown, render, union, widenLiterals } from "./shape.js";
import type { Shape } from "./shape.js";

export type Severity = "breaking" | "additive" | "info";

export type ChangeCode =
  | "field.removed"
  | "field.optional"
  | "field.added"
  | "type.changed"
  | "null.added"
  | "enum.value.added"
  | "array.changed"
  | "field.unobserved"
  | "union.branch.unobserved";

export type Side = "request" | "response";

export type Change = {
  readonly path: string;
  // absent means response; only request diffs are tagged, so a response change
  // stays byte-identical to what it was before request bodies existed
  readonly side?: Side;
  readonly code: ChangeCode;
  readonly severity: Severity;
  readonly expected: string;
  readonly observed: string;
};

export const ABSENT = "absent";

export const assignable = (observed: Shape, expected: Shape): boolean => {
  if (isUnknown(expected) || isUnknown(observed)) return true;
  if (observed.kind === "union") return observed.members.every((m) => assignable(m, expected));
  if (expected.kind === "union") return expected.members.some((m) => assignable(observed, m));

  switch (expected.kind) {
    case "literal":
      return observed.kind === "literal" && Object.is(observed.value, expected.value);
    case "primitive": {
      const type =
        observed.kind === "literal"
          ? baseType(observed.value)
          : observed.kind === "primitive"
            ? observed.type
            : null;
      if (type === null) return false;
      if (expected.type === "number") return type === "number" || type === "integer";
      return type === expected.type;
    }
    case "array":
      return observed.kind === "array" && assignable(observed.item, expected.item);
    case "object":
      return observed.kind === "object";
    default:
      return false;
  }
};

const flatten = (s: Shape): readonly Shape[] => (s.kind === "union" ? s.members : [s]);

const classify = (expected: Shape, observed: Shape): ChangeCode => {
  const observedMembers = flatten(observed);
  if (observedMembers.some(isNull) && !flatten(expected).some(isNull)) return "null.added";
  if (hasLiterals(expected) && observedMembers.some((m) => m.kind === "literal")) {
    return "enum.value.added";
  }
  if (expected.kind === "array" || observed.kind === "array") return "array.changed";
  return "type.changed";
};

const display = (expected: Shape, observed: Shape): string =>
  render(hasLiterals(expected) ? observed : widenLiterals(observed));

const unobservedBranches = (expected: Shape, observed: Shape, path: string): Change[] => {
  if (expected.kind !== "union") return [];
  const seen = flatten(observed);
  const missing = expected.members.filter((branch) => !seen.some((m) => assignable(m, branch)));
  if (missing.length === 0) return [];
  return [
    {
      path,
      code: "union.branch.unobserved",
      severity: "info",
      expected: render(union(missing)),
      observed: ABSENT,
    },
  ];
};

const diffObjects = (
  expected: Extract<Shape, { kind: "object" }>,
  observed: Extract<Shape, { kind: "object" }>,
  path: string,
): Change[] => {
  const changes: Change[] = [];

  for (const [key, want] of Object.entries(expected.fields)) {
    const got = observed.fields[key];
    const childPath = `${path}.${key}`;

    if (!got) {
      changes.push({
        path: childPath,
        code: want.optional ? "field.unobserved" : "field.removed",
        severity: want.optional ? "info" : "breaking",
        expected: render(want.shape),
        observed: ABSENT,
      });
      continue;
    }

    if (got.optional && !want.optional) {
      changes.push({
        path: childPath,
        code: "field.optional",
        severity: "breaking",
        expected: render(want.shape),
        observed: `${display(want.shape, got.shape)} | ${ABSENT}`,
      });
    }

    changes.push(...diff(want.shape, got.shape, childPath));
  }

  if (!expected.open) {
    for (const [key, got] of Object.entries(observed.fields)) {
      if (expected.fields[key]) continue;
      changes.push({
        path: `${path}.${key}`,
        code: "field.added",
        severity: "additive",
        expected: ABSENT,
        observed: render(widenLiterals(got.shape)),
      });
    }
  }

  return changes;
};

export const diff = (expected: Shape, observed: Shape, path = "$"): Change[] => {
  if (isUnknown(observed) || isUnknown(expected)) return [];
  if (expected.kind === "object" && observed.kind === "object") {
    return diffObjects(expected, observed, path);
  }
  if (expected.kind === "array" && observed.kind === "array") {
    return diff(expected.item, observed.item, `${path}[]`);
  }
  if (assignable(observed, expected)) return unobservedBranches(expected, observed, path);

  return [
    {
      path,
      code: classify(expected, observed),
      severity: "breaking",
      expected: render(expected),
      observed: display(expected, observed),
    },
  ];
};

export const asRequest = (changes: readonly Change[]): Change[] =>
  changes.map((change) => ({ ...change, side: "request" as const }));

export const isBreaking = (changes: readonly Change[]): boolean =>
  changes.some((c) => c.severity === "breaking");
