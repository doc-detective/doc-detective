---
status: accepted
date: 2022-10-05
decision-makers: doc-detective maintainers
---

# Config resolution precedence with a defaultConfig fallback tier

## Context and Problem Statement

Configuration values can arrive from multiple sources — CLI args, environment variables, a config
file — but early resolution had no defined precedence and no guaranteed fallback, so an unset field
could surface as `undefined` and crash downstream code. When `input`, `output`, `setup`, `cleanup`,
and the env settings are absent from every user-supplied source, what value should the runner use,
and which source wins when several supply the same key?

## Decision Drivers

* Every resolvable field needs a defined value so the runner never reads `undefined`.
* A clear, predictable precedence so users can reason about overrides.
* CLI invocation should win over ambient environment, which wins over the config file.
* Sensible built-in defaults so the tool runs with zero configuration.

## Considered Options

* **A. Fixed precedence `argv > env > config > defaultConfig`** (chosen).
* **B. Config file wins over args (file-is-source-of-truth).**
* **C. No defaults — require every field explicitly.**

## Decision Outcome

Chosen option: **A**, because a single deterministic chain ending in a built-in `defaultConfig`
guarantees a value for every field while honoring the most specific source first.

Behavior decided: resolution walks `argv > env > config > defaultConfig`. Each resolved field
(`setEnv`, `input`, `output`, `setup`, `cleanup`) appends `|| defaultConfig.X` so an unset value
falls through to the built-in default rather than `undefined`. The most specific source present
wins; the `defaultConfig` tier is the guaranteed floor.

### Consequences

* Good: no `undefined` reaching the runner; zero-config invocation works.
* Good: precedence is explicit and documented, so overrides are predictable.
* Neutral: this is the conceptual ancestor of the later `config_v2`/`config_v3` precedence
  pipeline (file/env validated, then CLI overlaid) — the same ordering, formalized through AJV.
* Bad: `||` fallthrough treats falsy-but-intentional values the same as unset (later refined).

## Pros and Cons of the Options

### A. argv > env > config > defaultConfig
* Good: deterministic; guarantees a value; matches CLI intuition.
* Bad: `||` cannot distinguish an intentional falsy value from "unset."

### B. Config file wins
* Good: file as single source of truth.
* Bad: surprising — a CLI flag would be ignored.

### C. No defaults
* Good: fully explicit.
* Bad: no zero-config path; brittle.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `7ec6865a`. Inventory ref:
BACKFILL-INVENTORY.md Seq 44. Related: the v2/v3 precedence formalization (`00051`, `00100`) and
the explicit-`false` refinement (`00137`).
