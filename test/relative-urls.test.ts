// @vitest-environment jsdom
// @vitest-environment-options { "url": "https://app.test/admin/dashboard" }
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { intercept } from "../src/runtime/intercept.js";
import type { Capture } from "../src/runtime/store.js";

const originalFetch = globalThis.fetch;
let captures: Capture[] = [];
let stop = () => {};

beforeEach(() => {
  captures = [];
  globalThis.fetch = (async () =>
    new Response("{}", {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;
  stop = intercept({ onCapture: (capture) => captures.push(capture) });
});

afterEach(() => {
  stop();
  globalThis.fetch = originalFetch;
});

const urlOf = async (input: string) => {
  await fetch(input);
  await vi.waitFor(() => expect(captures).toHaveLength(1));
  return captures[0]!.url;
};

describe("relative urls resolve against the page, not a dummy base", () => {
  it("keeps the directory a ./ url was issued from", async () => {
    expect(await urlOf("./api/users")).toBe("https://app.test/admin/api/users");
  });

  it("handles ../ too", async () => {
    expect(await urlOf("../api/users")).toBe("https://app.test/api/users");
  });

  it("leaves a root-relative url alone", async () => {
    expect(await urlOf("/api/users")).toBe("https://app.test/api/users");
  });

  it("leaves an absolute url alone", async () => {
    expect(await urlOf("https://other.test/api/users")).toBe("https://other.test/api/users");
  });
});
