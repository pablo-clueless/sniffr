import { readFile, readdir } from "node:fs/promises";
import { join, relative } from "node:path";

const SRC = "src";

const RULES = [
  {
    id: "HANDOFF 7.1",
    what: "core/ must stay runnable in node",
    applies: (file) => file.startsWith("src/core/"),
    forbid: [
      { pattern: /from\s+["']\.\.\/(runtime|ui|adapters)\//, why: "imports outside core/" },
      { pattern: /\bfrom\s+["'](zod|react|vue)["']/, why: "imports zod or a framework" },
      {
        pattern: /(?<![.\w])(document|window|localStorage|XMLHttpRequest)\s*[.[]/,
        why: "touches the DOM",
      },
    ],
  },
  {
    id: "HANDOFF 7.2",
    what: "only adapters/ may import a framework",
    applies: (file) => file.startsWith(SRC) && !file.startsWith("src/adapters/"),
    forbid: [{ pattern: /\bfrom\s+["'](react|vue)["']/, why: "imports react or vue" }],
  },
  {
    id: "HANDOFF 7.4",
    what: "from-zod.ts reads _def structurally and never imports zod",
    applies: (file) => file.startsWith(SRC),
    forbid: [{ pattern: /\bfrom\s+["']zod["']/, why: "imports zod" }],
  },
];

const walk = async (dir) => {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map((entry) => {
      const path = join(dir, entry.name);
      return entry.isDirectory() ? walk(path) : [path];
    }),
  );
  return files.flat();
};

const files = (await walk(SRC)).filter((file) => /\.tsx?$/.test(file));
const sources = await Promise.all(
  files.map(async (path) => ({
    file: relative(".", path).split("\\").join("/"),
    lines: (await readFile(path, "utf8")).split("\n"),
  })),
);
const failures = [];

for (const { file, lines } of sources) {
  for (const rule of RULES) {
    if (!rule.applies(file)) continue;
    for (const { pattern, why } of rule.forbid) {
      lines.forEach((line, index) => {
        if (line.trimStart().startsWith("//")) return;
        if (!pattern.test(line)) return;
        failures.push(`${file}:${index + 1}  ${rule.id} — ${why}\n    ${line.trim()}`);
      });
    }
  }
}

if (failures.length > 0) {
  console.error(`invariant check failed (${failures.length}):\n`);
  for (const failure of failures) console.error(`  ${failure}\n`);
  process.exit(1);
}

console.log(`invariants ok — ${files.length} files, ${RULES.length} rules`);
