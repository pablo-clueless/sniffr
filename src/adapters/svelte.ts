import type { SniffrState } from "../runtime/store.js";
import { sniffrStore } from "../runtime/store.js";
import { mountOverlay } from "../ui/overlay.js";

export type Readable<T> = {
  readonly subscribe: (run: (value: T) => void) => () => void;
};

export type Action = {
  readonly destroy: () => void;
};

// Svelte's store contract calls the subscriber immediately with the current
// value; zustand's does not. That difference is the whole adapter — no svelte
// import is needed, so this entry works against any Svelte version.
export const sniffrState: Readable<SniffrState> = {
  subscribe: (run) => {
    run(sniffrStore.getState());
    return sniffrStore.subscribe(run);
  },
};

export const useSniffr = (): Readable<SniffrState> => sniffrState;

export const overlay = (node: HTMLElement): Action => {
  const handle = mountOverlay(node);
  return { destroy: () => handle.unmount() };
};
