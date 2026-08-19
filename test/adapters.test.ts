// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { createRoot } from "solid-js";
import { z } from "zod";

import { overlay, sniffrState, useSniffr as useSvelteSniffr } from "../src/adapters/svelte.js";
import { SniffrOverlay, useSniffr as useSolidSniffr } from "../src/adapters/solid.js";
import type { SniffrState } from "../src/runtime/store.js";
import { sniffrStore } from "../src/runtime/store.js";

const record = (body: unknown) => {
  sniffrStore.getState().record({
    method: "GET",
    url: "/api/users",
    status: 200,
    body,
    at: Date.now(),
  });
};

beforeEach(() => {
  document.body.innerHTML = "";
  sniffrStore.setState({ models: {}, schemas: {}, routes: [] });
  sniffrStore.getState().registerSchemas({ "GET /api/users": z.object({ email: z.string() }) });
});

describe("svelte adapter — the store contract", () => {
  it("calls the subscriber immediately, which zustand does not", () => {
    const seen: SniffrState[] = [];
    const unsubscribe = sniffrState.subscribe((value) => seen.push(value));

    expect(seen).toHaveLength(1);
    unsubscribe();
  });

  it("pushes later updates", () => {
    const seen: SniffrState[] = [];
    const unsubscribe = sniffrState.subscribe((value) => seen.push(value));

    record({ email: null });
    expect(seen).toHaveLength(2);
    expect(Object.keys(seen[1]!.models)).toEqual(["GET /api/users"]);
    unsubscribe();
  });

  it("stops pushing once unsubscribed", () => {
    const seen: SniffrState[] = [];
    sniffrState.subscribe((value) => seen.push(value))();

    record({ email: null });
    expect(seen).toHaveLength(1);
  });

  it("exposes the same store through useSniffr", () => {
    expect(useSvelteSniffr()).toBe(sniffrState);
  });

  it("needs no svelte import at all", async () => {
    const source = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/adapters/svelte.ts", "utf8"),
    );
    expect(source).not.toMatch(/from\s+["']svelte["']/);
  });
});

describe("svelte adapter — the overlay action", () => {
  it("mounts into the node and unmounts on destroy", () => {
    const node = document.createElement("div");
    document.body.append(node);

    const action = overlay(node);
    expect(node.querySelector("[data-sniffr]")).not.toBeNull();

    action.destroy();
    expect(node.querySelector("[data-sniffr]")).toBeNull();
  });
});

describe("solid adapter", () => {
  it("tracks store updates through a signal", () => {
    createRoot((dispose) => {
      const state = useSolidSniffr();
      expect(Object.keys(state().models)).toHaveLength(0);

      record({ email: null });
      expect(Object.keys(state().models)).toEqual(["GET /api/users"]);

      dispose();
    });
  });

  it("stops tracking after the root is disposed", () => {
    let state = (() => sniffrStore.getState()) as () => SniffrState;
    createRoot((dispose) => {
      state = useSolidSniffr();
      dispose();
    });

    record({ email: null });
    expect(Object.keys(state().models)).toHaveLength(0);
  });

  it("returns a real element, so no JSX transform is needed", () => {
    createRoot((dispose) => {
      const host = SniffrOverlay();
      expect(host).toBeInstanceOf(HTMLElement);
      expect(host.querySelector("[data-sniffr]")).not.toBeNull();
      dispose();
    });
  });

  it("unmounts the overlay when the owner is disposed", () => {
    let host: HTMLElement | null = null;
    createRoot((dispose) => {
      host = SniffrOverlay();
      dispose();
    });
    expect(host!.querySelector("[data-sniffr]")).toBeNull();
  });
});
