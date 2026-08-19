import { describe, expect, it } from "vitest";
import { endpointKey, normalizeRoute, pathOf } from "../src/core/route.js";

describe("pathOf", () => {
  it("strips query and hash from absolute and relative urls", () => {
    expect(pathOf("https://api.test/api/users?page=2")).toBe("/api/users");
    expect(pathOf("/api/users?page=2#top")).toBe("/api/users");
  });
});

describe("normalizeRoute — params it collapses", () => {
  it("collapses numeric ids", () => {
    expect(normalizeRoute("/api/users/42")).toBe("/api/users/:id");
  });

  it("collapses uuids", () => {
    expect(normalizeRoute("/api/users/3f2504e0-4f89-11d3-9a0c-0305e82c3301")).toBe(
      "/api/users/:id",
    );
  });

  it("collapses long hex ids", () => {
    expect(normalizeRoute("/api/users/019a7c3d4e5f")).toBe("/api/users/:id");
  });

  it("leaves static segments alone", () => {
    expect(normalizeRoute("/api/users")).toBe("/api/users");
    expect(normalizeRoute("https://api.test/api/users?page=2")).toBe("/api/users");
  });

  it("normalises the root", () => {
    expect(normalizeRoute("/")).toBe("/");
  });
});

describe("normalizeRoute — known-broken behaviour (HANDOFF 8, task 2.2)", () => {
  it("eats slugs, because OPAQUE matches any 21+ char token", () => {
    expect(normalizeRoute("/api/posts/how-to-build-a-dev-tool")).toBe("/api/posts/:id");
  });

  it("deliberately leaves 6 hex chars alone, below the HEX threshold", () => {
    expect(normalizeRoute("/api/users/019a7c")).toBe("/api/users/019a7c");
  });
});

describe("normalizeRoute — explicit patterns win", () => {
  it("uses a declared pattern instead of guessing", () => {
    expect(normalizeRoute("/api/posts/how-to-build-a-dev-tool", ["/api/posts/:slug"])).toBe(
      "/api/posts/:slug",
    );
  });

  it("only matches a pattern with the same segment count", () => {
    expect(normalizeRoute("/api/posts/a/b", ["/api/posts/:slug"])).toBe("/api/posts/a/b");
  });

  it("requires literal segments to match", () => {
    expect(normalizeRoute("/api/pages/x", ["/api/posts/:slug"])).toBe("/api/pages/x");
  });
});

describe("endpointKey", () => {
  it("upper-cases the method", () => {
    expect(endpointKey("get", "/api/users")).toBe("GET /api/users");
  });
});
