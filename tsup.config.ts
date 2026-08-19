import { readFile, writeFile } from "node:fs/promises";
import { defineConfig } from "tsup";

const CLIENT_ENTRIES = ["dist/react.js"];

const preserveUseClient = async (): Promise<void> => {
  for (const file of CLIENT_ENTRIES) {
    const source = await readFile(file, "utf8");
    if (source.startsWith('"use client"')) continue;
    await writeFile(file, `"use client";\n${source}`);
  }
};

export default defineConfig({
  entry: {
    index: "src/index.ts",
    react: "src/adapters/react.tsx",
    vue: "src/adapters/vue.ts",
  },
  format: ["esm"],
  target: "es2022",
  platform: "browser",
  splitting: true,
  treeshake: true,
  clean: true,
  dts: false,
  sourcemap: true,
  external: ["react", "react/jsx-runtime", "vue"],
  onSuccess: preserveUseClient,
});
