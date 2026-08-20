import type { Field, LiteralValue, Shape } from "./shape.js";
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

const METHODS = ["get", "put", "post", "delete", "patch", "head", "options"] as const;

type Node = Record<string, unknown>;

const asNode = (value: unknown): Node | null =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Node) : null;

// "#/components/schemas/User" -> doc.components.schemas.User. Remote refs are
// not resolved: sniffr never fetches, so an unresolvable ref becomes unknown
// rather than a guess.
const resolveRef = (ref: string, document: Node | null): unknown => {
  if (!document || !ref.startsWith("#/")) return null;
  let current: unknown = document;
  for (const raw of ref.slice(2).split("/")) {
    const key = raw.replaceAll("~1", "/").replaceAll("~0", "~");
    const node = asNode(current);
    if (!node) return null;
    current = node[key];
  }
  return current;
};

const scalar = (type: string, format: unknown): Shape => {
  switch (type) {
    case "string":
      return STRING;
    case "integer":
      return INTEGER;
    case "number":
      return format === "int32" || format === "int64" ? INTEGER : NUMBER;
    case "boolean":
      return BOOLEAN;
    case "null":
      return NULL;
    default:
      return UNKNOWN;
  }
};

const literalOf = (value: unknown): Shape => {
  if (value === null) return NULL;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return literal(value as LiteralValue);
  }
  return UNKNOWN;
};

const isOpen = (node: Node): boolean => {
  const extra = node.additionalProperties;
  if (extra === undefined) return false;
  if (extra === false) return false;
  return true;
};

const objectShape = (node: Node, document: Node | null, depth: number): Shape => {
  const properties = asNode(node.properties) ?? {};
  const required = new Set(
    Array.isArray(node.required) ? node.required.filter((key) => typeof key === "string") : [],
  );

  const fields: Record<string, Field> = {};
  for (const [key, value] of Object.entries(properties)) {
    fields[key] = field(fromOpenApi(value, document, depth + 1), !required.has(key));
  }
  return object(fields, isOpen(node));
};

const mergeObjects = (shapes: readonly Shape[]): Shape => {
  const objects = shapes.filter((shape) => shape.kind === "object");
  if (objects.length === 0) return shapes[0] ?? UNKNOWN;

  const fields: Record<string, Field> = {};
  let open = false;
  for (const shape of objects) {
    if (shape.kind !== "object") continue;
    open ||= shape.open;
    for (const [key, entry] of Object.entries(shape.fields)) {
      const existing = fields[key];
      fields[key] = field(entry.shape, (existing?.optional ?? true) && entry.optional);
    }
  }
  return object(fields, open);
};

export const fromOpenApi = (schema: unknown, document?: unknown, depth = 0): Shape => {
  if (depth >= MAX_DEPTH) return UNKNOWN;
  const node = asNode(schema);
  if (!node) return UNKNOWN;

  const root = asNode(document) ?? null;

  if (typeof node.$ref === "string") {
    const resolved = resolveRef(node.$ref, root);
    return resolved ? fromOpenApi(resolved, root, depth + 1) : UNKNOWN;
  }

  if (node.const !== undefined) return literalOf(node.const);

  if (Array.isArray(node.enum) && node.enum.length > 0) {
    return union(node.enum.map(literalOf));
  }

  for (const key of ["oneOf", "anyOf"] as const) {
    const branches = node[key];
    if (Array.isArray(branches) && branches.length > 0) {
      const shape = union(branches.map((branch) => fromOpenApi(branch, root, depth + 1)));
      return node.nullable === true ? union([shape, NULL]) : shape;
    }
  }

  if (Array.isArray(node.allOf) && node.allOf.length > 0) {
    return mergeObjects(node.allOf.map((branch) => fromOpenApi(branch, root, depth + 1)));
  }

  // 3.1 allows type: ["string", "null"]; 3.0 spells the same thing nullable: true
  const types = Array.isArray(node.type)
    ? node.type.filter((value): value is string => typeof value === "string")
    : typeof node.type === "string"
      ? [node.type]
      : [];

  const withNull = (shape: Shape): Shape => (node.nullable === true ? union([shape, NULL]) : shape);

  if (types.length > 1) {
    return withNull(union(types.map((type) => fromOpenApi({ ...node, type }, root, depth + 1))));
  }

  const type = types[0];

  if (type === "array") {
    return withNull(array(fromOpenApi(node.items, root, depth + 1)));
  }

  if (type === "object" || node.properties !== undefined) {
    return withNull(objectShape(node, root, depth));
  }

  if (type === undefined) return UNKNOWN;
  return withNull(scalar(type, node.format));
};

export type OpenApiSchemas = Record<string, { request?: Shape; response?: Shape }>;

const jsonSchemaOf = (container: unknown): unknown => {
  const content = asNode(asNode(container)?.content);
  if (!content) return undefined;
  for (const [mime, entry] of Object.entries(content)) {
    if (!/\bapplication\/(\w+\+)?json\b/i.test(mime)) continue;
    const schema = asNode(entry)?.schema;
    if (schema !== undefined) return schema;
  }
  return undefined;
};

const successResponse = (responses: unknown): unknown => {
  const node = asNode(responses);
  if (!node) return undefined;

  const codes = Object.keys(node)
    .filter((code) => /^2\d\d$/.test(code))
    .toSorted();
  for (const code of [...codes, "default"]) {
    const schema = jsonSchemaOf(node[code]);
    if (schema !== undefined) return schema;
  }
  return undefined;
};

// OpenAPI templates paths as /users/{id}; sniffr normalises observed urls to
// /users/:id, so convert here or nothing would ever match.
export const routeFromTemplate = (path: string): string => path.replaceAll(/\{([^}]*)\}/g, ":$1");

export const schemasFromOpenApi = (document: unknown): OpenApiSchemas => {
  const root = asNode(document);
  const paths = asNode(root?.paths);
  if (!root || !paths) return {};

  const result: OpenApiSchemas = {};

  for (const [path, rawItem] of Object.entries(paths)) {
    const item = asNode(rawItem);
    if (!item) continue;

    for (const method of METHODS) {
      const operation = asNode(item[method]);
      if (!operation) continue;

      const responseSchema = successResponse(operation.responses);
      const requestSchema = jsonSchemaOf(operation.requestBody);
      if (responseSchema === undefined && requestSchema === undefined) continue;

      const sides: { request?: Shape; response?: Shape } = {};
      if (responseSchema !== undefined) sides.response = fromOpenApi(responseSchema, root);
      if (requestSchema !== undefined) sides.request = fromOpenApi(requestSchema, root);

      result[`${method.toUpperCase()} ${routeFromTemplate(path)}`] = sides;
    }
  }

  return result;
};
