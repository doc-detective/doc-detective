---
status: accepted
date: 2026-06-08
decision-makers: doc-detective maintainers
---

# Driver-context resolution hardening

## Context and Problem Statement

When resolving a driver context, three edge cases produced confusing or wrong outcomes: a context
with no browser `name` was ambiguous; an unknown browser name silently mis-resolved (or produced
opaque downstream errors); and `webkit` — used interchangeably with Safari in the browsers contract
— did not map to Safari driver capabilities. How should context resolution handle a nameless
driver-context, an unrecognized browser, and the `webkit`/Safari equivalence?

## Decision Drivers

* A nameless driver-context can't pick a browser; it should not crash or silently mis-run.
* An unknown browser name should fail loudly with a clear message, not produce mystery errors.
* The browsers contract treats `webkit` and Safari as the same engine; resolution must honor that.
* Resolution outcomes (SKIPPED vs. throw) must be predictable per case.

## Considered Options

* **A. SKIP a nameless driver-context, throw a clear error on unknown browser, and map `webkit` → Safari capabilities** (chosen).
* **B. Default a nameless context to a fallback browser and best-effort unknown names.**
* **C. Treat all three as hard run-aborting errors.**

## Decision Outcome

Chosen option: **A**, because each edge case wants a different, predictable resolution: skip what
can't be run, fail fast on genuinely invalid input, and honor the documented engine equivalence. In
`isSupportedContext`/`getDriverCapabilities`: a nameless driver-context is cleanly resolved to
SKIPPED; an unknown browser name throws a clear error; and `webkit` maps to Safari capabilities
(commit `9fbf2b21`).

### Consequences

* Good: nameless contexts skip cleanly instead of crashing or running ambiguously.
* Good: invalid browser names fail fast with an actionable message.
* Good: `webkit`/Safari equivalence is honored at the driver-capabilities layer.
* Neutral: SKIPPED (not FAIL) is the verdict for a nameless driver-context.

### Confirmation

`isSupportedContext`/`getDriverCapabilities` skip nameless contexts, throw on unknown browser, and
map `webkit`→Safari. Shipped in `9fbf2b21`.

## Pros and Cons of the Options

### A. Skip nameless / throw unknown / webkit→Safari
* Good: predictable, case-appropriate outcomes; clear errors.
* Bad: three behaviors to remember rather than one.

### B. Defaults + best-effort
* Good: fewer skips/throws.
* Bad: hides misconfiguration; can run the wrong browser silently.

### C. All hard errors
* Good: maximally strict.
* Bad: a nameless context that could be skipped needlessly aborts the run.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `9fbf2b21`. Inventory ref:
BACKFILL-INVENTORY.md Seq 235. Related: `00098` (context_v3 + browsers array, safari≡webkit),
`00109` (default-context fallback).
