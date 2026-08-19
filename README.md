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

### Vue

```vue
<script setup lang="ts">
import { SniffrOverlay, useSniffr } from "@pablo_clueless/sniffr/vue";
</script>

<template><SniffrOverlay /></template>
```

`react` and `vue` are optional peers — a Vue user is never asked to install React,
and the core entry pulls in neither.

## API

| Export                                        | Entry                        | What it does                                     |
| --------------------------------------------- | ---------------------------- | ------------------------------------------------ |
| `sniffr(options)`                             | `sniffr`                     | install interceptors + overlay, returns `stop()` |
| `mountOverlay(target?)`                       | `sniffr`                     | mount the panel yourself, returns `unmount()`    |
| `sniffrStore`, `endpoints`                    | `sniffr`                     | the observed model, one entry per endpoint       |
| `intercept(options)`                          | `sniffr`                     | capture without any UI                           |
| `fromZod`, `infer`, `merge`, `diff`, `render` | `sniffr`                     | the engine, usable headless in node              |
| `<SniffrOverlay />`, `useSniffr`              | `sniffr/react`, `sniffr/vue` | framework bindings                               |

### Options

| Option         | Default  | Meaning                                              |
| -------------- | -------- | ---------------------------------------------------- |
| `schemas`      | `{}`     | `"METHOD /route"` (or just `"/route"`) -> zod schema |
| `routes`       | `[]`     | explicit route patterns, e.g. `/api/posts/:slug`     |
| `overlay`      | `true`   | set `false` to collect without mounting the panel    |
| `target`       | `body`   | where to attach the overlay host                     |
| `maxBodyBytes` | `524288` | responses larger than this are skipped               |

Route params are guessed (`/users/123` -> `/users/:id`), but conservatively: word
slugs like `/posts/how-to-build-a-dev-tool` are left intact, and so is any token
containing `-` or `_`. If your ids carry separators, declare them explicitly:
`routes: ["/api/users/:id"]`.

The overlay renders into a shadow root, so no CSS crosses in either direction.

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
| `--json`             | machine-readable output                        |

`--schemas` is loaded with dynamic `import()`. If your schemas are TypeScript,
run the CLI under `tsx`, or point it at built JS.

## Requirements

zod v4 or v3 — both are covered by tests, and sniffr picks the right reader from
the schema's internals. Any bundler that can read ESM. sniffr reads zod's `_def` structurally and never imports zod, so it adds
nothing to your dependency tree.

## License

[License](./LICENSE)
