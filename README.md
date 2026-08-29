# @pablo-clueless/sniffr

> Watch live API responses in the browser, model what each endpoint _actually_
> returns, and diff that against your zod schemas — or your OpenAPI spec.
> Breaking changes surface in an overlay the moment a response drifts.

TypeScript types don't exist at runtime. sniffr compiles both sides — the
contract you declared and the JSON actually coming back — into one structural IR,
then diffs them:

```
capture -> normalize route -> infer shape -> merge into running model -> diff vs expected -> classify
```

| Severity   | Cause                                                           |
| ---------- | --------------------------------------------------------------- |
| `breaking` | observed is not assignable to expected                          |
| `additive` | the response carries a field your schema doesn't describe       |
| `info`     | an optional field or union branch that hasn't been observed yet |

Same type with a different value produces nothing.

## Install

```bash
npm i -D @pablo-clueless/sniffr
```

## Use

Setup is the same everywhere: **one `sniffr()` call, one overlay.** Only where you
put them changes per framework.

sniffr never looks for a file by name — there is no config file, nothing to
scaffold, no `sniffr.config.ts` convention. Putting the call in a module you
import once is just a tidy habit:

```ts
// src/sniffr.ts — call it whatever you like
import { sniffr } from "@pablo-clueless/sniffr";
import { z } from "zod";

export const schemas = {
  "GET /api/users": z.object({ data: z.array(User) }),
  "GET /api/users/:id": User,
  "POST /api/users": { request: CreateUser, response: User },
};

export const start = () =>
  sniffr({
    schemas,
    persist: true, // measure drift against yesterday, not just this session
    routes: ["/api/posts/:slug"], // ids that sniffr should not guess
    overlay: false, // the framework component below mounts it
  });
```

`start()` patches `fetch` and `XMLHttpRequest`, models every JSON response, and
returns `{ stop }` to undo it. Interceptors never throw into your app — a failure
inside sniffr returns your response untouched. On the server it is a no-op, so
importing this module from shared code is safe.

> **Pass `overlay: false` whenever you render `<SniffrOverlay />`.** Otherwise
> `sniffr()` mounts a panel _and_ the component mounts a second one, and you get
> two pills.

### Setup by framework

| Framework | Mount the overlay     | Read the state                      |
| --------- | --------------------- | ----------------------------------- |
| none      | `sniffr()` does it    | `sniffrStore.getState()`            |
| React     | `<SniffrOverlay />`   | `useSniffr()` → state               |
| Vue       | `<SniffrOverlay />`   | `useSniffr()` → `ShallowRef<state>` |
| Solid     | `<SniffrOverlay />`   | `useSniffr()` → `Accessor<state>`   |
| Svelte    | `<div use:overlay />` | `$sniffrState`                      |

#### No framework

Drop `overlay: false` and you are done — nothing else to wire up.

```ts
import { sniffr } from "@pablo-clueless/sniffr";
import { schemas } from "./sniffr";

if (import.meta.env.DEV) sniffr({ schemas, persist: true });
```

#### React

```tsx
import { useEffect } from "react";
import { SniffrOverlay, useSniffr } from "@pablo-clueless/sniffr/react";
import { start } from "./sniffr";

export function App() {
  // start() returns { stop }, which is exactly the cleanup useEffect wants
  useEffect(() => start().stop, []);
  const { models } = useSniffr();

  return (
    <>
      <p>{Object.keys(models).length} endpoints observed</p>
      <SniffrOverlay />
    </>
  );
}
```

#### Next.js (App Router)

`sniffr/react` ships `"use client"`, so `<SniffrOverlay />` renders straight from
a server component. Interceptors still have to be installed in the browser, so
they go in a client component:

```tsx
// app/sniffr-provider.tsx
"use client";
import { useEffect } from "react";
import { start } from "@/sniffr";

export function SniffrProvider() {
  useEffect(() => start().stop, []);
  return null;
}
```

```tsx
// app/layout.tsx
import { SniffrOverlay } from "@pablo-clueless/sniffr/react";
import { SniffrProvider } from "./sniffr-provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const dev = process.env.NODE_ENV !== "production";
  return (
    <html lang="en">
      <body>
        {children}
        {dev && <SniffrProvider />}
        {dev && <SniffrOverlay />}
      </body>
    </html>
  );
}
```

#### Vue

```vue
<script setup lang="ts">
import { onMounted, onUnmounted } from "vue";
import { SniffrOverlay, useSniffr } from "@pablo-clueless/sniffr/vue";
import { start } from "./sniffr";

let handle: ReturnType<typeof start> | null = null;
onMounted(() => (handle = start()));
onUnmounted(() => handle?.stop());

const state = useSniffr(); // ShallowRef, so read state.value
</script>

<template>
  <p>{{ Object.keys(state.models).length }} endpoints observed</p>
  <SniffrOverlay />
</template>
```

