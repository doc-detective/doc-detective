---
status: accepted
date: 2025-06-25
decision-makers: doc-detective maintainers
---

# debug stepThrough mode and per-step breakpoint

## Context and Problem Statement

When a test misbehaves, authors had no in-runner way to pause execution and inspect state step by step — the run either passed or failed wholesale. Doc Detective needed an interactive debugging affordance: a config-level switch to step through a run, plus a per-step way to mark exactly where execution should halt. What should the schema contract for that debugging mode be, and how should authors mark a breakpoint on an individual step?

## Decision Drivers

* Authors need to pause a run to inspect intermediate state during development.
* A debug switch should be off by default so production/CI runs are unaffected.
* The switch should leave room for future debug modes beyond stepping.
* Breakpoints belong on the individual step, not just globally.

## Considered Options

* **A. Config `debug` anyOf(boolean | enum `["stepThrough"]`) plus per-step `breakpoint` boolean** (chosen).
* **B. A single boolean `debug` flag only.**
* **C. A CLI-only `--debug` flag with no per-step marker.**

## Decision Outcome

Chosen option: **A**, because an `anyOf(boolean, enum)` keeps the simple on/off ergonomics while reserving a named-mode slot (`"stepThrough"`) for richer behavior, and a step-level `breakpoint` lets authors halt precisely where they need to rather than at every step.

Contract decided:

* Config `debug`: `anyOf` of a boolean or the enum `["stepThrough"]`, default `false`.
* Step `breakpoint`: boolean, default `false`, marking that step as a halt point.

### Consequences

* Good: interactive step-through debugging without affecting default runs.
* Good: the enum form leaves headroom for additional debug modes later.
* Neutral: `debug` is later deprecated in favor of a `doc-detective debug` subcommand (see `00170`); the field persists for compatibility.

### Confirmation

Schema additions to the `config` and step schemas in `doc-detective-common`; default `false` on both fields keeps existing specs byte-identical.

## Pros and Cons of the Options

### A. anyOf debug + step breakpoint
* Good: simple default, future-proof enum, precise per-step halts.
* Bad: anyOf shape is slightly more complex than a plain boolean.

### B. boolean debug only
* Good: trivial.
* Bad: no room for named modes; no per-step granularity.

### C. CLI-only --debug
* Good: no schema change.
* Bad: not reachable from config files; no per-step breakpoint.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `b648cb80`, `ef8890f8`. Inventory ref: BACKFILL-INVENTORY.md Seq 181. Related: `00122` (debug version/config dump), `00170` (`doc-detective debug` subcommand that deprecates the schema field).
