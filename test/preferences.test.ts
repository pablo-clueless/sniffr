import { describe, expect, it } from "vitest";

import type { StorageLike } from "../src/runtime/persist.js";
import { PREFERENCES_KEY, readPreferences, writePreferences } from "../src/ui/preferences.js";
import type { OverlayPreferences } from "../src/ui/preferences.js";

const defaults: OverlayPreferences = {
  open: false,
  height: 360,
  filter: "",
  theme: "system",
  position: "bottom-left",
};

const fake = (initial?: string, throwing = false): StorageLike & { value: string | null } => {
  let value = initial ?? null;
  return {
    get value() {
      return value;
    },
    getItem: () => {
      if (throwing) throw new Error("blocked");
      return value;
    },
    setItem: (_key: string, next: string) => {
      if (throwing) throw new Error("blocked");
      value = next;
    },
    removeItem: () => {
      value = null;
    },
  };
};

describe("preferences", () => {
  it("round-trips", () => {
    const storage = fake();
    writePreferences(
      { open: true, height: 500, filter: "users", theme: "light", position: "top-right" },
      storage,
    );
    expect(readPreferences(defaults, storage)).toEqual({
      open: true,
      height: 500,
      filter: "users",
      theme: "light",
      position: "top-right",
    });
  });

  it("uses its own key, not the model storage key", () => {
    const storage = fake();
    writePreferences(defaults, storage);
    expect(PREFERENCES_KEY).toBe("sniffr:ui:v1");
    expect(storage.value).not.toBeNull();
  });

  it("falls back to defaults with no storage at all", () => {
    expect(readPreferences(defaults, null)).toEqual(defaults);
    expect(() => writePreferences(defaults, null)).not.toThrow();
  });

  it("falls back when storage throws", () => {
    const storage = fake(undefined, true);
    expect(readPreferences(defaults, storage)).toEqual(defaults);
    expect(() => writePreferences(defaults, storage)).not.toThrow();
  });

  it("falls back on unparseable or wrongly shaped data", () => {
    expect(readPreferences(defaults, fake("{not json"))).toEqual(defaults);
    expect(readPreferences(defaults, fake("null"))).toEqual(defaults);
    expect(readPreferences(defaults, fake('"a string"'))).toEqual(defaults);
  });

  it("keeps the fields it can read and defaults the rest", () => {
    const storage = fake(JSON.stringify({ open: true, height: "tall", filter: 7 }));
    expect(readPreferences(defaults, storage)).toEqual({
      open: true,
      height: 360,
      filter: "",
      theme: "system",
      position: "bottom-left",
    });
  });

  it("keeps only a recognised theme", () => {
    expect(readPreferences(defaults, fake(JSON.stringify({ theme: "dark" }))).theme).toBe("dark");
    expect(readPreferences(defaults, fake(JSON.stringify({ theme: "light" }))).theme).toBe("light");
    expect(readPreferences(defaults, fake(JSON.stringify({ theme: "neon" }))).theme).toBe("system");
  });

  it("keeps only a recognised position", () => {
    const read = (value: unknown) =>
      readPreferences(defaults, fake(JSON.stringify({ position: value }))).position;
    expect(read("top-right")).toBe("top-right");
    expect(read("bottom-right")).toBe("bottom-right");
    expect(read("middle")).toBe("bottom-left");
    expect(read(7)).toBe("bottom-left");
  });

  it("rejects a non-finite height", () => {
    const storage = fake(JSON.stringify({ height: Number.POSITIVE_INFINITY }));
    expect(readPreferences(defaults, storage).height).toBe(360);
  });
});