#### Svelte

No `svelte` import and no peer dependency — a store is an object with
`subscribe`, and an action is a plain function, so this entry works with any
Svelte version:

```svelte
<script lang="ts">
  import { onMount } from "svelte";
  import { overlay, sniffrState } from "@pablo-clueless/sniffr/svelte";
  import { start } from "./sniffr";

  onMount(() => start().stop);
</script>

<p>{Object.keys($sniffrState.models).length} endpoints observed</p>
<div use:overlay />
```

#### Solid

```tsx
import { onCleanup } from "solid-js";
import { SniffrOverlay, useSniffr } from "@pablo-clueless/sniffr/solid";
import { start } from "./sniffr";

export function App() {
  onCleanup(start().stop);
  const state = useSniffr(); // an Accessor, so call it

  return (
    <>
      <p>{Object.keys(state().models).length} endpoints observed</p>
      <SniffrOverlay />
    </>
  );
}
```

`react`, `vue` and `solid-js` are optional peers — a Vue user is never asked to
install React, and the core entry pulls in none of them. The Svelte entry has no
peer at all.

### Keeping it out of your production bundle

`{import.meta.env.DEV && <SniffrOverlay />}` guards the **rendering**, not the
**import graph**. A static import still pulls sniffr — and zod, through your
schema module — into the production bundle, even though nothing renders it.

Put everything that touches sniffr in one module and reach it dynamically:

```tsx
// src/sniffr-devtools.tsx — start(), useSniffr() and <SniffrOverlay /> all live here
```

```tsx
// wherever you mount it
const SniffrDevtools = import.meta.env.DEV ? lazy(() => import("./sniffr-devtools")) : null;

{
  SniffrDevtools && (
    <Suspense fallback={null}>
      <SniffrDevtools />
    </Suspense>
  );
}
```

With `DEV` folded to `false`, the `lazy()` call is unreachable and the bundler
drops the whole graph. On `example/sniffr-example` that is **275 kB → 192 kB**
(84 kB → 61 kB gzipped), with no orphan chunk left behind. Check your own build
the same way:

```bash
grep -c "sniffr:v1:" dist/assets/*.js   # 0
```

The same shape works anywhere: Vue's `defineAsyncComponent`, Svelte's `{#await
import(...)}`, Solid's `lazy` — the point is the dynamic `import()`, not the
framework.

### Registering schemas later

`schemas` on the `sniffr()` call is the usual route, but you can add more at any
time — handy when routes are code-split:

```ts
import { sniffrStore } from "@pablo-clueless/sniffr";

sniffrStore.getState().registerSchemas({ "GET /api/orders": Order });
```

Anything already observed is re-diffed against the new schema immediately.

## API

| Export                                        | Entry                                        | What it does                                     |
| --------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `sniffr(options)`                             | `sniffr`                                     | install interceptors + overlay, returns `stop()` |
| `mountOverlay(target?)`                       | `sniffr`                                     | mount the panel yourself, returns `unmount()`    |
| `sniffrStore`, `endpoints`                    | `sniffr`                                     | the observed model, one entry per endpoint       |
| `intercept(options)`                          | `sniffr`                                     | capture without any UI                           |
| `fromZod`, `infer`, `merge`, `diff`, `render` | `sniffr`                                     | the engine, usable headless in node              |
| `fromOpenApi`, `schemasFromOpenApi`           | `sniffr`                                     | compile an OpenAPI 3.x document instead of zod   |
| `fromValibot`, `toShape`                      | `sniffr`                                     | valibot, or whatever a schema turns out to be    |
| `<SniffrOverlay />`, `useSniffr`              | `sniffr/react`, `sniffr/vue`, `sniffr/solid` | framework bindings                               |
| `sniffrState`, `overlay`                      | `sniffr/svelte`                              | store contract + action, no svelte import        |
| `analyze`, `renderReport`                     | `sniffr/ci`                                  | the headless pipeline                            |

### Options

| Option         | Default  | Meaning                                              |
| -------------- | -------- | ---------------------------------------------------- |
| `schemas`      | `{}`     | `"METHOD /route"` (or just `"/route"`) -> zod schema |
| `routes`       | `[]`     | explicit route patterns, e.g. `/api/posts/:slug`     |
| `overlay`      | `true`   | set `false` to collect without mounting the panel    |
| `target`       | `body`   | where to attach the overlay host                     |
| `maxBodyBytes` | `524288` | responses larger than this are skipped               |
| `persist`      | `false`  | remember observations across reloads (see below)     |

Route params are guessed (`/users/123` -> `/users/:id`), but conservatively: word
slugs like `/posts/how-to-build-a-dev-tool` are left intact, and so is any token
containing `-` or `_`. If your ids carry separators, declare them explicitly:
`routes: ["/api/users/:id"]`.

