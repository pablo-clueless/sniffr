import type { EndpointModel, SniffrState } from "../runtime/store.js";
import { endpoints, sniffrStore } from "../runtime/store.js";
import type { Change } from "../core/diff.js";

export type OverlayHandle = {
  readonly unmount: () => void;
};

const STYLES = `
:host {
  all: initial;
  display: block;
}
.panel {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483647;
  width: 420px;
  max-height: 50vh;
  overflow: auto;
  font: 12px/1.5 ui-monospace, SFMono-Regular, Menlo, monospace;
  color: #e6e6e6;
  background: #16181d;
  border: 1px solid #2c313a;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
}
.panel[hidden] { display: none; }
.header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid #2c313a;
  position: sticky;
  top: 0;
  background: #16181d;
}
.title { font-weight: 700; letter-spacing: 0.04em; }
.count { color: #9aa4b2; }
.close {
  all: unset;
  cursor: pointer;
  padding: 0 4px;
  color: #9aa4b2;
}
.close:hover { color: #e6e6e6; }
.endpoint { padding: 8px 10px; border-bottom: 1px solid #23272f; }
.endpoint:last-child { border-bottom: none; }
.route { color: #cbd5e1; margin-bottom: 4px; word-break: break-all; }
.samples { color: #6b7280; }
.row { display: flex; gap: 8px; padding: 2px 0; align-items: baseline; }
.tag {
  flex: none;
  width: 62px;
  font-size: 10px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.tag.breaking { color: #f87171; }
.tag.additive { color: #34d399; }
.path { flex: none; color: #e2e8f0; }
.shift { color: #9aa4b2; word-break: break-all; }
`;

const notable = (change: Change): boolean => change.severity !== "info";

const withChanges = (state: SniffrState): readonly EndpointModel[] =>
  endpoints(state).filter((model) => model.changes.some(notable));

const element = <K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

const renderChange = (change: Change): HTMLElement => {
  const row = element("div", "row");
  row.append(
    element("span", `tag ${change.severity}`, change.severity),
    element("span", "path", change.path),
    element("span", "shift", `${change.expected} -> ${change.observed}`),
  );
  return row;
};

const renderEndpoint = (model: EndpointModel): HTMLElement => {
  const block = element("div", "endpoint");
  const route = element("div", "route", `${model.method} ${model.route} `);
  route.append(element("span", "samples", `${model.samples} samples`));
  block.append(route);
  for (const change of model.changes.filter(notable)) block.append(renderChange(change));
  return block;
};

export const mountOverlay = (target?: Element): OverlayHandle => {
  if (typeof document === "undefined") return { unmount: () => {} };

  const host = document.createElement("div");
  host.dataset.sniffr = "overlay";
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLES;

  const panel = element("div", "panel");
  const header = element("div", "header");
  const title = element("span", "title", "sniffr");
  const count = element("span", "count");
  const close = element("button", "close", "x");
  close.type = "button";
  header.append(title, count, close);

  const list = element("div", "list");
  panel.append(header, list);
  root.append(style, panel);
  (target ?? document.body).append(host);

  let dismissed = false;

  const render = (state: SniffrState): void => {
    const models = withChanges(state);
    const changes = models.flatMap((model) => model.changes.filter(notable));
    const breaking = changes.filter((change) => change.severity === "breaking").length;

    panel.hidden = dismissed || models.length === 0;
    count.textContent = `${breaking} breaking / ${changes.length - breaking} additive`;

    list.replaceChildren(...models.map(renderEndpoint));
  };

  close.addEventListener("click", () => {
    dismissed = true;
    panel.hidden = true;
  });

  const unsubscribe = sniffrStore.subscribe(render);
  render(sniffrStore.getState());

  return {
    unmount: () => {
      unsubscribe();
      host.remove();
    },
  };
};
