import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsup";

const CLIENT_ENTRIES = ["dist/react.js"];

const preserveUseClient = async (): Promise<void> => {
  await Promise.all(
    CLIENT_ENTRIES.map(async (file) => {
      const source = await readFile(file, "utf8");
      if (source.startsWith('"use client"')) return;
      await writeFile(file, `"use client";\n${source}`);
    }),
  );
};

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      react: "src/adapters/react.tsx",
      vue: "src/adapters/vue.ts",
      svelte: "src/adapters/svelte.ts",
      solid: "src/adapters/solid.ts",
    },
    format: ["esm"],
    target: "es2022",
    platform: "browser",
    splitting: true,
    treeshake: true,
    clean: true,
    dts: false,
    sourcemap: true,
    external: ["react", "react/jsx-runtime", "vue", "solid-js"],
    onSuccess: preserveUseClient,
  },
  {
    entry: { ci: "src/ci/cli.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    splitting: false,
    treeshake: true,
    clean: false,
    dts: false,
    sourcemap: true,
    banner: { js: "#!/usr/bin/env node" },
  },
]);