The overlay is a pill in the bottom-left corner — red when something breaking is
observed, amber when the only drift is additive. Click it for a docked panel with
the endpoint list on the left and the changes on the right; drag its top edge to
resize, filter by route, `Escape` to close. The header also cycles the theme
between auto, light and dark — auto follows `prefers-color-scheme`. Drag the pill
to any corner and it stays there. It reopens
the way you left it, and renders into a shadow root, so no CSS crosses in either
direction.

Runnable examples live in `example/`: `react.html`, `vue.html` and
`overlay.html`. Run `npm run build`, serve the repo root, and open one.

### Request bodies

Give an endpoint both sides and sniffr checks what you send as well as what comes
back:

```ts
sniffr({
  schemas: {
    "GET /api/users": UserList,
    "POST /api/users": { request: CreateUser, response: User },
  },
});
```

A bare schema still means the response, so nothing changes for endpoints you have
already declared. Request findings are marked `req` in the overlay and the CLI:

```
[BREAKING] req $.role      "admin" | "member" -> "admin" | "owner"
[ADDITIVE] req $.nickname  absent -> string
```

Only JSON bodies are read — `FormData`, blobs and URL-encoded bodies are ignored.

### Remembering across reloads

```ts
sniffr({ schemas, persist: true });
```

Without this, drift is only ever measured within one page session. With it, the
observed model for each endpoint is written to localStorage and restored on the
next load, so a field that changed since _yesterday_ still shows up.

The storage key is a hash of your schemas: change one, and sniffr starts fresh
rather than comparing against observations that were never checked against it.
Pass any `{ getItem, setItem, removeItem }` object instead of `true` to store it
somewhere else.

## CI mode

The overlay catches drift while you work. The CLI catches it before merge — same
engine, no browser:

```bash
# record a session in devtools, save as HAR, then:
npx sniffr traffic.har --schemas ./src/schemas.mjs
```

```
GET /api/users  (2 samples)
  [BREAKING] $.data[].email      string -> string | null
  [BREAKING] $.data[].role       "admin" | "member" -> "admin" | "owner"
  [INFO    ] $.data[].nickname   string -> absent
  [ADDITIVE] $.data[].avatarUrl  absent -> string

2 breaking changes, 1 additive, 1 info across 2 endpoints
```

Exits `1` if anything breaking turned up, `0` otherwise — drop it straight into a
pipeline. It also reads plain fixtures, so you can commit known-good responses:

```json
{ "url": "/api/users", "body": { "data": [] } }
```

The CLI has no config file either. `--schemas` points at a module **you already
have** — wherever your zod or valibot schemas live — and `--openapi` points at a
spec you already publish. If neither exists, sniffr still runs and reports the
shapes it observed.

| Option               | Meaning                                        |
| -------------------- | ---------------------------------------------- |
| `--schemas <module>` | module exporting `schemas` or a default export |
| `--routes <a,b>`     | explicit route patterns                        |
| `--fail-on <level>`  | `breaking` (default), `additive`, or `none`    |
| `--json`             | machine-readable output                        |

TypeScript schema modules work as long as `tsx` is installed — sniffr borrows it
at runtime and never bundles it. Without it you get a message saying so, rather
than a cryptic loader error.

Use `--fail-on additive` to stop the build when the API starts sending fields you
don't describe, or `--fail-on none` to report without ever failing.

### valibot

Pass valibot schemas anywhere zod schemas go — sniffr works out which it is
getting:

```ts
import * as v from "valibot";

import type { User } from "@/types";

sniffr({
  schemas: {
    "GET /api/users": v.object({ data: v.array(User) }),
  },
});
```

Neither library is a dependency: sniffr reads their internals structurally, so
nothing is added to your bundle either way.

### No schemas at all? Use your OpenAPI spec

```bash
npx sniffr traffic.har --openapi ./openapi.json
```

sniffr compiles the spec straight into the same internal shape it compiles zod
into, so you get identical findings without writing a single schema. `$ref`,
`allOf`/`oneOf`/`anyOf`, `enum`, `const`, `nullable` (3.0) and `type: [..., "null"]`
(3.1) are all understood, and `/users/{id}` is matched up with `/users/:id`
automatically. Request bodies come from `requestBody`.

JSON specs only — convert YAML first. You can also import `schemasFromOpenApi`
and pass the result to `sniffr({ schemas })` in the browser.

## Requirements

zod (v4 or v3), valibot, or an OpenAPI 3.x document — all three are covered by
tests, and sniffr picks the right reader from what you hand it. None of them is a
dependency; each is read structurally. Any bundler that can read ESM. sniffr reads zod's `_def` structurally and never imports zod, so it adds
nothing to your dependency tree.

## License

[License](./LICENSE)
