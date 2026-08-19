import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { analyze } from "../src/ci/analyze.js";
import { isHar, samplesFromFixture, samplesFromHar } from "../src/ci/har.js";
import { parseArgs, run } from "../src/ci/cli.js";
import { renderJson, renderReport } from "../src/ci/report.js";
import { loadSamples } from "../src/ci/sources.js";

const HAR = "test/fixtures/users.har";
const SCHEMAS = "test/fixtures/schemas.mjs";

const schemas = {
  "GET /api/users": z.object({
    data: z.array(
      z.object({
        id: z.number().int(),
        email: z.string(),
        role: z.enum(["admin", "member"]),
        nickname: z.string().optional(),
      }),
    ),
  }),
};

describe("har parsing", () => {
  it("recognises a HAR by its log.entries", () => {
    expect(isHar({ log: { entries: [] } })).toBe(true);
    expect(isHar({ url: "/api/users" })).toBe(false);
    expect(isHar(null)).toBe(false);
  });

  it("keeps only JSON responses", async () => {
    const { samples } = await loadSamples([HAR]);
    expect(samples).toHaveLength(3);
    expect(samples.every((sample) => sample.body !== undefined)).toBe(true);
  });

  it("decodes a base64 body", async () => {
    const { samples } = await loadSamples([HAR]);
    const health = samples.find((sample) => sample.url.includes("health"));
    expect(health?.body).toEqual({ ok: true });
  });

  it("defaults a missing method and status", () => {
    const samples = samplesFromHar({
      log: {
        entries: [
          {
            request: { url: "/a" },
            response: { content: { mimeType: "application/json", text: "{}" } },
          },
        ],
      },
    });
    expect(samples[0]).toMatchObject({ method: "GET", status: 200 });
  });

  it("ignores an entry whose body is not parseable", () => {
    const samples = samplesFromHar({
      log: {
        entries: [
          {
            request: { url: "/a" },
            response: { content: { mimeType: "application/json", text: "nope" } },
          },
        ],
      },
    });
    expect(samples).toHaveLength(0);
  });
});

describe("fixture parsing", () => {
  it("reads a single fixture and an array of them", () => {
    expect(samplesFromFixture({ url: "/a", body: { x: 1 } })).toHaveLength(1);
    expect(samplesFromFixture([{ url: "/a" }, { url: "/b" }])).toHaveLength(2);
  });

  it("skips anything without a url", () => {
    expect(samplesFromFixture({ body: { x: 1 } })).toHaveLength(0);
  });
});

describe("analyze", () => {
  it("groups samples by normalised route and merges them", async () => {
    const { samples } = await loadSamples([HAR]);
    const analysis = analyze(samples, { schemas });
    const users = analysis.endpoints.find((endpoint) => endpoint.route === "/api/users");

    expect(users?.samples).toBe(2);
    expect(users?.changes.map((change) => change.code)).toEqual([
      "null.added",
      "enum.value.added",
      "field.unobserved",
      "field.added",
    ]);
  });

  it("counts severities across endpoints", async () => {
    const { samples } = await loadSamples([HAR]);
    const analysis = analyze(samples, { schemas });
    expect(analysis.breaking).toBe(2);
    expect(analysis.additive).toBe(1);
    expect(analysis.info).toBe(1);
  });

  it("reports an endpoint with no schema rather than inventing changes", async () => {
    const { samples } = await loadSamples([HAR]);
    const analysis = analyze(samples, {});
    expect(analysis.breaking).toBe(0);
    expect(analysis.endpoints.every((endpoint) => endpoint.expected === null)).toBe(true);
  });

  it("names schemas that never saw a response", () => {
    const analysis = analyze([{ method: "GET", url: "/api/users", status: 200, body: {} }], {
      schemas: { "GET /api/orders": z.object({}) },
    });
    expect(analysis.unmatched).toEqual(["GET /api/orders"]);
  });

  it("honours explicit route patterns", () => {
    const analysis = analyze(
      [{ method: "GET", url: "/api/posts/hello-world-post", status: 200, body: {} }],
      { routes: ["/api/posts/:slug"] },
    );
    expect(analysis.endpoints[0]!.route).toBe("/api/posts/:slug");
  });
});

describe("report", () => {
  it("names the exact path of a breaking change", async () => {
    const { samples } = await loadSamples([HAR]);
    const text = renderReport(analyze(samples, { schemas }));

    expect(text).toContain("GET /api/users");
    expect(text).toContain("$.data[].email");
    expect(text).toContain("string -> string | null");
    expect(text).toContain("2 breaking changes, 1 additive, 1 info");
  });

  it("emits machine-readable json", async () => {
    const { samples } = await loadSamples([HAR]);
    const parsed = JSON.parse(renderJson(analyze(samples, { schemas }))) as {
      breaking: number;
      endpoints: { route: string; changes: { path: string }[] }[];
    };
    expect(parsed.breaking).toBe(2);
    expect(parsed.endpoints.some((e) => e.changes.some((c) => c.path === "$.data[].email"))).toBe(
      true,
    );
  });
});

describe("parseArgs", () => {
  it("collects paths, flags and options", () => {
    const args = parseArgs(["a.har", "--schemas", "s.mjs", "--routes", "/a/:id,/b/:id", "--json"]);
    expect(args).toMatchObject({
      paths: ["a.har"],
      schemas: "s.mjs",
      routes: ["/a/:id", "/b/:id"],
      json: true,
    });
  });

  it("rejects an unknown option", () => {
    expect(() => parseArgs(["--nope"])).toThrow("unknown option: --nope");
  });
});

describe("run — exit codes (task 3.1 acceptance)", () => {
  let out: string[] = [];

  beforeEach(() => {
    out = [];
    vi.spyOn(console, "log").mockImplementation((line: unknown) => {
      out.push(String(line));
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation((line: unknown) => {
      out.push(String(line));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exits 1 and names the exact path when a breaking change is found", async () => {
    const code = await run([HAR, "--schemas", SCHEMAS]);
    expect(code).toBe(1);
    expect(out.join("\n")).toContain("$.data[].email");
  });

  it("exits 0 when there are no schemas to break", async () => {
    expect(await run([HAR])).toBe(0);
  });

  it("exits 2 with usage when given no paths", async () => {
    expect(await run([])).toBe(2);
    expect(out.join("\n")).toContain("Usage:");
  });

  it("exits 0 for --help", async () => {
    expect(await run(["--help"])).toBe(0);
  });

  it("exits 2 when nothing readable was found", async () => {
    expect(await run(["test/fixtures/schemas.mjs"])).toBe(2);
  });
});
