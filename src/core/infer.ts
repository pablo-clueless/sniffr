import { UNKNOWN, NUMBER, INTEGER, BOOLEAN, NULL, array, field, literal, object } from "./shape.js";
import type { Field, Shape } from "./shape.js";
import { merge } from "./merge.js";

const MAX_DEPTH = 16;

export const infer = (value: unknown, depth = 0): Shape => {
  if (value === null) return NULL;
  if (depth >= MAX_DEPTH) return UNKNOWN;

  switch (typeof value) {
    case "string":
      return literal(value);
    case "boolean":
      return BOOLEAN;
    case "number":
      if (!Number.isFinite(value)) return NUMBER;
      return Number.isInteger(value) ? literal(value) : NUMBER;
    case "bigint":
      return INTEGER;
    case "object":
      break;
    default:
      return UNKNOWN;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return array(UNKNOWN);
    return array(value.reduce<Shape>((acc, item) => merge(acc, infer(item, depth + 1)), UNKNOWN));
  }

  const fields: Record<string, Field> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (child === undefined) continue;
    fields[key] = field(infer(child, depth + 1));
  }
  return object(fields);
};
