// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import type { OverlayHandle } from "../src/ui/overlay.js";
import { sniffrStore } from "../src/runtime/store.js";
import { mountOverlay } from "../src/ui/overlay.js";

let overlay: OverlayHandle | null = null;

const host = () => document.querySelector("[data-sniffr]");
const shadow = () => host()?.shadowRoot ?? null;
const panel = () => shadow()?.querySelector<HTMLElement>(".panel") ?? null;
const rows = () => [...(shadow()?.querySelectorAll(".row") ?? [])];

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
  sniffrStore.getState().registerSchemas({
    "GET /api/users": z.object({ email: z.string(), nick: z.string().optional() }),
  });
});

afterEach(() => {
  overlay?.unmount();
  overlay = null;
});

describe("overlay — isolation (HANDOFF 7.3)", () => {
  it("renders into a shadow root, never the host tree", () => {
    overlay = mountOverlay();
    expect(host()).not.toBeNull();
    expect(shadow()).not.toBeNull();
    expect(host()!.childNodes).toHaveLength(0);
  });

  it("keeps both all:initial and an explicit display:block on :host", () => {
    overlay = mountOverlay();
    const style = shadow()!.querySelector("style")!.textContent ?? "";
    expect(style).toMatch(/:host\s*\{[^}]*all:\s*initial/);
    expect(style).toMatch(/:host\s*\{[^}]*display:\s*block/);
  });

  it("mounts into a supplied target", () => {
    const target = document.createElement("section");
    document.body.append(target);
    overlay = mountOverlay(target);
    expect(target.querySelector("[data-sniffr]")).not.toBeNull();
  });
});

describe("overlay — rendering", () => {
  it("stays hidden until something notable is observed", () => {
    overlay = mountOverlay();
    expect(panel()!.hidden).toBe(true);
  });

  it("shows no row for an info-only endpoint (HANDOFF 10)", () => {
    overlay = mountOverlay();
    record({ email: "ada@example.com" });
    expect(rows()).toHaveLength(0);
    expect(panel()!.hidden).toBe(true);
  });

  it("shows breaking and additive rows", () => {
    overlay = mountOverlay();
    record({ email: null, avatarUrl: "https://cdn/1.png" });

    expect(panel()!.hidden).toBe(false);
    const text = rows().map((row) => row.textContent);
    expect(text.some((line) => line?.includes("$.email"))).toBe(true);
    expect(text.some((line) => line?.includes("$.avatarUrl"))).toBe(true);
  });

  it("counts breaking separately from additive", () => {
    overlay = mountOverlay();
    record({ email: null, avatarUrl: "https://cdn/1.png" });
    expect(shadow()!.querySelector(".count")!.textContent).toBe("1 breaking / 1 additive");
  });

  it("writes response data as text, never as markup", () => {
    overlay = mountOverlay();
    record({ email: null, injected: "<img src=x onerror=alert(1)>" });
    expect(shadow()!.querySelector("img")).toBeNull();
  });

  it("can be dismissed", () => {
    overlay = mountOverlay();
    record({ email: null });
    shadow()!.querySelector<HTMLButtonElement>(".close")!.click();
    expect(panel()!.hidden).toBe(true);
  });
});

describe("overlay — teardown", () => {
  it("removes the host and stops listening", () => {
    overlay = mountOverlay();
    overlay.unmount();
    overlay = null;

    expect(host()).toBeNull();
    expect(() => record({ email: null })).not.toThrow();
  });
});
