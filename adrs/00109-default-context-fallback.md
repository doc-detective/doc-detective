---
status: accepted
date: 2025-04-22
decision-makers: doc-detective maintainers
---

# Default context fallback when resolveContexts yields none

## Context and Problem Statement

In the v3 model, `resolveContexts` expands a test's `runOn` into a set of platform×browser contexts, and the runner executes the test once per resolved context. But a test may declare no `runOn` (or a `runOn` that resolves to nothing on the current machine), leaving `resolveContexts` to return zero contexts — and a test with zero contexts never runs, silently. Should a context-less test be skipped, or should the runner synthesize a default context so the test still executes?

## Decision Drivers

* A test with no `runOn` should still run, not vanish silently.
* Non-browser tests (e.g. pure `runShell`/`httpRequest`) need no browser but still need a context to execute in.
* When a browser *is* required, the runner must pick a sensible available one.
* The default must not override an explicit, non-empty `runOn`.

## Considered Options

* **A. When `resolveContexts` yields zero contexts, push a default `{platform}` context (auto-select a browser only if one is required)** (chosen).
* **B. Skip tests that resolve to zero contexts.**
* **C. Require every test to declare `runOn`.**

## Decision Outcome

Chosen option: **A**, because a missing `runOn` should mean "run here," not "don't run." The contract:

1. When `resolveContexts` returns **zero** contexts, the runner pushes a default **`{platform}`** context (the current platform).
2. If a browser is required, it auto-selects in order **firefox → chrome → safari**.
3. Tests run even when `runOn` is absent or unmatched.

Commit `6472927f` in `core`.

### Consequences

* Good: context-less and non-browser tests run instead of silently disappearing.
* Good: browser auto-selection picks an available driver when one is needed.
* Neutral: this is the runner's job — the resolver intentionally does **not** default browsers (`00111`).
* Bad: a `runOn` that resolves to nothing now runs on the default context rather than skipping, which may surprise authors expecting a skip.

### Confirmation

Shipped in `core` commit `6472927f`; a test with no resolved contexts executing on a synthesized `{platform}` context is the confirming behavior.

## Pros and Cons of the Options

### A. Default `{platform}` fallback
* Good: no silent no-runs; non-browser tests work.
* Bad: an unmatched `runOn` runs instead of skipping.

### B. Skip zero-context tests
* Good: explicit `runOn` is the only way to run.
* Bad: context-less tests silently never run — surprising.

### C. Require `runOn` everywhere
* Good: no ambiguity.
* Bad: forces ceremony onto every non-browser test.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commit `6472927f`. Inventory ref: BACKFILL-INVENTORY.md Seq 162. Related: `00100` (v3 runner adoption, `resolveContexts`/`runOn`), `00111` (resolver does not default browsers), `00168` (driver-context resolution hardening).
