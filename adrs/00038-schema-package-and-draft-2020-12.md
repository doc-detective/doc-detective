---
status: accepted
date: 2023-01-26
decision-makers: doc-detective maintainers
---

# Standalone schema package on JSON-Schema draft 2020-12 with a dynamic loader

## Context and Problem Statement

As the engine was being unbundled into `doc-detective-core`, the test/step/config contracts needed
to live somewhere both the engine and the CLI could share without re-implementing validation. There
was no canonical schema shape, no agreed JSON-Schema dialect, and no mechanism to load a growing set
of per-action schema files. What shape should a schema take, which JSON-Schema draft governs it, and
how are the `*.schema.json` files discovered and wired together?

## Decision Drivers

* A single shared, versionable source of truth for contracts across repos.
* A modern JSON-Schema dialect that supports the constructs the project needs.
* Per-action schema files that can be added without editing a central registry.
* Stable, resolvable cross-schema references.

## Considered Options

* **A. Standalone `common` package: per-file schemas, draft 2020-12, dynamic filename-driven loader** (chosen).
* **B. One monolithic schema file.**
* **C. Inline schemas inside the engine, no shared package.**

## Decision Outcome

Chosen option: **A**, because a dedicated package with a convention-driven loader lets the schema set
grow file-by-file while staying centrally consumable, and draft 2020-12 gives the needed expressive
power.

Behavior decided:

1. **Schema shape** — each step schema declares an `action` enum, `additionalProperties: false`, and
   a `required` list, on JSON-Schema **draft 2020-12** (`$schema` set accordingly).
2. **Dynamic loader** — a loader builds the schema map from `*.schema.json` filenames using flat
   `<name>_v<n>` naming, assigns a dynamic `$id` of `file://…`, and rewrites relative `$ref`s so
   cross-references resolve.

### Consequences

* Good: one shared, versioned contract surface; new schemas drop in by filename.
* Good: `additionalProperties: false` makes contracts strict and typo-resistant.
* Good: draft 2020-12 underpins later `$ref`/`anyOf` composition.
* Neutral: filename-as-identity convention must be honored or the loader misses files.
* Bad: dynamic `file://` `$id`s and relative-`$ref` rewriting add loader complexity later revisited
  by the authored-vs-dereferenced split.

### Confirmation

Shipped behavior in `common`: `runShell.schema.json` etc. with `$schema` draft-2020-12, strict
shape, and the dynamic loader building the map from `*.schema.json` filenames.

## Pros and Cons of the Options

### A. Standalone package + draft 2020-12 + dynamic loader
* Good: shared, strict, extensible by filename; modern dialect.
* Bad: loader/`$id` complexity.

### B. Monolithic schema
* Good: one file, simple references.
* Bad: unwieldy; hard to grow per action; merge conflicts.

### C. Inline in the engine
* Good: no extra package.
* Bad: not shareable; duplication across repos.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `fd19d0fc`, `c580937b`
(shape/draft) and `ada73318`, `6b9b8d62`, `dde6be9c`, `f79ce35d`, `a13ba446` (loader). Inventory ref:
BACKFILL-INVENTORY.md Seq 55, 60. Related: the v1 step vocabulary and test container (`00040`), AJV
adoption (`00041`), and the authored-vs-dereferenced schema split (`00053`).
