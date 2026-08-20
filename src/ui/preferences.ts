import type { StorageLike } from "../runtime/persist.js";
import { defaultStorage } from "../runtime/persist.js";

export const PREFERENCES_KEY = "sniffr:ui:v1";

export type OverlayPreferences = {
  readonly open: boolean;
  readonly height: number;
  readonly filter: string;
};

// Panel chrome is a preference, not an observation: it lives under its own key
// and is never keyed by schema hash, so changing a schema does not reset the UI.
export const readPreferences = (
  defaults: OverlayPreferences,
  storage: StorageLike | null = defaultStorage(),
): OverlayPreferences => {
  if (!storage) return defaults;

  let raw: string | null = null;
  try {
    raw = storage.getItem(PREFERENCES_KEY);
  } catch {
    return defaults;
  }
  if (!raw) return defaults;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    return defaults;
  }
  if (!parsed || typeof parsed !== "object") return defaults;

  const value = parsed as Partial<Record<keyof OverlayPreferences, unknown>>;
  return {
    open: typeof value.open === "boolean" ? value.open : defaults.open,
    height:
      typeof value.height === "number" && Number.isFinite(value.height)
        ? value.height
        : defaults.height,
    filter: typeof value.filter === "string" ? value.filter : defaults.filter,
  };
};

export const writePreferences = (
  preferences: OverlayPreferences,
  storage: StorageLike | null = defaultStorage(),
): void => {
  if (!storage) return;
  try {
    storage.setItem(PREFERENCES_KEY, JSON.stringify(preferences));
  } catch {
    /* remembering the panel size is never worth an exception */
  }
};
