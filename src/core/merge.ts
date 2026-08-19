import type { Field, Shape } from "./shape.js";
import {
  INTEGER,
  NUMBER,
  STRING,
  array,
  equals,
  field,
  isUnknown,
  object,
  union,
} from "./shape.js";

export const ENUM_CARDINALITY_CAP = 12;

const countLiterals = (members: readonly Shape[], type: "string" | "number"): number =>
  members.filter((m) => m.kind === "literal" && typeof m.value === type).length;

const capped = (s: Shape): Shape => {
  if (s.kind !== "union") return s;
  const strings = countLiterals(s.members, "string");
  const numbers = countLiterals(s.members, "number");
  if (strings <= ENUM_CARDINALITY_CAP && numbers <= ENUM_CARDINALITY_CAP) return s;
  return union(
    s.members.map((m) => {
      if (m.kind !== "literal") return m;
      if (typeof m.value === "string") return strings > ENUM_CARDINALITY_CAP ? STRING : m;
      if (typeof m.value === "number") {
        if (numbers <= ENUM_CARDINALITY_CAP) return m;
        return Number.isInteger(m.value) ? INTEGER : NUMBER;
      }
      return m;
    }),
  );
};

const mergeObjects = (
  a: Extract<Shape, { kind: "object" }>,
  b: Extract<Shape, { kind: "object" }>,
): Shape => {
  const fields: Record<string, Field> = {};
  for (const key of new Set([...Object.keys(a.fields), ...Object.keys(b.fields)])) {
    const fa = a.fields[key];
    const fb = b.fields[key];
    if (fa && fb) fields[key] = field(merge(fa.shape, fb.shape), fa.optional || fb.optional);
    else if (fa) fields[key] = field(fa.shape, true);
    else if (fb) fields[key] = field(fb.shape, true);
  }
  return object(fields, a.open || b.open);
};

const absorb = (members: readonly Shape[], s: Shape): Shape[] => {
  if (s.kind === "object" || s.kind === "array") {
    const index = members.findIndex((m) => m.kind === s.kind);
    const existing = members[index];
    if (existing) {
      const next = [...members];
      next[index] = merge(existing, s);
      return next;
    }
  }
  return [...members, s];
};

const mergeInner = (a: Shape, b: Shape): Shape => {
  if (isUnknown(a)) return b;
  if (isUnknown(b)) return a;
  if (a.kind === "array" && b.kind === "array") return array(merge(a.item, b.item));
  if (a.kind === "object" && b.kind === "object") return mergeObjects(a, b);

  const left = a.kind === "union" ? [...a.members] : [a];
  const right = b.kind === "union" ? [...b.members] : [b];
  return capped(union(right.reduce(absorb, left)));
};

export const merge = (a: Shape, b: Shape): Shape => {
  if (a === b) return a;
  const result = mergeInner(a, b);
  return equals(a, result) ? a : result;
};
