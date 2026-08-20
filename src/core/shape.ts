export type PrimitiveType = "string" | "number" | "integer" | "boolean" | "null" | "unknown";

export type LiteralValue = string | number | boolean;

export type Field = {
  readonly shape: Shape;
  readonly optional: boolean;
};

export type Shape =
  | { readonly kind: "primitive"; readonly type: PrimitiveType }
  | { readonly kind: "literal"; readonly value: LiteralValue }
  | { readonly kind: "array"; readonly item: Shape }
  | {
      readonly kind: "object";
      readonly fields: Readonly<Record<string, Field>>;
      readonly open: boolean;
    }
  | { readonly kind: "union"; readonly members: readonly Shape[] };

export const STRING: Shape = { kind: "primitive", type: "string" };
export const NUMBER: Shape = { kind: "primitive", type: "number" };
export const INTEGER: Shape = { kind: "primitive", type: "integer" };
export const BOOLEAN: Shape = { kind: "primitive", type: "boolean" };
export const NULL: Shape = { kind: "primitive", type: "null" };
export const UNKNOWN: Shape = { kind: "primitive", type: "unknown" };

export const primitive = (type: PrimitiveType): Shape => ({ kind: "primitive", type });

export const literal = (value: LiteralValue): Shape => ({ kind: "literal", value });

export const array = (item: Shape): Shape => ({ kind: "array", item });

export const object = (fields: Record<string, Field>, open = false): Shape => ({
  kind: "object",
  fields,
  open,
});

export const field = (shape: Shape, optional = false): Field => ({ shape, optional });

const KINDS = new Set(["primitive", "literal", "array", "object", "union"]);

export const isShape = (value: unknown): value is Shape =>
  !!value && typeof value === "object" && KINDS.has((value as { kind?: unknown }).kind as string);

export const isUnknown = (s: Shape): boolean => s.kind === "primitive" && s.type === "unknown";

export const isNull = (s: Shape): boolean => s.kind === "primitive" && s.type === "null";

export const baseType = (value: LiteralValue): PrimitiveType => {
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  return Number.isInteger(value) ? "integer" : "number";
};

export const union = (members: readonly Shape[]): Shape => {
  const flat: Shape[] = [];
  const push = (s: Shape): void => {
    if (s.kind === "union") {
      s.members.forEach(push);
      return;
    }
    if (flat.some((m) => equals(m, s))) return;
    flat.push(s);
  };
  members.forEach(push);
  if (flat.length === 0) return UNKNOWN;
  if (flat.length === 1) return flat[0] as Shape;
  if (flat.some(isUnknown)) return UNKNOWN;
  return { kind: "union", members: flat };
};

export const equals = (a: Shape, b: Shape): boolean => {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  if (a.kind === "primitive" && b.kind === "primitive") return a.type === b.type;
  if (a.kind === "literal" && b.kind === "literal") return Object.is(a.value, b.value);
  if (a.kind === "array" && b.kind === "array") return equals(a.item, b.item);
  if (a.kind === "object" && b.kind === "object") {
    if (a.open !== b.open) return false;
    const keys = Object.keys(a.fields);
    if (keys.length !== Object.keys(b.fields).length) return false;
    return keys.every((key) => {
      const fa = a.fields[key];
      const fb = b.fields[key];
      if (!fa || !fb) return false;
      return fa.optional === fb.optional && equals(fa.shape, fb.shape);
    });
  }
  if (a.kind === "union" && b.kind === "union") {
    if (a.members.length !== b.members.length) return false;
    return a.members.every((m) => b.members.some((n) => equals(m, n)));
  }
  return false;
};

export const hasLiterals = (s: Shape): boolean => {
  switch (s.kind) {
    case "literal":
      return true;
    case "array":
      return hasLiterals(s.item);
    case "object":
      return Object.values(s.fields).some((f) => hasLiterals(f.shape));
    case "union":
      return s.members.some(hasLiterals);
    default:
      return false;
  }
};

export const widenLiterals = (s: Shape): Shape => {
  switch (s.kind) {
    case "literal":
      return primitive(baseType(s.value));
    case "array":
      return array(widenLiterals(s.item));
    case "object": {
      const fields: Record<string, Field> = {};
      for (const [key, f] of Object.entries(s.fields)) {
        fields[key] = field(widenLiterals(f.shape), f.optional);
      }
      return object(fields, s.open);
    }
    case "union":
      return union(s.members.map(widenLiterals));
    default:
      return s;
  }
};

const needsParens = (s: Shape): boolean => s.kind === "union";

export const render = (s: Shape): string => {
  switch (s.kind) {
    case "primitive":
      return s.type;
    case "literal":
      return JSON.stringify(s.value);
    case "array":
      return needsParens(s.item) ? `(${render(s.item)})[]` : `${render(s.item)}[]`;
    case "object": {
      const entries = Object.entries(s.fields).map(
        ([key, f]) => `${key}${f.optional ? "?" : ""}: ${render(f.shape)}`,
      );
      if (s.open) entries.push("...");
      return entries.length === 0 ? "{}" : `{ ${entries.join("; ")} }`;
    }
    case "union": {
      const nulls = s.members.filter(isNull);
      const rest = s.members.filter((m) => !isNull(m));
      return [...rest, ...nulls].map(render).join(" | ");
    }
  }
};
