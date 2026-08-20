import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { z } from "zod";

import { fromOpenApi, routeFromTemplate, schemasFromOpenApi } from "../src/core/from-openapi.js";
import { loadSamples } from "../src/ci/sources.js";
import { fromZod } from "../src/core/from-zod.js";
import { analyze } from "../src/ci/analyze.js";
import { render } from "../src/core/shape.js";

const shown = (schema: unknown, document?: unknown) => render(fromOpenApi(schema, document));

const spec = JSON.parse(await readFile("test/fixtures/openapi.json", "utf8")) as unknown;

describe("fromOpenApi — scalars", () => {
  it("maps the primitive types", () => {
    expect(shown({ type: "string" })).toBe("string");
    expect(shown({ type: "integer" })).toBe("integer");
    expect(shown({ type: "number" })).toBe("number");
    expect(shown({ type: "boolean" })).toBe("boolean");
    expect(shown({ type: "null" })).toBe("null");
  });

  it("treats an int-formatted number as an integer", () => {
    expect(shown({ type: "number", format: "int64" })).toBe("integer");
    expect(shown({ type: "number", format: "double" })).toBe("number");
  });

  it("returns unknown for anything untyped or unrecognised", () => {
    expect(shown({})).toBe("unknown");
    expect(shown({ type: "wat" })).toBe("unknown");
    expect(shown(null)).toBe("unknown");
    expect(shown("nope")).toBe("unknown");
  });
});

describe("fromOpenApi — nullability, both spellings", () => {
  it("reads 3.0 nullable", () => {
    expect(shown({ type: "string", nullable: true })).toBe("string | null");
  });

  it("reads 3.1 type arrays", () => {
    expect(shown({ type: ["string", "null"] })).toBe("string | null");
  });

  it("applies nullable to arrays and objects too", () => {
    expect(shown({ type: "array", items: { type: "string" }, nullable: true })).toBe(
      "string[] | null",
    );
    expect(shown({ type: "object", properties: {}, nullable: true })).toBe("{} | null");
  });
});

describe("fromOpenApi — enums and consts", () => {
  it("maps an enum to a union of literals", () => {
    expect(shown({ type: "string", enum: ["admin", "member"] })).toBe('"admin" | "member"');
  });

  it("keeps a null enum member as null", () => {
    expect(shown({ enum: ["a", null] })).toBe('"a" | null');
  });

  it("maps const", () => {
    expect(shown({ const: "fixed" })).toBe('"fixed"');
  });
});

describe("fromOpenApi — composition", () => {
  it("unions oneOf and anyOf", () => {
    expect(shown({ oneOf: [{ type: "string" }, { type: "integer" }] })).toBe("string | integer");
    expect(shown({ anyOf: [{ type: "string" }, { type: "null" }] })).toBe("string | null");
  });

  it("merges allOf objects, keeping a field required if either side requires it", () => {
    const shape = shown({
      allOf: [
        { type: "object", required: ["a"], properties: { a: { type: "string" } } },
        { type: "object", properties: { b: { type: "integer" } } },
      ],
    });
    expect(shape).toBe("{ a: string; b?: integer }");
  });
});

describe("fromOpenApi — objects", () => {
  it("marks anything outside `required` as optional", () => {
    expect(
      shown({
        type: "object",
        required: ["id"],
        properties: { id: { type: "integer" }, nick: { type: "string" } },
      }),
    ).toBe("{ id: integer; nick?: string }");
  });

  it("treats additionalProperties as an open object", () => {
    expect(shown({ type: "object", properties: {}, additionalProperties: true })).toBe("{ ... }");
    expect(shown({ type: "object", properties: {}, additionalProperties: false })).toBe("{}");
    expect(shown({ type: "object", properties: {} })).toBe("{}");
  });

  it("infers an object from properties alone", () => {
    expect(shown({ properties: { a: { type: "string" } } })).toBe("{ a?: string }");
  });
});

describe("fromOpenApi — $ref", () => {
  it("resolves a local ref", () => {
    expect(shown({ $ref: "#/components/schemas/User" }, spec)).toBe(
      '{ id: integer; email: string; role: "admin" | "member"; nickname?: string }',
    );
  });

  it("returns unknown for a ref it cannot resolve", () => {
    expect(shown({ $ref: "#/components/schemas/Nope" }, spec)).toBe("unknown");
    expect(shown({ $ref: "https://example.com/User.json" }, spec)).toBe("unknown");
  });

  it("does not hang on a circular ref", () => {
    const node: Record<string, unknown> = { type: "object", properties: {} };
    (node.properties as Record<string, unknown>).self = { $ref: "#/components/schemas/Node" };
    const circular = { components: { schemas: { Node: node } } };

    expect(() => fromOpenApi({ $ref: "#/components/schemas/Node" }, circular)).not.toThrow();
  });
});

describe("routeFromTemplate", () => {
  it("rewrites OpenAPI templating into sniffr's param form", () => {
    expect(routeFromTemplate("/api/users/{id}")).toBe("/api/users/:id");
    expect(routeFromTemplate("/a/{x}/b/{y}")).toBe("/a/:x/b/:y");
    expect(routeFromTemplate("/api/users")).toBe("/api/users");
  });
});

describe("schemasFromOpenApi", () => {
  it("keys operations the way the store does", () => {
    expect(Object.keys(schemasFromOpenApi(spec)).toSorted()).toEqual([
      "GET /api/health",
      "GET /api/users",
      "GET /api/users/:id",
      "POST /api/users",
    ]);
  });

  it("picks up both sides of an operation", () => {
    const post = schemasFromOpenApi(spec)["POST /api/users"];
    expect(render(post!.request!)).toContain("email: string");
    expect(render(post!.response!)).toContain("id: integer");
  });

  it("takes the lowest 2xx response", () => {
    const sides = schemasFromOpenApi({
      paths: {
        "/a": {
          get: {
            responses: {
              "204": { content: { "application/json": { schema: { type: "integer" } } } },
              "200": { content: { "application/json": { schema: { type: "string" } } } },
            },
          },
        },
      },
    });
    expect(render(sides["GET /a"]!.response!)).toBe("string");
  });

  it("ignores operations with no JSON schema", () => {
    expect(
      schemasFromOpenApi({
        paths: { "/a": { get: { responses: { "200": { content: { "text/html": {} } } } } } },
      }),
    ).toEqual({});
  });

  it("returns nothing for a document with no paths", () => {
    expect(schemasFromOpenApi({})).toEqual({});
    expect(schemasFromOpenApi(null)).toEqual({});
  });
});

describe("an adapter, not an engine change (HANDOFF 4)", () => {
  it("compiles to the same Shape zod does for the same contract", () => {
    const fromSpec = schemasFromOpenApi(spec)["GET /api/health"]!.response!;
    const fromSchema = fromZod(z.object({ ok: z.boolean() }));
    expect(fromSpec).toEqual(fromSchema);
  });

  it("finds the same drift in the same HAR as the zod schemas did", async () => {
    const { samples } = await loadSamples(["test/fixtures/users.har"]);
    const analysis = analyze(samples, { schemas: schemasFromOpenApi(spec) });

    expect(analysis.breaking).toBe(2);
    expect(analysis.additive).toBe(1);
    expect(analysis.info).toBe(1);

    const users = analysis.endpoints.find((endpoint) => endpoint.route === "/api/users");
    expect(users?.changes.map((change) => change.path)).toEqual([
      "$.data[].email",
      "$.data[].role",
      "$.data[].nickname",
      "$.data[].avatarUrl",
    ]);
  });
});
