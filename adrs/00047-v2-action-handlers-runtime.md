---
status: accepted
date: 2023-03-10
decision-makers: doc-detective maintainers
---

# v2 per-action runtime handlers (loadEnvs, https-prepend, runShell / httpRequest / checkLink)

## Context and Problem Statement

The v2 step schemas (`00046`) defined what each step *looks like*, but the core still needed runtime
handlers that *do* the work for each action — validating the step against its `*_v2` schema,
resolving environment variables, and executing the action with sensible defaults. The
network/shell actions in particular needed concrete behavior: how a shell command's exit code and
stderr map to a verdict, how HTTP requests are issued and their bodies queried, and what default
status codes count as success. What is the runtime contract for the v2 actions?

## Decision Drivers

* Each handler validates its step against the matching `*_v2` schema before acting.
* Resolve `$ENV`-style variables per step via `loadEnvs(step)` at execution time.
* Forgiving URL handling — auto-prepend `https://` when a scheme is omitted.
* Clear success/failure semantics for `runShell`, `httpRequest`, and `checkLink`.

## Considered Options

* **A. Per-action handlers that validate `*_v2`, loadEnvs, and execute with defined defaults**
  (chosen).
* **B. One generic handler branching internally with no per-action validation.**
* **C. Validate up front only, no per-handler re-validation or env resolution.**

## Decision Outcome

Chosen option: **A**. Each v2 action gets its own handler that validates the step against its
`*_v2` schema, calls `loadEnvs(step)` to resolve variables, and auto-prepends `https://` to
scheme-less URLs. Concrete semantics: `runShell` uses `spawnCommand` and **fails on a non-zero exit
code or stderr output**; `httpRequest` issues requests via **axios** and queries response bodies
with **node-jq**; `checkLink`/`httpRequest` share a schema with `statusCodes` defaulting to `[200]`
and the HTTP method set extended with `put`. This is the runtime counterpart to the v2 schema
family (`00046`); the `find` inline-subaction runtime is recorded separately in `00048`. The
stderr-fails-runShell rule is later relaxed (`00074`).

### Consequences

* Good: uniform validate→resolve→execute pipeline per action; predictable defaults.
* Good: powerful response querying (node-jq) and forgiving URLs reduce authoring friction.
* Bad: `runShell` failing on *any* stderr output is over-strict for noisy-but-successful commands
  (revisited in `00074`).
* Neutral: handlers couple runtime to specific libraries (axios, node-jq).

### Confirmation

The per-action handlers live in `doc-detective-core`; behavior is observable in runShell exit/stderr
verdicts, httpRequest body assertions via jq, and the default `[200]` status-code check.

## Pros and Cons of the Options

### A. Per-action handlers with validate + loadEnvs
* Good: consistent, validated, env-resolved execution with clear defaults.
* Bad: more handler code; some defaults (stderr→FAIL) too strict initially.

### B. Single generic handler
* Good: less code.
* Bad: no per-action validation; tangled branching.

### C. Up-front validation only
* Good: simpler handlers.
* Bad: misses per-step env resolution and defaulting at execution time.

## More Information

Recorded retrospectively (ADR backfill). Origin: core commits `658dc629`, `891ebe9e`, `69b00b2f`,
`19aab6f9`; common `c796d8a9`, `aeed490a`, `572dce0`. Inventory ref: BACKFILL-INVENTORY.md Seq 68.
Runtime side of `00046`; paired with `00048`; runShell stderr rule revised in `00074`.
