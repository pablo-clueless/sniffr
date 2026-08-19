# sniffr

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
npm i -D sniffr
```

## Use

```ts
import { sniffr } from "sniffr";
import { z } from "zod";

if (import.meta.env.DEV) {
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
returns your response untouched.

### React

```tsx
import { SniffrOverlay, useSniffr } from "sniffr/react";

<SniffrOverlay />;
```

### Vue

```vue
<script setup lang="ts">
import { SniffrOverlay, useSniffr } from "sniffr/vue";
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

Route params are guessed (`/users/123` -> `/users/:id`). Slug-heavy paths should
be declared explicitly via `routes` — see `HANDOFF.md` §8.

The overlay renders into a shadow root, so no CSS crosses in either direction.

## Requirements

zod v4 (v3 is supported structurally but untested), and any bundler that can read
ESM. sniffr reads zod's `_def` structurally and never imports zod, so it adds
nothing to your dependency tree.

## License

MIT
