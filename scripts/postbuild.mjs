import { readFile, writeFile } from "node:fs/promises";

// The bundler strips module-level directives and does not add a hashbang, so
// both are applied here rather than in source. Ordering matters: this runs after
// every tsdown config has finished, which per-config hooks cannot guarantee.
const PREPEND = [
  // dist/index.js must NOT be marked client-only — that would break the headless
  // CI entry (HANDOFF 7.10)
  { file: "dist/react.js", line: '"use client";' },
  { file: "dist/ci.js", line: "#!/usr/bin/env node" },
];

await Promise.all(
  PREPEND.map(async ({ file, line }) => {
    const source = await readFile(file, "utf8");
    if (source.startsWith(line)) return;
    await writeFile(file, `${line}\n${source}`);
  }),
);

console.log(`postbuild ok — ${PREPEND.length} files annotated`);
