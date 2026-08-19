import type { EndpointModel, SniffrState } from "../runtime/store.js";
import { readPreferences, writePreferences } from "./preferences.js";
import { endpoints, sniffrStore } from "../runtime/store.js";
import type { Change } from "../core/diff.js";

export type OverlayHandle = {
  readonly unmount: () => void;
};

export const MIN_PANEL_HEIGHT = 160;
export const DEFAULT_PANEL_HEIGHT = 360;

const STYLES = `
:host {
  all: initial;
  display: block;
}

* { box-sizing: border-box; }

.pill, .panel {
  --bg: #0e1116;
  --raised: #161b22;
  --border: #262d38;
  --text: #e6edf3;
  --muted: #8b949e;
  --red: #f85149;
  --amber: #d29922;
  --green: #3fb950;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: ui-monospace, SFMono-Regular, Menlo, monospace;
  position: fixed;
  z-index: 2147483647;
  color: var(--text);
}

/* trigger */

.pill {
  left: 16px;
  bottom: 16px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px 7px 10px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--bg);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.45);
  font: 500 12px/1 var(--sans);
  cursor: pointer;
  transition: border-color 120ms ease, transform 120ms ease;
}
.pill:hover { transform: translateY(-1px); border-color: #3a4351; }
.pill:focus-visible { outline: 2px solid var(--amber); outline-offset: 2px; }
.pill[hidden], .panel[hidden] { display: none; }

.dot {
  width: 8px;
  height: 8px;
  border-radius: 999px;
  background: var(--muted);
  flex: none;
}
.pill[data-state="breaking"] { border-color: var(--red); }
.pill[data-state="breaking"] .dot {
  background: var(--red);
  box-shadow: 0 0 0 3px rgba(248, 81, 73, 0.22);
}
.pill[data-state="additive"] { border-color: var(--amber); }
.pill[data-state="additive"] .dot {
  background: var(--amber);
  box-shadow: 0 0 0 3px rgba(210, 153, 34, 0.2);
}

.pill-label { letter-spacing: 0.02em; }
.badge {
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--raised);
  font: 600 11px/1 var(--mono);
  color: var(--text);
}
.badge[hidden] { display: none; }

/* panel */

.panel {
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  border-top: 1px solid var(--border);
  background: var(--bg);
  box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.45);
  font: 12px/1.5 var(--sans);
}

.resizer {
  height: 6px;
  flex: none;
  cursor: ns-resize;
  background: transparent;
  border-bottom: 1px solid transparent;
}
.resizer:hover, .resizer[data-dragging="true"] { background: #1f2733; border-bottom-color: var(--border); }

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border);
  flex: none;
}
.brand { font-weight: 700; letter-spacing: 0.06em; text-transform: lowercase; }
.summary { color: var(--muted); font-family: var(--mono); font-size: 11px; }
.spacer { flex: 1; }
.filter {
  all: unset;
  width: 190px;
  padding: 4px 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--raised);
  color: var(--text);
  font: 11px/1.4 var(--mono);
}
.filter::placeholder { color: #6b7480; }
.filter:focus-visible { border-color: var(--amber); }
.close {
  all: unset;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 6px;
  color: var(--muted);
  font: 600 14px/1 var(--sans);
}
.close:hover { color: var(--text); background: var(--raised); }
.close:focus-visible { outline: 2px solid var(--amber); }

.body {
  display: flex;
  min-height: 0;
  flex: 1;
}

.list {
  width: 38%;
  min-width: 220px;
  max-width: 420px;
  overflow-y: auto;
  overflow-x: hidden;
  border-right: 1px solid var(--border);
}
.empty { padding: 16px 12px; color: var(--muted); }

.endpoint {
  all: unset;
  display: block;
  width: 100%;
  padding: 8px 12px;
  border-bottom: 1px solid #1b212b;
  cursor: pointer;
}
.endpoint:hover { background: #141a22; }
.endpoint[aria-selected="true"] { background: var(--raised); box-shadow: inset 2px 0 0 var(--amber); }
.endpoint:focus-visible { outline: 2px solid var(--amber); outline-offset: -2px; }

.endpoint-top { display: flex; align-items: center; gap: 8px; min-width: 0; }
.method {
  font: 600 10px/1 var(--mono);
  color: var(--muted);
  border: 1px solid var(--border);
  border-radius: 4px;
  padding: 3px 5px;
  flex: none;
}
.route {
  font-family: var(--mono);
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pills { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 5px; }
.mini {
  font: 600 10px/1 var(--mono);
  padding: 3px 6px;
  border-radius: 999px;
}
.mini.breaking { color: var(--red); background: rgba(248, 81, 73, 0.12); }
.mini.additive { color: var(--green); background: rgba(63, 185, 80, 0.12); }
.mini.samples { color: var(--muted); background: var(--raised); }

.detail { flex: 1; overflow-y: auto; padding: 10px 14px; min-width: 0; }
.detail-route {
  font-family: var(--mono);
  font-size: 11px;
  color: var(--muted);
  margin-bottom: 10px;
  word-break: break-all;
}

.row {
  display: grid;
  grid-template-columns: 74px minmax(120px, auto) 1fr;
  gap: 10px;
  align-items: baseline;
  padding: 6px 0;
  border-top: 1px solid #1b212b;
}
.row:first-of-type { border-top: none; }
.tag {
  font: 600 9px/1.4 var(--mono);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: center;
  border-radius: 4px;
  padding: 3px 0;
}
.tag.breaking { color: var(--red); background: rgba(248, 81, 73, 0.12); }
.tag.additive { color: var(--green); background: rgba(63, 185, 80, 0.12); }
.tag.info { color: var(--muted); background: var(--raised); }
.path { font-family: var(--mono); font-size: 11px; word-break: break-all; }
.shift { font-family: var(--mono); font-size: 11px; color: var(--muted); word-break: break-all; }
.side {
  font: 600 9px/1 var(--mono);
  color: var(--amber);
  border: 1px solid rgba(210, 153, 34, 0.4);
  border-radius: 3px;
  padding: 2px 4px;
  margin-right: 6px;
}
`;

