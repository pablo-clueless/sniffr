// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import type { OverlayHandle } from "../src/ui/overlay.js";
import { sniffrStore } from "../src/runtime/store.js";
import { DEFAULT_PANEL_HEIGHT, MIN_PANEL_HEIGHT, mountOverlay } from "../src/ui/overlay.js";

let overlay: OverlayHandle | null = null;

const host = () => document.querySelector("[data-sniffr]");
const shadow = () => host()?.shadowRoot ?? null;
const pick = (selector: string) => shadow()?.querySelector<HTMLElement>(selector) ?? null;
const pill = () => pick(".pill")!;
const panel = () => pick(".panel")!;
const rows = () => [...(shadow()?.querySelectorAll(".row") ?? [])];
const items = () => [...(shadow()?.querySelectorAll(".endpoint") ?? [])];

const record = (body: unknown, url = "/api/users", requestBody?: unknown) => {
  sniffrStore.getState().record({
    method: "GET",
    url,
    status: 200,
    body,
    requestBody,
    at: Date.now(),
  });
};

const openPanel = () => {
  overlay = mountOverlay();
  pill().click();
};

beforeEach(() => {
  document.body.innerHTML = "";
  sniffrStore.setState({ models: {}, schemas: {}, requestSchemas: {}, routes: [], storage: null });
  sniffrStore.getState().registerSchemas({
    "GET /api/users": z.object({ email: z.string(), nick: z.string().optional() }),
    "GET /api/orders": z.object({ total: z.number().int() }),
  });
});

afterEach(() => {
  overlay?.unmount();
  overlay = null;
});

