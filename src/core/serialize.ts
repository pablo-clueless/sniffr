import { array, field, literal, object, primitive, union } from "./shape.js";
import type { Field, PrimitiveType, Shape } from "./shape.js";

const PRIMITIVES = new Set<string>(["string", "number", "integer", "boolean", "null", "unknown"]);

// Key order and union member order are both incidental to a Shape's meaning, so
// canonical() sorts them. Two shapes that mean the same thing must hash alike,
// or a reload would look like drift.
export const canonical = (shape: Shape): string => {
  switch (shape.kind) {
    case "primitive":
      return `p:${shape.type}`;
    case "literal":
      return `l:${JSON.stringify(shape.value)}`;
    case "array":
      return `a[${canonical(shape.item)}]`;
    case "object": {
      const fields = Object.keys(shape.fields)
        .toSorted()
        .map((key) => {
          const entry = shape.fields[key] as Field;
          return `${JSON.stringify(key)}${entry.optional ? "?" : ""}:${canonical(entry.shape)}`;
        });
      return `o{${fields.join(",")}}${shape.open ? "+" : ""}`;
    }
    case "union":
      return `u(${shape.members.map(canonical).toSorted().join("|")})`;
  }
};

const FNV_OFFSET = 2_166_136_261;
const FNV_PRIME = 16_777_619;

export const hash = (text: string): string => {
  let value = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, FNV_PRIME);
  }
  return (value >>> 0).toString(36);
};

export const hashShape = (shape: Shape): string => hash(canonical(shape));

export const hashSchemas = (schemas: Readonly<Record<string, Shape>>): string =>
  hash(
    Object.keys(schemas)
      .toSorted()
      .map((key) => `${key}=${canonical(schemas[key] as Shape)}`)
      .join(";"),
  );

// Anything read back out of storage is untrusted: it may predate a rename, or
// have been hand-edited. Reject rather than let a malformed shape reach diff().
export const parseShape = (value: unknown): Shape | null => {
  if (!value || typeof value !== "object") return null;
  const node = value as Record<string, unknown>;

  switch (node.kind) {
    case "primitive":
      return typeof node.type === "string" && PRIMITIVES.has(node.type)
        ? primitive(node.type as PrimitiveType)
        : null;
    case "literal": {
      const kind = typeof node.value;
      if (kind !== "string" && kind !== "number" && kind !== "boolean") return null;
      return literal(node.value as string | number | boolean);
    }
    case "array": {
      const item = parseShape(node.item);
      return item ? array(item) : null;
    }
    case "object": {
      if (!node.fields || typeof node.fields !== "object") return null;
      const fields: Record<string, Field> = {};
      for (const [key, raw] of Object.entries(node.fields as Record<string, unknown>)) {
        if (!raw || typeof raw !== "object") return null;
        const entry = raw as { shape?: unknown; optional?: unknown };
        const shape = parseShape(entry.shape);
        if (!shape) return null;
        fields[key] = field(shape, entry.optional === true);
      }
      return object(fields, node.open === true);
    }
    case "union": {
      if (!Array.isArray(node.members)) return null;
      const members: Shape[] = [];
      for (const raw of node.members) {
        const member = parseShape(raw);
        if (!member) return null;
        members.push(member);
      }
      return members.length > 0 ? union(members) : null;
    }
    default:
      return null;
  }
};
