import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

import { plural, renderJson, renderReport } from "./report.js";
import { loadSamples } from "./sources.js";
import { analyze } from "./analyze.js";

const USAGE = `sniffr — check recorded API responses against your zod schemas

Usage:
  sniffr <path...> [options]

  <path>  a .har file, a .json fixture, or a directory of either.
          Fixtures look like { "url": "/api/users", "body": { ... } },
          or an array of those.

Options:
  --schemas <module>   module exporting \`schemas\` or a default export:
                       { "GET /api/users": zodSchema }
  --routes <patterns>  comma-separated explicit route patterns
  --json               emit JSON instead of the text report
  -h, --help           show this

Exit codes:
  0  no breaking changes
  1  at least one breaking change
  2  nothing to check, or bad usage`;

export type ParsedArgs = {
  readonly paths: readonly string[];
  readonly schemas?: string;
  readonly routes: readonly string[];
  readonly json: boolean;
  readonly help: boolean;
};

export const parseArgs = (argv: readonly string[]): ParsedArgs => {
  const paths: string[] = [];
  let schemas: string | undefined;
  let routes: string[] = [];
  let json = false;
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index] as string;
    if (arg === "--json") json = true;
    else if (arg === "-h" || arg === "--help") help = true;
    else if (arg === "--schemas") {
      index += 1;
      schemas = argv[index];
    } else if (arg === "--routes") {
      index += 1;
      routes = (argv[index] ?? "").split(",").filter(Boolean);
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option: ${arg}`);
    } else paths.push(arg);
  }

  return { paths, schemas, routes, json, help };
};

const loadSchemas = async (specifier: string): Promise<Record<string, unknown>> => {
  const module = (await import(pathToFileURL(resolve(specifier)).href)) as {
    schemas?: Record<string, unknown>;
    default?: Record<string, unknown>;
  };
  const schemas = module.schemas ?? module.default;
  if (!schemas || typeof schemas !== "object") {
    throw new Error(`${specifier} must export \`schemas\` or a default export object`);
  }
  return schemas;
};

export const run = async (argv: readonly string[]): Promise<number> => {
  const args = parseArgs(argv);

  if (args.help || args.paths.length === 0) {
    console.log(USAGE);
    return args.help ? 0 : 2;
  }

  const { samples, read, skipped } = await loadSamples(args.paths);
  for (const { file, reason } of skipped) console.warn(`skipped ${file}: ${reason}`);

  if (samples.length === 0) {
    console.error("no JSON responses found");
    return 2;
  }

  const schemas = args.schemas ? await loadSchemas(args.schemas) : {};
  const analysis = analyze(samples, { schemas, routes: args.routes });

  console.log(args.json ? renderJson(analysis) : renderReport(analysis));

  if (!args.json) {
    console.log(`read ${plural(samples.length, "response")} from ${plural(read.length, "file")}`);
  }

  return analysis.breaking > 0 ? 1 : 0;
};

const isDirectInvocation = (): boolean => {
  const entry = process.argv[1];
  return typeof entry === "string" && import.meta.url === pathToFileURL(entry).href;
};

if (isDirectInvocation()) {
  run(process.argv.slice(2))
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 2;
    });
}
