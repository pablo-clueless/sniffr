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

describe("normalizeRoute — slugs survive (task 2.2)", () => {
  it("keeps a word slug intact", () => {
    expect(normalizeRoute("/api/posts/how-to-build-a-dev-tool")).toBe(
      "/api/posts/how-to-build-a-dev-tool",
    );
  });

  it("keeps a slug that contains digits", () => {
    expect(normalizeRoute("/api/posts/top-10-tips")).toBe("/api/posts/top-10-tips");
  });

  it("keeps a long single word, which carries no digit", () => {
    expect(normalizeRoute("/api/tags/internationalization")).toBe("/api/tags/internationalization");
  });

  it("still collapses a separator-free opaque token", () => {
    expect(normalizeRoute("/api/users/V1StGXR8Z5jdHi6Bmy0T")).toBe("/api/users/:id");
  });

  it("still collapses a ULID", () => {
    expect(normalizeRoute("/api/events/01ARZ3NDEKTSV4RRFFQ69G5FAV")).toBe("/api/events/:id");
  });

  it("deliberately leaves 6 hex chars alone, below the HEX threshold", () => {
    expect(normalizeRoute("/api/users/019a7c")).toBe("/api/users/019a7c");
  });

  it("leaves a separator-bearing token alone — declare it in routes instead", () => {
    expect(normalizeRoute("/api/users/V1StGXR8_Z5jdHi6BmyT")).toBe(
      "/api/users/V1StGXR8_Z5jdHi6BmyT",
    );
    expect(normalizeRoute("/api/users/V1StGXR8_Z5jdHi6BmyT", ["/api/users/:id"])).toBe(
      "/api/users/:id",
    );
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
