---
status: accepted
date: 2022-09-22
decision-makers: doc-detective maintainers
---

# Setup and cleanup lifecycle hooks

## Context and Problem Statement

Test runs often need preparatory work before the main tests (seed state, authenticate) and teardown
afterward (restore state, clean up artifacts). Doc Detective could only run the `input` tests, with
no way to declare tests that should run before or after them. The runner needed config-level `setup`
and `cleanup` hooks, reachable from CLI flags and environment variables, that run extra tests around
the main `input` set. How should these hooks be declared and wired?

## Decision Drivers

* Runs need deterministic before/after phases for environment preparation and teardown.
* The hooks must be reachable from config, CLI, and environment (the three config surfaces).
* Setup runs before the `input` tests; cleanup runs after them.
* CLI short-alias collisions (`-s`/`-c`) must be resolved cleanly.

## Considered Options

* **A. `setup`/`cleanup` config fields with `--setup`/`--cleanup` flags and `DOC_SETUP`/`DOC_CLEANUP` env vars** (chosen).
* **B. Require users to chain separate Doc Detective invocations for pre/post work.**
* **C. A single ordered list mixing setup, main, and cleanup tests.**

## Decision Outcome

Chosen option: **A**, because declarative `setup`/`cleanup` fields reachable from all three config
surfaces give deterministic before/after phases without external orchestration. The runner runs the
`setup` tests before the `input` tests and the `cleanup` tests after them. The hooks are settable via
config fields, the `--setup`/`--cleanup` CLI flags, and the `DOC_SETUP`/`DOC_CLEANUP` environment
variables. The `-s`/`-c` short aliases were removed to avoid collisions.

This established the run-level lifecycle-hook model; the broader ordering contract (including how
these phases interact with concurrency, and per-test before/after steps) was later generalized in
`01000`.

### Consequences

* Good: deterministic before/after phases for environment prep and teardown.
* Good: reachable from config, CLI, and env — consistent with other knobs.
* Bad: removing `-s`/`-c` short aliases is a small breaking CLI change.
* Neutral: defines the phase model later generalized for concurrent runs (`01000`).

### Confirmation

Shipped in commits `3fd6a364`, `09ade5f1`, `eb721fdc`, `119cbf40`: extra tests run before/after the
`input` tests. Generalized ordering confirmed by `01000`.

## Pros and Cons of the Options

### A. setup/cleanup fields + flags + env
* Good: declarative, multi-surface, deterministic.
* Bad: drops `-s`/`-c` aliases.

### B. Chained invocations
* Good: no new fields.
* Bad: external orchestration; no shared run context/report.

### C. Single mixed ordered list
* Good: one list to reason about.
* Bad: loses the explicit phase semantics setup/cleanup provide.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `3fd6a364`, `09ade5f1`,
`eb721fdc`, `119cbf40`. Inventory ref: BACKFILL-INVENTORY.md Seq 36. Generalized by `01000`
(advanced ordering under concurrent runners).
