---
status: accepted
date: 2025-03-13
decision-makers: doc-detective maintainers
---

# v3 spec/test source-file resolution

## Context and Problem Statement

The `common` schema family had moved to v3 (`step_v3` action-as-key, `config_v3`, `context_v3`), but `core`'s detection/parsing layer still resolved source files against the v2 contract: it validated `spec_v2`, used `setup`/`cleanup` test fields, keyed specs and tests on `id`/`file`, and ran the old single-match markup parser. Once the schemas changed, the resolver had to be re-pointed at v3 — but that touched the whole detect→parse→resolve pipeline at once: which schema a source file validates against, what the lifecycle fields are called, how paths resolve, and how markup is turned into steps. What should v3 source-file resolution look like end to end?

## Decision Drivers

* Source files must validate against the new `spec_v3` container, not `spec_v2`.
* Field names must match the v3 schema vocabulary (`specId`/`contentPath`, `before`/`after`).
* Markup parsing must support the v3 multi-match engine with capture-group substitution.
* Path resolution must accept the object-argument `resolvePaths` signature.
* Extension handling must be consistent (bare `"json"`, not `".json"`).

## Considered Options

* **A. Re-point the entire resolver pipeline at v3 in one coordinated change** (chosen).
* **B. Keep resolving v2 and transform to v3 after parsing.**
* **C. Maintain dual v2/v3 resolution paths side by side.**

## Decision Outcome

Chosen option: **A**, because the resolver is the single entry to detection and a half-migrated pipeline would validate one shape and emit another. The v3 resolution contract:

1. `isValidSourceFile` validates specs against **`spec_v3`** (was `spec_v2`).
2. Test lifecycle fields renamed `setup`/`cleanup` → **`before`/`after`**.
3. `allowedExtensions` switched from `".json"` to bare `"json"`.
4. `resolvePaths` takes the **object argument** form.
5. `defaultFileTypes` ships a Markdown definition with `inlineStatements` regexes.
6. `parseContent` uses the `matchAll` engine with **`$n` capture-group substitution**.
7. Spec keys renamed `id`/`file` → **`specId`/`contentPath`**.

Commits `367a701`, `7bbacda`, `e857b37`, `736b599`, `11ba3e2`, `d31daf1`, `c1682b0`, `05162740`, `e2d8d14`, `d4a451d` in `core`.

### Consequences

* Good: detection emits v3-shaped specs that validate against the schemas the runner consumes.
* Good: capture-group substitution makes markup-to-step generation far more expressive.
* Bad: a breaking rename of lifecycle and identity fields for any caller of the resolver.
* Neutral: this pipeline is later re-baselined as the standalone `doc-detective-resolver` package (`00111`).

### Confirmation

Shipped across the `core` commits above; `spec_v3` validation, the `before`/`after` rename, and `specId`/`contentPath` keys are exercised by the v3 runner adoption (`00100`) and downstream fixtures.

## Pros and Cons of the Options

### A. One coordinated v3 re-point
* Good: pipeline validates and emits the same (v3) shape; no impedance mismatch.
* Bad: large simultaneous rename surface.

### B. Resolve v2, transform after
* Good: smaller resolver diff.
* Bad: keeps a dead v2 path and a transform step in the hot loop.

### C. Dual v2/v3 paths
* Good: backward compatible.
* Bad: two detection codepaths to keep in sync indefinitely.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `367a701`, `7bbacda`, `e857b37`, `736b599`, `11ba3e2`, `d31daf1`, `c1682b0`, `05162740`, `e2d8d14`, `d4a451d`. Inventory ref: BACKFILL-INVENTORY.md Seq 145. Related: `00096` (v3 schema redesign), `00100` (v3 runner adoption), `00102` (YAML specs), `00111` (resolver package).
