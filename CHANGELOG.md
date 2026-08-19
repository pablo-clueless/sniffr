# Changelog

All notable changes to **sniffr** are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- Structural IR (`core/shape.ts`) with union, equality, rendering, and literal widening.
- `core/infer.ts`, `core/merge.ts` — JSON to shape, and observation-side widening with
  an enum cardinality cap of 12.
- `core/from-zod.ts` — zod v3/v4 to shape via structural `_def` reads, no zod import.
- `core/diff.ts` — assignability-based classification into breaking / additive / info.
- `core/route.ts` — route normalization with explicit pattern overrides.
- `runtime/intercept.ts` — non-throwing `fetch` and `XMLHttpRequest` capture.
- `runtime/store.ts` — one observed model per endpoint.
- `ui/overlay.ts` — plain-DOM panel in a shadow root.
- `sniffr/react` and `sniffr/vue` adapters over the shared framework-agnostic core.
- `example/drift.ts` — worked drift scenario.
