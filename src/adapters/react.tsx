import { useEffect, useRef, useSyncExternalStore } from "react";
import { sniffrStore } from "../runtime/store.js";
import type { SniffrState } from "../runtime/store.js";
import { mountOverlay } from "../ui/overlay.js";

export const useSniffr = (): SniffrState =>
  useSyncExternalStore(sniffrStore.subscribe, sniffrStore.getState, sniffrStore.getState);

export function SniffrOverlay() {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const handle = mountOverlay(host.current);
    return () => handle.unmount();
  }, []);

  return <div ref={host} />;
}