const notable = (change: Change): boolean => change.severity !== "info";

const countBy = (models: readonly EndpointModel[], severity: Change["severity"]): number =>
  models.reduce(
    (total, model) => total + model.changes.filter((change) => change.severity === severity).length,
    0,
  );

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
  const path = element("span", "path");
  if (change.side === "request") path.append(element("span", "side", "req"));
  path.append(document.createTextNode(change.path));

  row.append(
    element("span", `tag ${change.severity}`, change.severity),
    path,
    element("span", "shift", `${change.expected} → ${change.observed}`),
  );
  return row;
};

const renderEndpointButton = (model: EndpointModel, selected: boolean): HTMLElement => {
  const button = element("button", "endpoint");
  button.type = "button";
  button.setAttribute("aria-selected", String(selected));
  button.dataset.key = model.key;

  const top = element("div", "endpoint-top");
  top.append(element("span", "method", model.method), element("span", "route", model.route));

  const pills = element("div", "pills");
  const breaking = model.changes.filter((change) => change.severity === "breaking").length;
  const additive = model.changes.filter((change) => change.severity === "additive").length;
  if (breaking > 0) pills.append(element("span", "mini breaking", `${breaking} breaking`));
  if (additive > 0) pills.append(element("span", "mini additive", `${additive} additive`));
  pills.append(element("span", "mini samples", `${model.samples}×`));

  button.append(top, pills);
  return button;
};

