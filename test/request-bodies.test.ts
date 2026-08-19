import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { analyze } from "../src/ci/analyze.js";
import { renderReport } from "../src/ci/report.js";
import { loadSamples } from "../src/ci/sources.js";
import { schemaSides } from "../src/core/from-zod.js";
import { intercept } from "../src/runtime/intercept.js";
import { sniffrStore } from "../src/runtime/store.js";
import type { Capture } from "../src/runtime/store.js";

const CreateUser = z.object({ email: z.string(), role: z.enum(["admin", "member"]) });
const User = z.object({ id: z.number().int(), email: z.string() });

const noop = () => {};

const model = () => sniffrStore.getState().models["POST /api/users"];

const post = (requestBody: unknown, body: unknown = { id: 1, email: "ada@example.com" }) => {
  sniffrStore.getState().record({
    method: "POST",
    url: "/api/users",
    status: 201,
    body,
    requestBody,
    at: Date.now(),
  });
};

beforeEach(() => {
  sniffrStore.setState({ models: {}, schemas: {}, requestSchemas: {}, routes: [], storage: null });
});

describe("schemaSides", () => {
  it("treats a bare schema as the response, as it always was", () => {
    const sides = schemaSides(User);
    expect(sides.response).toBe(User);
    expect(sides.request).toBeUndefined();
  });

  it("splits a { request, response } pair", () => {
    const sides = schemaSides({ request: CreateUser, response: User });
    expect(sides.request).toBe(CreateUser);
    expect(sides.response).toBe(User);
  });

  it("accepts a request-only entry", () => {
    expect(schemaSides({ request: CreateUser }).response).toBeUndefined();
  });
});

describe("store — request bodies", () => {
  it("models the request separately from the response", () => {
    sniffrStore.getState().registerSchemas({
      "POST /api/users": { request: CreateUser, response: User },
    });
    post({ email: "ada@example.com", role: "admin" });

    expect(model()?.request?.kind).toBe("object");
    // only "admin" was sent, so "member" is an unobserved branch — info, not louder
    expect(model()?.changes.every((change) => change.severity === "info")).toBe(true);
  });

  it("tags a request-side change so it is distinguishable", () => {
    sniffrStore.getState().registerSchemas({
      "POST /api/users": { request: CreateUser, response: User },
    });
    post({ email: "ada@example.com", role: "owner" });

    const changes = model()?.changes ?? [];
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      side: "request",
      code: "enum.value.added",
      path: "$.role",
    });
  });

  it("leaves response changes untagged", () => {
    sniffrStore.getState().registerSchemas({ "POST /api/users": { response: User } });
    post(undefined, { id: null, email: "ada@example.com" });

    expect(model()?.changes[0]?.side).toBeUndefined();
  });

  it("reports both sides at once", () => {
    sniffrStore.getState().registerSchemas({
      "POST /api/users": { request: CreateUser, response: User },
    });
    post({ email: "ada@example.com", role: "owner", extra: 1 }, { id: null, email: "a" });

    const sides = (model()?.changes ?? []).map((change) => change.side ?? "response");
    expect(sides).toContain("response");
    expect(sides).toContain("request");
  });

  it("merges request shapes across samples", () => {
    sniffrStore.getState().registerSchemas({
      "POST /api/users": { request: CreateUser, response: User },
    });
    post({ email: "ada@example.com", role: "admin" });
    post({ email: "grace@example.com", role: "admin", nickname: "amazing" });

    const changes = model()?.changes ?? [];
    expect(changes.map((change) => change.code)).toContain("field.added");
    expect(model()?.samples).toBe(2);
  });

  it("keeps the request shape when a later response carries no body", () => {
    sniffrStore.getState().registerSchemas({ "POST /api/users": { request: CreateUser } });
    post({ email: "ada@example.com", role: "admin" });
    const first = model()?.request;

    post(undefined);
    expect(model()?.request).toBe(first);
  });

  it("stays silent when no request schema is registered", () => {
    sniffrStore.getState().registerSchemas({ "POST /api/users": User });
    post({ anything: true });
    expect(model()?.changes).toEqual([]);
  });
});

describe("intercept — capturing request bodies", () => {
  const originalFetch = globalThis.fetch;
  let captures: Capture[] = [];
  let stop = noop;

  beforeEach(() => {
    captures = [];
    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ id: 1 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      })) as typeof fetch;
    stop = intercept({ onCapture: (capture) => captures.push(capture) });
  });

  afterEach(() => {
    stop();
    stop = noop;
    globalThis.fetch = originalFetch;
  });

  it("reads a JSON string body from init", async () => {
    await fetch("https://api.test/api/users", {
      method: "POST",
      body: JSON.stringify({ email: "ada@example.com" }),
    });

    await vi.waitFor(() => expect(captures).toHaveLength(1));
    expect(captures[0]?.requestBody).toEqual({ email: "ada@example.com" });
  });

  it("reads a body carried on a Request, without consuming the caller's copy", async () => {
    const request = new Request("https://api.test/api/users", {
      method: "POST",
      body: JSON.stringify({ email: "grace@example.com" }),
    });

    const response = await fetch(request);
    expect(response.status).toBe(200);

    await vi.waitFor(() => expect(captures).toHaveLength(1));
    expect(captures[0]?.requestBody).toEqual({ email: "grace@example.com" });
  });

  it("ignores a body that is not JSON", async () => {
    await fetch("https://api.test/a", { method: "POST", body: "email=ada" });
    await vi.waitFor(() => expect(captures).toHaveLength(1));
    expect(captures[0]?.requestBody).toBeUndefined();
  });

  it("leaves requestBody undefined for a plain GET", async () => {
    await fetch("https://api.test/a");
    await vi.waitFor(() => expect(captures).toHaveLength(1));
    expect(captures[0]?.requestBody).toBeUndefined();
  });
});

describe("ci — request bodies from a HAR", () => {
  const HAR = "test/fixtures/create-user.har";

  it("reads postData", async () => {
    const { samples } = await loadSamples([HAR]);
    expect(samples).toHaveLength(2);
    expect(samples[0]?.requestBody).toEqual({ email: "ada@example.com", role: "admin" });
  });

  it("classifies request drift and marks it in the report", async () => {
    const { samples } = await loadSamples([HAR]);
    const analysis = analyze(samples, {
      schemas: { "POST /api/users": { request: CreateUser, response: User } },
    });

    expect(analysis.breaking).toBe(1);
    const text = renderReport(analysis);
    expect(text).toContain("req $.role");
    expect(text).toContain('"admin" | "member" -> "admin" | "owner"');
  });

  it("counts an endpoint as matched when only a request schema is given", async () => {
    const { samples } = await loadSamples([HAR]);
    const analysis = analyze(samples, {
      schemas: { "POST /api/users": { request: CreateUser } },
    });
    expect(analysis.unmatched).toEqual([]);
  });
});
