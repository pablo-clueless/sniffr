import { readFile } from "node:fs/promises";

// HANDOFF 3 gates (c) and (d), enforced rather than eyeballed. They used to be
// grep commands hardcoded to esbuild's single-quoted output; rolldown emits
// double quotes, which made gate (c) pass vacuously — it would have reported a
// clean core bundle even with react fully inlined. Match either quote.
const importsOf = (source, module) => {
  const pattern = new RegExp(`from\\s*["']${module.replaceAll("/", "\\/")}["']`, "g");
  return source.match(pattern)?.length ?? 0;
};

const FRAMEWORKS = ["react", "react/jsx-runtime", "vue", "solid-js", "svelte"];

const BROWSER_ENTRIES = ["index", "react", "vue", "svelte", "solid"];

const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};

const read = (file) => readFile(`dist/${file}`, "utf8");

const [index, react, vue, svelte, solid, ci] = await Promise.all(
  ["index.js", "react.js", "vue.js", "svelte.js", "solid.js", "ci.js"].map(read),
);

// (c) no framework may reach the core bundle
for (const framework of FRAMEWORKS) {
  check(
    importsOf(index, framework) === 0,
    `dist/index.js imports ${framework} — the core entry must stay framework-free`,
  );
}

// (d) adapters keep their framework external rather than bundled
check(importsOf(react, "react") === 1, "dist/react.js must import react exactly once");
check(importsOf(vue, "vue") === 1, "dist/vue.js must import vue exactly once");
check(importsOf(solid, "solid-js") === 1, "dist/solid.js must import solid-js exactly once");
for (const framework of FRAMEWORKS) {
  check(
    importsOf(svelte, framework) === 0,
    `dist/svelte.js imports ${framework} — that adapter is meant to be dependency-free`,
  );
}

// one shared chunk, or a consumer importing two entries gets two stores
const sources = { index, react, vue, svelte, solid };
const chunks = new Set();
for (const [name, source] of Object.entries(sources)) {
  const relative = [...source.matchAll(/from\s*["'](\.\/[^"']+)["']/g)].map((match) => match[1]);
  check(
    relative.length <= 1,
    `dist/${name}.js pulls ${relative.length} local chunks (${relative.join(", ")}) — expected at most one`,
  );
  for (const chunk of relative) chunks.add(chunk);
}
check(
  chunks.size === 1,
  `browser entries reference ${chunks.size} different chunks (${[...chunks].join(", ")}) — they must share exactly one`,
);
check(BROWSER_ENTRIES.length === 5, "browser entry list drifted from the config");

// directives applied by scripts/postbuild.mjs
check(react.startsWith('"use client"'), 'dist/react.js must start with "use client"');
check(!index.startsWith('"use client"'), 'dist/index.js must NOT be marked "use client"');
check(ci.startsWith("#!/usr/bin/env node"), "dist/ci.js must start with a hashbang");

// every entry in the exports map must actually have the types it advertises
const pkg = JSON.parse(await readFile("package.json", "utf8"));
for (const [subpath, entry] of Object.entries(pkg.exports)) {
  if (typeof entry !== "object") continue;
  for (const target of [entry.types, entry.import].filter(Boolean)) {
    const exists = await readFile(target.replace(/^\.\//, ""), "utf8").then(
      () => true,
      () => false,
    );
    check(exists, `exports["${subpath}"] points at ${target}, which does not exist`);
  }
}

if (failures.length > 0) {
  console.error(`bundle check failed (${failures.length}):\n`);
  for (const failure of failures) console.error(`  ${failure}`);
  process.exit(1);
}

console.log(`bundle ok — ${chunks.size} shared chunk, ${BROWSER_ENTRIES.length} browser entries`);
