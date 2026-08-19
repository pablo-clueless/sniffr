import { afterEach, describe, expect, it, vi } from "vitest";
import { intercept } from "../src/runtime/intercept.js";
import type { Capture } from "../src/runtime/store.js";

const originalFetch = globalThis.fetch;

const respondWith = (body: string, headers: Record<string, string>) => {
  globalThis.fetch = (async () => new Response(body, { status: 200, headers })) as typeof fetch;
};

const json = (body: unknown) =>
  respondWith(JSON.stringify(body), { "content-type": "application/json" });

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("intercept — fetch", () => {
  it("captures a JSON response and leaves it readable by the caller", async () => {
    const captures: Capture[] = [];
    json({ id: 1 });
    const stop = intercept({ onCapture: (capture) => captures.push(capture) });

    const response = await fetch("https://api.test/api/users/1");
    await expect(response.json()).resolves.toEqual({ id: 1 });

    await vi.waitFor(() => expect(captures).toHaveLength(1));
    expect(captures[0]).toMatchObject({ method: "GET", url: "https://api.test/api/users/1" });
    stop();
  });

  it("reads the method from a Request and from init", async () => {
    const captures: Capture[] = [];
    json({});
    const stop = intercept({ onCapture: (capture) => captures.push(capture) });

    await fetch("https://api.test/a", { method: "POST" });
    await fetch(new Request("https://api.test/b", { method: "PUT" }));

    await vi.waitFor(() => expect(captures).toHaveLength(2));
    expect(captures.map((capture) => capture.method)).toEqual(["POST", "PUT"]);
    stop();
  });

  it("ignores responses that are not JSON (HANDOFF 10)", async () => {
    const captures: Capture[] = [];
    respondWith("<html></html>", { "content-type": "text/html" });
    const stop = intercept({ onCapture: (capture) => captures.push(capture) });

    await fetch("https://api.test/page");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(captures).toHaveLength(0);
    stop();
  });

  it("accepts a +json content type", async () => {
    const captures: Capture[] = [];
    respondWith('{"a":1}', { "content-type": "application/problem+json" });
    const stop = intercept({ onCapture: (capture) => captures.push(capture) });

    await fetch("https://api.test/a");
    await vi.waitFor(() => expect(captures).toHaveLength(1));
    stop();
  });

  it("skips a body larger than the limit", async () => {
    const captures: Capture[] = [];
    json({ blob: "x".repeat(500) });
    const stop = intercept({ onCapture: (capture) => captures.push(capture), maxBodyBytes: 50 });

    await fetch("https://api.test/big");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(captures).toHaveLength(0);
    stop();
  });

  it("ignores a body that is not parseable JSON", async () => {
    const captures: Capture[] = [];
    respondWith("not json", { "content-type": "application/json" });
    const stop = intercept({ onCapture: (capture) => captures.push(capture) });

    await fetch("https://api.test/a");
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(captures).toHaveLength(0);
    stop();
  });
});

describe("intercept — must never throw into the host app (HANDOFF 7.6)", () => {
  it("swallows a handler that throws, and still resolves the caller's fetch", async () => {
    json({ id: 1 });
    const stop = intercept({
      onCapture: () => {
        throw new Error("handler exploded");
      },
    });

    const response = await fetch("https://api.test/a");
    expect(response.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 20));
    stop();
  });

  it("propagates a genuine network failure unchanged", async () => {
    globalThis.fetch = (async () => {
      throw new Error("offline");
    }) as typeof fetch;
    const stop = intercept({ onCapture: () => {} });

    await expect(fetch("https://api.test/a")).rejects.toThrow("offline");
    stop();
  });
});

describe("intercept — teardown", () => {
  it("restores the original fetch", () => {
    json({});
    const patched = globalThis.fetch;
    const stop = intercept({ onCapture: () => {} });
    expect(globalThis.fetch).not.toBe(patched);
    stop();
    expect(globalThis.fetch).toBe(patched);
  });

  it("stops capturing after teardown", async () => {
    const captures: Capture[] = [];
    json({});
    const stop = intercept({ onCapture: (capture) => captures.push(capture) });
    stop();

    await fetch("https://api.test/a");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(captures).toHaveLength(0);
  });
});
