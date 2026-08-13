---
status: accepted
date: 2026-07-28
decision-makers: [hawkeyexl, Claude]
---

# Dedupe the generated schema artifacts with internal refs

## Context and Problem Statement

The schema build fully dereferences every `$ref` and commits the results: each `output_schemas/*.schema.json`, the aggregate `schemas.json`, and the published `dist/schemas/*` carry every shared component inlined at every use site. Composition multiplies brutally — the element-criteria block alone appears ~200 times inside `step_v3` and shared components repeat ~15,000 times across the outputs — so `schemas.json` reached ~58–70 MB and a single new criteria-site component pushed it past GitHub's 100 MB per-file limit during PR #691, blocking the push and forcing that schema component to stay artificially terse (its `region` shape moved to runtime validation). The published CJS bundle also inlines the aggregate, so `dist/index.cjs` carried the same tens of megabytes. How do we keep the committed and published artifacts small without changing what any consumer observes?

## Decision Drivers

- `validate()` behavior must be exactly identical (src/common's suite and 100% coverage ratchet must pass unchanged).
- The generated docs reference pages and generated TypeScript types must remain byte-identical.
- The fix must be verifiable, not hoped-for: a wrong artifact must fail the build, not ship.
- Authored source schemas must stay untouched — this is an artifact-encoding change only.

## Considered Options

1. Post-dereference structural dedupe: hoist repeated subtrees into a reserved container with internal `$ref`s; consumers expand in memory.
2. `parser.bundle()` instead of `parser.dereference()` (library-native internal refs).
3. Stop committing the generated artifacts (build on demand) or commit compressed (`.gz`).

## Decision Outcome

Chosen option: **post-dereference structural dedupe** (option 1), implemented in `src/common/src/schemas/dedupe.cjs`.

- `dereferenceSchemas.cjs` still dereferences exactly as before, then compresses each output: object subtrees whose serialization is ≥120 bytes and occurs ≥2 times hoist into a reserved `x_dd_defs` container (content-hash names, deterministic output) and are replaced by single-key `{"$ref": "#/x_dd_defs/<name>"}` nodes. Definitions compress bottom-up, so nested repetition dedupes maximally.
- The build **self-verifies**: after compressing, it expands the result and fails hard unless the expansion `JSON.stringify`-equals the dereferenced tree. A compression bug cannot ship a wrong artifact.
- Consumers never see the encoding. `schemas/index.ts` expands at module load, so `validate()`'s AJV registration receives the same fully-inlined structures as before (fresh trees, no shared identity). The docs generators and the type generator expand before walking, keeping their outputs byte-identical.
- The container key is deliberately not `definitions`/`$defs` (authored schemas own those — `config_v2` uses `definitions`), and only a single-key `$ref` into the container is treated as dedupe plumbing; authored `$ref`s pass through untouched. Compression refuses inputs that already use the reserved namespace.

### Consequences

- Good: `schemas.json` ~69.7 MB → ~2.4 MB; the largest per-schema output drops from ~22 MB to ~320 KB; `dist/index.cjs` ~70 MB → ~2.4 MB. Headroom to the 100 MB limit stops constraining schema authoring (the PR #691 terseness can be revisited).
- Good: equivalence is proven, not assumed — expansion of the new committed artifacts reproduces the previous committed artifacts byte-for-byte for all 54 schemas, and the round-trip check runs on every build.
- Neutral: the **published** `dist/schemas/*.schema.json` and the package's `schemas.json` now carry the deduped encoding. In-package consumers (`doc-detective-common`'s exports) receive expanded objects as before; anything reading the raw published JSON files directly must expand `x_dd_defs` refs (standard JSON-pointer resolution) or consume the package export instead.
- Bad: one more concept in the schema pipeline (compress/expand pair), mitigated by the pair living in a single ~200-line CJS module with its own unit suite.

### Confirmation

`src/common/test/dedupe.test.js` (round-trip, determinism, namespace guards, authored-`definitions` passthrough, fresh-tree expansion); the build-time round-trip assertion in `dereferenceSchemas.cjs`; byte-identical regeneration of `src/common/src/types/generated/` and `docs/fern/pages/reference/` (both verified empty-diff); src/common's full suite + 100% coverage ratchet; root suite green.

## Pros and Cons of the Options

### Post-dereference structural dedupe (chosen)

- Good: upstream dereference semantics untouched; equivalence verifiable by construction; also dedupes subtrees that were *authored* duplicated across files, which ref-based approaches can't see.
- Bad: custom encoding, custom expansion.

### parser.bundle()

- Good: library-native.
- Bad: empirically broken here — bundling multiply-included documents produced self-refs re-anchored against source-file coordinates that don't exist in the bundled output (unresolvable pointers in `resolvedTests_v3`), and its output differs structurally from the dereferenced artifacts, so "docs pages stay identical" can't be guaranteed without the same expansion machinery anyway.

### Don't commit / compress the artifacts

- Good: no encoding at all (build-on-demand) or maximal shrink (`.gz`).
- Bad: build-on-demand breaks the documented no-build consumers (docs generators read the committed bundle directly) and every fresh-clone flow; `.gz` breaks every `require()`/import site and git diffability. Both are bigger contract changes than an in-band encoding.

## More Information

- Trigger: PR #691 (visual element matching), where `schemas.json` hit 105.6 MB and the push was rejected by GitHub's pre-receive hook.
- Measured multiplication: ~200 copies of the element-criteria block inside `step_v3.schema.json`; ~2,886 copies of the `image` component in `schemas.json` alone.
