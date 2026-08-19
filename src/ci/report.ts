import type { Change } from "../core/diff.js";
import type { Analysis } from "./analyze.js";

const TAG: Record<string, string> = {
  breaking: "BREAKING",
  additive: "ADDITIVE",
  info: "INFO    ",
};

const label = (change: Change): string =>
  change.side === "request" ? `req ${change.path}` : change.path;

export const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

export const renderReport = (analysis: Analysis): string => {
  const lines: string[] = [];

  for (const endpoint of analysis.endpoints) {
    if (endpoint.expected === null && endpoint.expectedRequest === null) {
      lines.push(
        `${endpoint.method} ${endpoint.route}  (${plural(endpoint.samples, "sample")}, no schema)`,
      );
      continue;
    }
    if (endpoint.changes.length === 0) {
      lines.push(
        `${endpoint.method} ${endpoint.route}  (${plural(endpoint.samples, "sample")}, ok)`,
      );
      continue;
    }

    lines.push(`${endpoint.method} ${endpoint.route}  (${plural(endpoint.samples, "sample")})`);
    const width = Math.max(...endpoint.changes.map((change) => label(change).length));
    for (const change of endpoint.changes) {
      lines.push(
        `  [${TAG[change.severity]}] ${label(change).padEnd(width + 2)}${change.expected} -> ${change.observed}`,
      );
    }
  }

  for (const key of analysis.unmatched) {
    lines.push(`no responses recorded for schema: ${key}`);
  }

  lines.push(
    "",
    `${plural(analysis.breaking, "breaking change")}, ${analysis.additive} additive, ${analysis.info} info across ${plural(analysis.endpoints.length, "endpoint")}`,
  );

  return lines.join("\n");
};

export const renderJson = (analysis: Analysis): string =>
  JSON.stringify(
    {
      breaking: analysis.breaking,
      additive: analysis.additive,
      info: analysis.info,
      unmatched: analysis.unmatched,
      endpoints: analysis.endpoints.map((endpoint) => ({
        key: endpoint.key,
        method: endpoint.method,
        route: endpoint.route,
        samples: endpoint.samples,
        hasSchema: endpoint.expected !== null,
        changes: endpoint.changes,
      })),
    },
    null,
    2,
  );
