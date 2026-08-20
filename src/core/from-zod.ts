import type { Field, LiteralValue, Shape } from "./shape.js";
import { isShape } from "./shape.js";
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

const MAX_DEPTH = 24;

type Def = Record<string, unknown>;

const V3_KINDS: Record<string, string> = {
  ZodString: "string",
  ZodNumber: "number",
  ZodBigInt: "bigint",
  ZodBoolean: "boolean",
  ZodDate: "date",
  ZodSymbol: "symbol",
  ZodUndefined: "undefined",
  ZodNull: "null",
  ZodAny: "any",
  ZodUnknown: "unknown",
  ZodNever: "never",
  ZodVoid: "void",
  ZodNaN: "nan",
  ZodArray: "array",
  ZodObject: "object",
  ZodUnion: "union",
  ZodDiscriminatedUnion: "union",
  ZodIntersection: "intersection",
  ZodTuple: "tuple",
  ZodRecord: "record",
  ZodMap: "map",
  ZodSet: "set",
  ZodLiteral: "literal",
  ZodEnum: "enum",
  ZodNativeEnum: "enum",
  ZodOptional: "optional",
  ZodNullable: "nullable",
  ZodDefault: "default",
  ZodCatch: "catch",
  ZodBranded: "branded",
  ZodReadonly: "readonly",
  ZodPromise: "promise",
  ZodLazy: "lazy",
  ZodEffects: "effects",
  ZodPipeline: "pipe",
  ZodFunction: "custom",
};

const WRAPPER_KINDS = new Set([
  "nullable",
  "catch",
  "branded",
  "readonly",
  "promise",
  "lazy",
  "effects",
  "nonoptional",
]);

const isSchema = (value: unknown): boolean => {
  if (!value || typeof value !== "object") return false;
  const candidate = value as { _def?: unknown; def?: unknown };
  return typeof candidate._def === "object" || typeof candidate.def === "object";
};

const defOf = (schema: unknown): Def | null => {
  if (!isSchema(schema)) return null;
  const candidate = schema as { _def?: Def; def?: Def };
  return candidate._def ?? candidate.def ?? null;
};

const kindOf = (schema: unknown): string | null => {
  const def = defOf(schema);
  if (!def) return null;
  if (typeof def.type === "string") return def.type;
  if (typeof def.typeName === "string") return V3_KINDS[def.typeName] ?? null;
  return null;
};

const innerOf = (def: Def): unknown => {
  for (const key of ["innerType", "schema", "getter", "in", "type"]) {
    const candidate = def[key];
    if (key === "getter" && typeof candidate === "function") {
      try {
        return (candidate as () => unknown)();
      } catch {
        return null;
      }
    }
    if (isSchema(candidate)) return candidate;
  }
  return null;
};

const isIntegerNumber = (def: Def): boolean => {
  const checks = def.checks;
  if (!Array.isArray(checks)) return false;
  return checks.some((check: unknown) => {
    if (!check || typeof check !== "object") return false;
    const v3 = check as { kind?: string };
    if (v3.kind === "int") return true;
    const v4 =
      (check as { _zod?: { def?: { format?: string } }; def?: { format?: string } })._zod?.def ??
      (check as { def?: { format?: string } }).def;
    return typeof v4?.format === "string" && v4.format.includes("int");
  });
};

const isOpen = (def: Def): boolean => {
  const catchall = def.catchall;
  if (isSchema(catchall) && kindOf(catchall) !== "never") return true;
  return def.unknownKeys === "passthrough";
};

const shapeEntries = (def: Def): Record<string, unknown> => {
  const shape = typeof def.shape === "function" ? (def.shape as () => unknown)() : def.shape;
  return shape && typeof shape === "object" ? (shape as Record<string, unknown>) : {};
};

const literalValues = (def: Def): LiteralValue[] => {
  if (Array.isArray(def.values)) return def.values as LiteralValue[];
  if (def.value !== undefined) return [def.value as LiteralValue];
  return [];
};

const enumValues = (def: Def): LiteralValue[] => {
  const source = def.entries ?? def.values;
  if (Array.isArray(source)) return source as LiteralValue[];
  if (source && typeof source === "object") {
    return Object.values(source as Record<string, LiteralValue>).filter(
      (v) => typeof v === "string" || typeof v === "number",
    );
  }
  return [];
};

// Any adapter can hand in an already-compiled Shape; only zod needs reading.
export const toShape = (value: unknown): Shape => (isShape(value) ? value : fromZod(value));

// A schema entry is either a schema (the response, as it always was) or
// { request, response }. Both sides are optional in the object form.
export const schemaSides = (value: unknown): { request?: unknown; response?: unknown } => {
  if (isSchema(value)) return { response: value };
  if (value && typeof value === "object") {
    const pair = value as { request?: unknown; response?: unknown };
    if (pair.request !== undefined || pair.response !== undefined) return pair;
  }
  return { response: value };
};

export const isOptionalSchema = (schema: unknown): boolean => {
  const kind = kindOf(schema);
  if (!kind) return false;
  if (kind === "optional" || kind === "default" || kind === "prefault") return true;
  if (!WRAPPER_KINDS.has(kind)) return false;
  const def = defOf(schema);
  return def ? isOptionalSchema(innerOf(def)) : false;
};

export const fromZod = (schema: unknown, depth = 0): Shape => {
  if (depth >= MAX_DEPTH) return UNKNOWN;
  const def = defOf(schema);
  const kind = kindOf(schema);
  if (!def || !kind) return UNKNOWN;

  const inner = (value: unknown): Shape => fromZod(value, depth + 1);

  switch (kind) {
    case "string":
    case "date":
    case "symbol":
    case "template_literal":
      return STRING;
    case "number":
      return isIntegerNumber(def) ? INTEGER : NUMBER;
    case "int":
    case "bigint":
      return INTEGER;
    case "nan":
      return NUMBER;
    case "boolean":
    case "success":
      return BOOLEAN;
    case "null":
      return NULL;
    case "literal":
      return union(literalValues(def).map((v) => (v === null ? NULL : literal(v))));
    case "enum":
      return union(enumValues(def).map(literal));
    case "array":
      return array(inner(def.element ?? def.type));
    case "object": {
      const fields: Record<string, Field> = {};
      for (const [key, value] of Object.entries(shapeEntries(def))) {
        fields[key] = field(inner(value), isOptionalSchema(value));
      }
      return object(fields, isOpen(def));
    }
    case "union":
      return Array.isArray(def.options) ? union(def.options.map(inner)) : UNKNOWN;
    case "intersection": {
      const left = inner(def.left);
      const right = inner(def.right);
      if (left.kind !== "object" || right.kind !== "object") return left;
      return object({ ...left.fields, ...right.fields }, left.open || right.open);
    }
    case "tuple":
      return Array.isArray(def.items) ? array(union(def.items.map(inner))) : array(UNKNOWN);
    case "record":
      return object({}, true);
    case "nullable":
      return union([inner(innerOf(def)), NULL]);
    case "optional":
    case "nonoptional":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
    case "branded":
    case "promise":
    case "lazy":
    case "effects":
      return inner(innerOf(def));
    case "pipe": {
      const out = def.out;
      return kindOf(out) === "transform" ? inner(def.in) : inner(out);
    }
    default:
      return UNKNOWN;
  }
};
