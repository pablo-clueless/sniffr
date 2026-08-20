import { fromValibot, isValibotSchema } from "./from-valibot.js";
import { fromZod, isZodSchema } from "./from-zod.js";
import { isShape } from "./shape.js";
import type { Shape } from "./shape.js";

// The one place that decides where a declared contract came from. Adding a
// source of truth means a new adapter plus a line here — never a change to
// infer, merge or diff.
export const toShape = (value: unknown): Shape => {
  if (isShape(value)) return value;
  if (isValibotSchema(value)) return fromValibot(value);
  return fromZod(value);
};

export const isDeclaredSchema = (value: unknown): boolean =>
  isShape(value) || isValibotSchema(value) || isZodSchema(value);

// A schema entry is either a schema (the response, as it always was) or
// { request, response }. Both sides are optional in the object form.
export const schemaSides = (value: unknown): { request?: unknown; response?: unknown } => {
  if (isDeclaredSchema(value)) return { response: value };
  if (value && typeof value === "object") {
    const pair = value as { request?: unknown; response?: unknown };
    if (pair.request !== undefined || pair.response !== undefined) return pair;
  }
  return { response: value };
};
