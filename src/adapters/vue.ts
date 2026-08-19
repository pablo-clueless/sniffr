import type { ShallowRef } from "vue";
import {
  defineComponent,
  getCurrentScope,
  h,
  onBeforeUnmount,
  onMounted,
  onScopeDispose,
  shallowRef,
} from "vue";

import type { SniffrState } from "../runtime/store.js";
import type { OverlayHandle } from "../ui/overlay.js";
import { sniffrStore } from "../runtime/store.js";
import { mountOverlay } from "../ui/overlay.js";

export const useSniffr = (): ShallowRef<SniffrState> => {
  const state = shallowRef(sniffrStore.getState());
  const unsubscribe = sniffrStore.subscribe((next) => {
    state.value = next;
  });
  if (getCurrentScope()) onScopeDispose(unsubscribe);
  return state;
};

export const SniffrOverlay = defineComponent({
  name: "SniffrOverlay",
  setup() {
    const host = shallowRef<HTMLDivElement | null>(null);
    let handle: OverlayHandle | null = null;

    onMounted(() => {
      if (host.value) handle = mountOverlay(host.value);
    });

    onBeforeUnmount(() => {
      handle?.unmount();
      handle = null;
    });

    return () => h("div", { ref: host });
  },
});
