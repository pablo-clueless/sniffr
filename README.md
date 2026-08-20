# @pablo_clueless/sniffr

> Watch live API responses in the browser, model what each endpoint _actually_
> returns, and diff that against your zod schemas. Breaking changes surface in an
> overlay the moment a response drifts.

TypeScript types don't exist at runtime. sniffr compiles both sides — your zod
schemas and the JSON actually coming back — into one structural IR, then diffs
them:

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
npm i -D @pablo_clueless/sniffr
```

## Use

```ts
import { sniffr } from "@pablo_clueless/sniffr";
import { z } from "zod";

if (process.env.NODE_ENV !== "production") {
  sniffr({
    schemas: {
      "GET /api/users": z.object({ data: z.array(User) }),
      "GET /api/users/:id": User,
    },
  });
}
```

That patches `fetch` and `XMLHttpRequest`, models every JSON response, and mounts
the overlay. Interceptors never throw into your app — a failure inside sniffr
returns your response untouched. On the server `sniffr()` is a no-op, so it never
touches a server `fetch`.

### React

```tsx
import { SniffrOverlay, useSniffr } from "@pablo_clueless/sniffr/react";

<SniffrOverlay />;
```

### Next.js

`sniffr/react` ships `"use client"`, so `<SniffrOverlay />` can be rendered
straight from a server component — put it in your root layout behind a dev check:

```tsx
// app/layout.tsx
import { SniffrOverlay } from "@pablo_clueless/sniffr/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        {process.env.NODE_ENV !== "production" && <SniffrOverlay />}
      </body>
    </html>
  );
}
```

Registering schemas and installing the interceptors has to happen in the browser,
so call `sniffr()` from a client component:

```tsx
"use client";
import { useEffect } from "react";
import { sniffr } from "@pablo_clueless/sniffr";

export function SniffrProvider() {
  useEffect(() => sniffr({ overlay: false, schemas: { "GET /api/users": Users } }).stop, []);
  return null;
}
```

`sniffr()` returns early on the server, so importing it from shared code is safe —
it will never patch the `fetch` Next.js instruments for caching.

### Svelte

No `svelte` import and no peer dependency — the store contract and actions are
plain objects and functions:

```svelte
<script lang="ts">
  import { sniffrState, overlay } from "@pablo_clueless/sniffr/svelte";
</script>

<div use:overlay />
<p>{Object.keys($sniffrState.models).length} endpoints seen</p>
```

### Solid

```tsx
import { SniffrOverlay, useSniffr } from "@pablo_clueless/sniffr/solid";

<SniffrOverlay />;
```

### Vue

```vue
<script setup lang="ts">
import { SniffrOverlay, useSniffr } from "@pablo_clueless/sniffr/vue";
</script>

<template><SniffrOverlay /></template>
```

`react`, `vue` and `solid-js` are optional peers — a Vue user is never asked to
install React, and the core entry pulls in none of them. The Svelte entry has no
peer at all.

## API

| Export                                        | Entry                                        | What it does                                     |
| --------------------------------------------- | -------------------------------------------- | ------------------------------------------------ |
| `sniffr(options)`                             | `sniffr`                                     | install interceptors + overlay, returns `stop()` |
| `mountOverlay(target?)`                       | `sniffr`                                     | mount the panel yourself, returns `unmount()`    |
| `sniffrStore`, `endpoints`                    | `sniffr`                                     | the observed model, one entry per endpoint       |
| `intercept(options)`                          | `sniffr`                                     | capture without any UI                           |
| `fromZod`, `infer`, `merge`, `diff`, `render` | `sniffr`                                     | the engine, usable headless in node              |
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
resize, filter by route, `Escape` to close. It reopens the way you left it. It renders into a shadow root, so no CSS crosses in
either direction.

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

## Requirements

zod v4 or v3 — both are covered by tests, and sniffr picks the right reader from
the schema's internals. Any bundler that can read ESM. sniffr reads zod's `_def` structurally and never imports zod, so it adds
nothing to your dependency tree.

## License

[License](./LICENSE)
