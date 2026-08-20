# sniffr-example

A React + Vite app wired up with sniffr the way a real consumer would be.

```bash
pnpm install
pnpm dev
```

`predev` builds the parent package first. sniffr is linked as a directory
(`"@pablo_clueless/sniffr": "link:../.."`), so the app imports the **built**
`dist/` through the package's real exports map — the same path an npm consumer
takes, `"use client"` and all. Rebuild the parent after changing its source:

```bash
pnpm --dir ../.. build
```

## What it demonstrates

Four buttons, all hitting the real
[jsonplaceholder](https://jsonplaceholder.typicode.com) API. No mock server, so
this needs a network connection.

The schemas in `src/sniffr.ts` contain a mistake a real codebase would make:

```ts
const Geo = z.object({
  lat: z.number(), // jsonplaceholder actually sends "-37.3159"
  lng: z.number(),
});
```

Click **GET /users** and sniffr says so immediately:

```
[BREAKING] $[].address.geo.lat  number -> string
[BREAKING] $[].address.geo.lng  number -> string
```

The other buttons show the rest of the engine:

| Button         | What it shows                                                          |
| -------------- | ---------------------------------------------------------------------- |
| `GET /users`   | the `geo` mistake, on an array response                                |
| `GET /users/1` | route normalisation — a separate model, keyed `/users/:id`             |
| `GET /posts`   | clean, and 100 rows widen `title` past the enum cap to `string`        |
| `POST /posts`  | a request body sending `userId` as a string; marked `req` in the panel |

## How it is wired

- `src/sniffr.ts` — the schemas and a `start()` that returns `{ stop }`.
  `overlay: false`, because `<SniffrOverlay />` mounts the panel instead. Leave it
  on and you get two pills.
- `src/sniffr-devtools.tsx` — everything that touches sniffr: `start()` in a
  `useEffect`, `useSniffr()` for the live model, and `<SniffrOverlay />`.
- `src/App.tsx` — reaches that module through a **dynamic** import:

  ```tsx
  const SniffrDevtools = import.meta.env.DEV ? lazy(() => import("./sniffr-devtools")) : null;
  ```

## Why the dynamic import

A plain `{import.meta.env.DEV && <SniffrOverlay />}` guards the _rendering_, not
the _import graph_. Static imports still pull sniffr — and zod, via
`src/sniffr.ts` — into the production bundle even though nothing renders them.

Measured on this app:

| Wiring                             | bundle    | gzip     |
| ---------------------------------- | --------- | -------- |
| static imports, `DEV &&` on render | 275.16 kB | 83.57 kB |
| dynamic import behind `DEV`        | 191.83 kB | 60.53 kB |

With the dynamic import, `DEV` folds to `false`, the `lazy()` call becomes
unreachable, and rollup drops the whole graph — no sniffr strings, no zod, and no
orphan chunk. Verify it yourself:

```bash
pnpm build && grep -c "sniffr:v1:\|ZodError" dist/assets/index-*.js   # 0
```