describe("overlay — isolation (HANDOFF 7.3)", () => {
  it("renders into a shadow root, never the host tree", () => {
    overlay = mountOverlay();
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

describe("overlay — the pill", () => {
  it("is always present, with the panel closed", () => {
    overlay = mountOverlay();
    expect(pill().hidden).toBe(false);
    expect(panel().hidden).toBe(true);
  });

  it("stays neutral and unbadged with nothing to report", () => {
    overlay = mountOverlay();
    expect(pill().dataset.state).toBe("clean");
    expect(pick(".badge")!.hidden).toBe(true);
  });

  it("goes red when a breaking change appears", () => {
    overlay = mountOverlay();
    record({ email: null });

    expect(pill().dataset.state).toBe("breaking");
    expect(pick(".badge")!.textContent).toBe("1");
  });

  it("goes amber when the only drift is additive", () => {
    overlay = mountOverlay();
    record({ email: "ada@example.com", avatarUrl: "https://cdn/1.png" });

    expect(pill().dataset.state).toBe("additive");
    expect(pick(".badge")!.textContent).toBe("1");
  });

  it("stays neutral for an info-only endpoint (HANDOFF 10)", () => {
    overlay = mountOverlay();
    record({ email: "ada@example.com" });

    expect(pill().dataset.state).toBe("clean");
    expect(pick(".badge")!.hidden).toBe(true);
    expect(items()).toHaveLength(0);
  });

  it("counts breaking and additive together on the badge", () => {
    overlay = mountOverlay();
    record({ email: null, avatarUrl: "https://cdn/1.png" });
    expect(pick(".badge")!.textContent).toBe("2");
  });
});

describe("overlay — opening and closing", () => {
  it("opens on click and hides the pill while open", () => {
    openPanel();
    expect(panel().hidden).toBe(false);
    expect(pill().hidden).toBe(true);
    expect(pill().getAttribute("aria-expanded")).toBe("true");
  });

  it("closes with the close button", () => {
    openPanel();
    pick(".close")!.click();

    expect(panel().hidden).toBe(true);
    expect(pill().hidden).toBe(false);
  });

  it("closes on Escape", () => {
    openPanel();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel().hidden).toBe(true);
  });

  it("ignores Escape when already closed", () => {
    overlay = mountOverlay();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(panel().hidden).toBe(true);
  });
});

describe("overlay — the endpoint list", () => {
  it("lists only endpoints with something notable", () => {
    openPanel();
    record({ email: null }, "/api/users");
    record({ total: 3 }, "/api/orders");

    expect(items()).toHaveLength(1);
    expect(items()[0]!.textContent).toContain("/api/users");
  });

  it("shows per-endpoint counts", () => {
    openPanel();
    record({ email: null, avatarUrl: "x" });

    const text = items()[0]!.textContent ?? "";
    expect(text).toContain("1 breaking");
    expect(text).toContain("1 additive");
  });

  it("selects the first endpoint by default and renders its changes", () => {
    openPanel();
    record({ email: null });

    expect(items()[0]!.getAttribute("aria-selected")).toBe("true");
    expect(rows().length).toBeGreaterThan(0);
    expect(pick(".detail-route")!.textContent).toBe("GET /api/users");
  });

  it("switches the detail pane when another endpoint is clicked", () => {
    openPanel();
    record({ email: null }, "/api/users");
    record({ total: null }, "/api/orders");

    const orders = items().find((item) => item.textContent?.includes("/api/orders"));
    (orders as HTMLElement).click();

    expect(pick(".detail-route")!.textContent).toBe("GET /api/orders");
  });

  it("says so when there is nothing to show", () => {
    openPanel();
    expect(pick(".empty")).not.toBeNull();
  });
});

describe("overlay — change rows", () => {
  it("renders severity, path and the shift", () => {
    openPanel();
    record({ email: null });

    const row = rows()[0]!;
    expect(row.querySelector(".tag")!.textContent).toBe("breaking");
    expect(row.querySelector(".path")!.textContent).toBe("$.email");
    // one sample, so the only thing observed is null
    expect(row.querySelector(".shift")!.textContent).toBe("string → null");
  });

  it("marks a request-side change", () => {
    sniffrStore.getState().registerSchemas({
      "GET /api/users": { request: z.object({ q: z.string() }), response: z.object({}) },
    });
    openPanel();
    record({}, "/api/users", { q: 1 });

    expect(pick(".side")!.textContent).toBe("req");
  });

  it("writes response data as text, never as markup", () => {
    openPanel();
    record({ email: null, injected: "<img src=x onerror=alert(1)>" });
    expect(shadow()!.querySelector("img")).toBeNull();
  });
});

describe("overlay — adjustable height", () => {
  const drag = (from: number, to: number) => {
    pick(".resizer")!.dispatchEvent(new MouseEvent("mousedown", { clientY: from, bubbles: true }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientY: to }));
    document.dispatchEvent(new MouseEvent("mouseup"));
  };

  it("opens at the default height", () => {
    openPanel();
    expect(panel().style.height).toBe(`${DEFAULT_PANEL_HEIGHT}px`);
  });

  it("grows when the handle is dragged up", () => {
    openPanel();
    drag(500, 400);
    expect(panel().style.height).toBe(`${DEFAULT_PANEL_HEIGHT + 100}px`);
  });

  it("shrinks when dragged down, and clamps at the minimum", () => {
    openPanel();
    drag(500, 900);
    expect(panel().style.height).toBe(`${MIN_PANEL_HEIGHT}px`);
  });

  it("clamps at 90% of the viewport", () => {
    openPanel();
    drag(500, -5000);
    expect(Number.parseInt(panel().style.height, 10)).toBeLessThanOrEqual(
      Math.round(window.innerHeight * 0.9),
    );
  });

  it("ignores movement once the handle is released", () => {
    openPanel();
    drag(500, 400);
    document.dispatchEvent(new MouseEvent("mousemove", { clientY: 100 }));
    expect(panel().style.height).toBe(`${DEFAULT_PANEL_HEIGHT + 100}px`);
  });

  it("keeps the chosen height across a close and reopen", () => {
    openPanel();
    drag(500, 400);
    pick(".close")!.click();
    pill().click();

    expect(panel().style.height).toBe(`${DEFAULT_PANEL_HEIGHT + 100}px`);
  });
});

describe("overlay — teardown", () => {
  it("removes the host and stops listening", () => {
    overlay = mountOverlay();
    overlay.unmount();
    overlay = null;

    expect(host()).toBeNull();
    expect(() => record({ email: null })).not.toThrow();
    expect(() =>
      document.dispatchEvent(new MouseEvent("mousemove", { clientY: 10 })),
    ).not.toThrow();
  });
});
