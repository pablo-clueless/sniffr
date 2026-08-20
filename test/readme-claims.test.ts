// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import type { OverlayHandle } from "../src/ui/overlay.js";
import { sniffrStore } from "../src/runtime/store.js";
import { mountOverlay } from "../src/ui/overlay.js";

const record = () =>
  sniffrStore.getState().record({
    method: "GET",
    url: "/api/orders",
    status: 200,
    body: { total: null },
    at: Date.now(),
  });

const handles: OverlayHandle[] = [];
const mount = () => {
  const handle = mountOverlay();
  handles.push(handle);
  return handle;
};

beforeEach(() => {
  document.body.innerHTML = "";
  localStorage.clear();
  sniffrStore.setState({ models: {}, schemas: {}, requestSchemas: {}, routes: [], storage: null });
});

afterEach(() => {
  for (const handle of handles.splice(0)) handle.unmount();
});

describe("README: two mounts really do give you two pills", () => {
  it("mounting twice puts two hosts on the page", () => {
    mount();
    mount();
    expect(document.querySelectorAll("[data-sniffr]")).toHaveLength(2);
  });
});

describe("README: a schema registered later re-diffs what was already seen", () => {
  it("classifies an already-observed endpoint as soon as its schema arrives", () => {
    record();
    expect(sniffrStore.getState().models["GET /api/orders"]?.changes).toEqual([]);

    sniffrStore.getState().registerSchemas({
      "GET /api/orders": z.object({ total: z.number().int() }),
    });

    const model = sniffrStore.getState().models["GET /api/orders"];
    expect(model?.expected).not.toBeNull();
    expect(model?.changes.map((change) => change.code)).toEqual(["null.added"]);
  });
});
