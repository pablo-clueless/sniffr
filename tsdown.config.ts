import { defineConfig, type UserConfig } from "tsdown";

// Typed rather than `as const`: a const assertion makes `format` a readonly
// tuple, which UserConfig's mutable ModuleFormat[] rejects.
const shared: UserConfig = {
  format: ["esm"],
  sourcemap: true,
  // rolldown-plugin-dts handles TS 7, which tsup's could not — so no separate
  // tsc declaration pass
  dts: true,
  clean: false,
  hash: false,
  unbundle: false,
  // the package is "type": "module", so every entry is .js — without this the
  // node build lands on ci.mjs and package.json's bin points at nothing
  outExtensions: () => ({ js: ".js" }),
};

export default defineConfig([
  {
    ...shared,
    entry: {
      index: "src/index.ts",
      react: "src/adapters/react.tsx",
      vue: "src/adapters/vue.ts",
      svelte: "src/adapters/svelte.ts",
      solid: "src/adapters/solid.ts",
    },
    platform: "browser",
    target: "es2022",
    // every entry must share one chunk, or a consumer importing both `sniffr`
    // and `sniffr/react` gets two stores (HANDOFF 7.9)
    deps: { neverBundle: ["react", "react/jsx-runtime", "vue", "solid-js"] },
  },
  {
    ...shared,
    entry: { ci: "src/ci/cli.ts" },
    platform: "node",
    target: "node22",
    // resolved from the host project at runtime, never bundled
    deps: { neverBundle: ["tsx", "tsx/esm/api"] },
  },
]);
