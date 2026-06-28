---
status: accepted
date: 2025-07-20
decision-makers: doc-detective maintainers
---

# Debug-level version and resolved-config dump

## Context and Problem Statement

When users filed bug reports it was hard to know which `doc-detective-*` package versions, Node version, platform, and execution method were in play, and what the fully-resolved config actually looked like after file/env/CLI merging. Reproducing issues meant asking the reporter to hand-assemble this. Should the runner emit this diagnostic context automatically, and under what condition so it stays out of normal output?

## Decision Drivers

* Bug reports need accurate environment + version + resolved-config context.
* That context must not pollute normal or CI output.
* It should auto-discover installed `doc-detective-*` packages rather than hard-code names.
* It should reflect the *resolved* config (post-merge), not the raw input.

## Considered Options

* **A. Print `getVersionData()` plus the full resolved config only when `logLevel === "debug"`** (chosen).
* **B. A dedicated `--version-info` flag.**
* **C. Always print version data at startup.**

## Decision Outcome

Chosen option: **A**, because gating on the existing `logLevel === "debug"` reuses a knob users already set when chasing a problem, keeps default/CI output clean, and ties the dump to the same verbosity contract as other debug logging.

Contract decided: when `logLevel === "debug"`, the runner prints `getVersionData()` — which auto-discovers installed `doc-detective-*` packages and reports Node version, platform, and execution method — followed by the full resolved config object.

### Consequences

* Good: one-step reproduction context for bug reports.
* Good: auto-discovery means new sibling packages appear without code changes.
* Neutral: only surfaces when users opt into debug logging; invisible otherwise.

### Confirmation

Shipped in doc-detective commit `a054638`; `getVersionData()` helper gated behind the `logLevel === "debug"` check.

## Pros and Cons of the Options

### A. logLevel debug gate
* Good: reuses existing verbosity contract; clean default output.
* Bad: requires users to know to set debug logging.

### B. Dedicated flag
* Good: explicit.
* Bad: yet another flag; duplicates logLevel intent.

### C. Always print
* Good: zero discovery cost.
* Bad: noisy in every run and in CI logs.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `a054638`. Inventory ref: BACKFILL-INVENTORY.md Seq 182. Related: `00121` (debug mode), `00170` (`doc-detective debug` redacted diagnostic dump that supersedes this).
