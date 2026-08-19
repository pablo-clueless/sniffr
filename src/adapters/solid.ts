import { createSignal, onCleanup } from "solid-js";
import type { Accessor } from "solid-js";

import type { SniffrState } from "../runtime/store.js";
import { sniffrStore } from "../runtime/store.js";
import { mountOverlay } from "../ui/overlay.js";

export const useSniffr = (): Accessor<SniffrState> => {
  const [state, setState] = createSignal(sniffrStore.getState());
  const unsubscribe = sniffrStore.subscribe((next) => setState(() => next));
  onCleanup(unsubscribe);
  return state;
};

// Returning a real element keeps this entry free of the Solid JSX transform,
// which would otherwise have to run over the package at build time.
export function SniffrOverlay(): HTMLElement {
  const host = document.createElement("div");
  const handle = mountOverlay(host);
  onCleanup(() => handle.unmount());
  return host;
}
