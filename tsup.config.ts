import { defineConfig } from "tsup";

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
});
