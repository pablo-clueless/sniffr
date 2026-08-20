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
} from "./shape.js";
import type { Field, LiteralValue, Shape } from "./shape.js";

const MAX_DEPTH = 24;

type Node = Record<string, unknown>;

const OPTIONAL_TYPES = new Set(["optional", "exact_optional", "nullish", "undefinedable"]);

const UNWRAP_TYPES = new Set([
  "optional",
  "exact_optional",
  "undefinedable",
  "non_optional",
  "non_nullable",
  "non_nullish",
  "readonly",
  "lazy",
]);

const OPEN_OBJECTS = new Set(["loose_object", "object_with_rest", "record", "map"]);

// Valibot schemas are plain objects: { kind: "schema", type: "string", ... }.
// That `kind` is what separates them from a zod schema and from an already
// compiled Shape, so detection stays structural — no valibot import.
export const isValibotSchema = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const node = value as Node;
  return node.kind === "schema" && typeof node.type === "string";
};

const literalOf = (value: unknown): Shape => {
  if (value === null) return NULL;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return literal(value as LiteralValue);
  }
  return UNKNOWN;
};

// v.pipe(v.number(), v.integer()) keeps its actions in `pipe`; the schema itself
// still reports type "number".
const isInteger = (node: Node): boolean => {
  const pipe = node.pipe;
  if (!Array.isArray(pipe)) return false;
  return pipe.some((action) => {
    if (!action || typeof action !== "object") return false;
    const type = (action as Node).type;
    return type === "integer" || type === "safe_integer";
  });
};

const wrappedOf = (node: Node): unknown => node.wrapped ?? node.default;

export const isOptionalValibotSchema = (value: unknown): boolean => {
  if (!isValibotSchema(value)) return false;
  const node = value as Node;
  const type = node.type as string;
  if (OPTIONAL_TYPES.has(type)) return true;
  if (type === "nullable" || type === "readonly") return isOptionalValibotSchema(node.wrapped);
  return false;
};

const entriesOf = (node: Node): Record<string, unknown> => {
  const entries = node.entries;
  return entries && typeof entries === "object" ? (entries as Record<string, unknown>) : {};
};

const mergeObjects = (shapes: readonly Shape[]): Shape => {
  const fields: Record<string, Field> = {};
  let open = false;
  let sawObject = false;

  for (const shape of shapes) {
    if (shape.kind !== "object") continue;
    sawObject = true;
    open ||= shape.open;
    for (const [key, entry] of Object.entries(shape.fields)) fields[key] = entry;
  }
  return sawObject ? object(fields, open) : (shapes[0] ?? UNKNOWN);
};

export const fromValibot = (schema: unknown, depth = 0): Shape => {
  if (depth >= MAX_DEPTH) return UNKNOWN;
  if (!isValibotSchema(schema)) return UNKNOWN;

  const node = schema as Node;
  const inner = (value: unknown): Shape => fromValibot(value, depth + 1);

  switch (node.type as string) {
    case "string":
    case "date":
    case "blob":
    case "file":
      return STRING;
    case "number":
      return isInteger(node) ? INTEGER : NUMBER;
    case "bigint":
      return INTEGER;
    case "nan":
      return NUMBER;
    case "boolean":
      return BOOLEAN;
    case "null":
      return NULL;
    case "any":
    case "unknown":
    case "undefined":
    case "void":
    case "never":
    case "symbol":
    case "promise":
    case "custom":
      return UNKNOWN;
    case "literal":
      return literalOf(node.literal);
    case "picklist":
      return Array.isArray(node.options) ? union(node.options.map(literalOf)) : UNKNOWN;
    case "enum": {
      const values = node.enum;
      if (Array.isArray(node.options)) return union(node.options.map(literalOf));
      if (values && typeof values === "object") {
        return union(Object.values(values as Record<string, unknown>).map(literalOf));
      }
      return UNKNOWN;
    }
    case "array":
    case "set":
      return array(inner(node.item));
    case "tuple":
    case "tuple_with_rest":
    case "loose_tuple":
    case "strict_tuple":
      return Array.isArray(node.items) ? array(union(node.items.map(inner))) : array(UNKNOWN);
    case "object":
    case "strict_object":
    case "loose_object":
    case "object_with_rest": {
      const fields: Record<string, Field> = {};
      for (const [key, value] of Object.entries(entriesOf(node))) {
        fields[key] = field(inner(value), isOptionalValibotSchema(value));
      }
      return object(fields, OPEN_OBJECTS.has(node.type as string));
    }
    case "record":
    case "map":
      return object({}, true);
    case "union":
    case "variant":
      return Array.isArray(node.options) ? union(node.options.map(inner)) : UNKNOWN;
    case "intersect":
      return Array.isArray(node.options) ? mergeObjects(node.options.map(inner)) : UNKNOWN;
    case "nullable":
      return union([inner(node.wrapped), NULL]);
    case "nullish":
      return union([inner(node.wrapped), NULL]);
    case "lazy": {
      const getter = node.getter;
      if (typeof getter !== "function") return UNKNOWN;
      try {
        return inner((getter as (input: unknown) => unknown)(undefined));
      } catch {
        return UNKNOWN;
      }
    }
    default:
      return UNWRAP_TYPES.has(node.type as string) ? inner(wrappedOf(node)) : UNKNOWN;
  }
};
