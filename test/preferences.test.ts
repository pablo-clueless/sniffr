import { describe, expect, it } from "vitest";

import type { StorageLike } from "../src/runtime/persist.js";
import { PREFERENCES_KEY, readPreferences, writePreferences } from "../src/ui/preferences.js";
import type { OverlayPreferences } from "../src/ui/preferences.js";

const defaults: OverlayPreferences = { open: false, height: 360, filter: "" };

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
    writePreferences({ open: true, height: 500, filter: "users" }, storage);
    expect(readPreferences(defaults, storage)).toEqual({
      open: true,
      height: 500,
      filter: "users",
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
    });
  });

  it("rejects a non-finite height", () => {
    const storage = fake(JSON.stringify({ height: Number.POSITIVE_INFINITY }));
    expect(readPreferences(defaults, storage).height).toBe(360);
  });
});