export const mountOverlay = (target?: Element): OverlayHandle => {
  if (typeof document === "undefined") return { unmount: () => {} };

  const host = document.createElement("div");
  host.dataset.sniffr = "overlay";
  const root = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLES;

  const pill = element("button", "pill");
  pill.type = "button";
  pill.setAttribute("aria-expanded", "false");
  const dot = element("span", "dot");
  const pillLabel = element("span", "pill-label", "sniffr");
  const badge = element("span", "badge");
  badge.hidden = true;
  pill.append(dot, pillLabel, badge);

  const panel = element("aside", "panel");
  panel.hidden = true;
  const resizer = element("div", "resizer");
  const header = element("div", "header");
  const summary = element("span", "summary");
  const close = element("button", "close", "✕");
  close.type = "button";
  close.setAttribute("aria-label", "Close sniffr");
  const filter = document.createElement("input");
  filter.className = "filter";
  filter.type = "search";
  filter.placeholder = "Filter routes…";
  filter.setAttribute("aria-label", "Filter routes");

  header.append(
    element("span", "brand", "sniffr"),
    summary,
    element("span", "spacer"),
    filter,
    close,
  );

  const list = element("div", "list");
  const detail = element("div", "detail");
  const body = element("div", "body");
  body.append(list, detail);
  panel.append(resizer, header, body);

  root.append(style, pill, panel);
  (target ?? document.body).append(host);

  const preferences = readPreferences({
    open: false,
    height: DEFAULT_PANEL_HEIGHT,
    filter: "",
  });

  let open = preferences.open;
  let height = preferences.height;
  let selected: string | null = null;
  filter.value = preferences.filter;

  const remember = (): void => writePreferences({ open, height, filter: filter.value });

  const maxHeight = (): number =>
    Math.max(MIN_PANEL_HEIGHT, Math.round((globalThis.innerHeight || 800) * 0.9));

  const applyHeight = (next: number): void => {
    height = Math.min(maxHeight(), Math.max(MIN_PANEL_HEIGHT, Math.round(next)));
    panel.style.height = `${height}px`;
  };

  const render = (state: SniffrState): void => {
    const all = withChanges(state);
    const query = filter.value.trim().toLowerCase();
    const models = query
      ? all.filter((model) => `${model.method} ${model.route}`.toLowerCase().includes(query))
      : all;

    const breaking = countBy(all, "breaking");
    const additive = countBy(all, "additive");
    const total = breaking + additive;

    pill.dataset.state = breaking > 0 ? "breaking" : additive > 0 ? "additive" : "clean";
    badge.hidden = total === 0;
    badge.textContent = String(total);
    pill.hidden = open;
    pill.setAttribute("aria-expanded", String(open));

    summary.textContent =
      total === 0
        ? "no drift detected"
        : `${breaking} breaking · ${additive} additive · ${all.length} endpoints`;

    if (selected && !models.some((model) => model.key === selected)) selected = null;
    selected ??= models[0]?.key ?? null;

    list.replaceChildren(
      ...(models.length === 0
        ? [
            element(
              "div",
              "empty",
              query
                ? `Nothing matches “${filter.value.trim()}”.`
                : "No drift yet. Responses appear here as they arrive.",
            ),
          ]
        : models.map((model) => renderEndpointButton(model, model.key === selected))),
    );

    const current = models.find((model) => model.key === selected);
    detail.replaceChildren(
      ...(current
        ? [
            element("div", "detail-route", `${current.method} ${current.route}`),
            ...current.changes.map(renderChange),
          ]
        : [element("div", "empty", "Select an endpoint to see what changed.")]),
    );
  };

  const setOpen = (next: boolean): void => {
    open = next;
    panel.hidden = !open;
    if (open) applyHeight(height);
    remember();
    render(sniffrStore.getState());
  };

  filter.addEventListener("input", () => {
    remember();
    render(sniffrStore.getState());
  });

  pill.addEventListener("click", () => setOpen(true));
  close.addEventListener("click", () => setOpen(false));

  list.addEventListener("click", (event) => {
    const button = (event.target as Element | null)?.closest?.(".endpoint");
    const key = button instanceof HTMLElement ? button.dataset.key : undefined;
    if (!key) return;
    selected = key;
    render(sniffrStore.getState());
  });

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && open) setOpen(false);
  };

  let dragFrom: { y: number; height: number } | null = null;

  const onMove = (event: MouseEvent): void => {
    if (!dragFrom) return;
    applyHeight(dragFrom.height + (dragFrom.y - event.clientY));
  };

  const onUp = (): void => {
    if (dragFrom) remember();
    dragFrom = null;
    resizer.dataset.dragging = "false";
  };

  resizer.addEventListener("mousedown", (event) => {
    event.preventDefault();
    dragFrom = { y: event.clientY, height };
    resizer.dataset.dragging = "true";
  });

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
  document.addEventListener("keydown", onKeyDown);

  panel.hidden = !open;
  if (open) applyHeight(height);

  const unsubscribe = sniffrStore.subscribe(render);
  render(sniffrStore.getState());

  return {
    unmount: () => {
      unsubscribe();
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("keydown", onKeyDown);
      host.remove();
    },
  };
};
