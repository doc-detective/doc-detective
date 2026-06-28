---
status: accepted
date: 2025-12-01
decision-makers: doc-detective maintainers
---

# Public getRunner API

## Context and Problem Statement

`runTests()` owns the full lifecycle — detect, resolve, spin up Appium and a driver, run every step,
tear down — as one opaque call. Programmatic consumers (the platform runner, integrations, and
interactive/agent use) needed finer control: open a live browser session once, run individual steps
against it, and clean up on their own schedule, without re-driving the whole detect/resolve pipeline.
Should the core expose a lower-level session handle, and what should it return?

## Decision Drivers

* Callers need a live, reusable driver session to run steps directly.
* The lifecycle (Appium, driver, cleanup) must be returnable so the caller controls teardown.
* Driver start can fail on display/headed assumptions; a headless fallback should be automatic.
* The handle should compose with the existing step runner, not duplicate it.

## Considered Options

* **A. A public `getRunner({ headless })` that returns `{ runner, appium, cleanup, runStep }` —
  a live session the caller drives directly, with automatic headless fallback when Chrome start
  fails** (chosen).
* **B. Keep `runTests()` as the only entrypoint and document a config recipe for single steps.**
* **C. Expose the raw WebdriverIO/Appium objects and let callers wire their own lifecycle.**

## Decision Outcome

Chosen option: **A**, because a small façade gives programmatic callers a live session plus the exact
teardown handles they need while reusing the existing step dispatch. The contract: `getRunner({
headless })` returns an object `{ runner, appium, cleanup, runStep }` — the caller drives a live
session and calls `runStep` to execute individual steps, then `cleanup` to tear down Appium and the
driver. If Chrome fails to start, the runner falls back to headless automatically (commit `90f581`,
`doc-detective-core`).

### Consequences

* Good: programmatic/interactive callers get a reusable session and explicit teardown.
* Good: reuses the same `runStep` dispatch, so step semantics stay identical to `runTests`.
* Bad: a new public surface to keep stable across refactors.
* Neutral: complements `runTests()`; the high-level entrypoint is unchanged.

### Confirmation

`getRunner({ headless })` returning `{ runner, appium, cleanup, runStep }` with headless fallback on
Chrome start failure ships in `doc-detective-core` `90f581`.

## Pros and Cons of the Options

### A. `getRunner` session façade
* Good: live reusable session; caller-owned cleanup; reuses runStep.
* Bad: new public API to maintain.

### B. `runTests()`-only
* Good: one entrypoint, smaller surface.
* Bad: no fine-grained/interactive control; forces whole-pipeline runs.

### C. Expose raw driver objects
* Good: maximal flexibility.
* Bad: pushes Appium/driver lifecycle complexity onto every caller.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-core` commit `90f581`. Inventory
ref: BACKFILL-INVENTORY.md Seq 199. Related: `00023` (programmatic run API), `00085` (headless-retry
fallback), `00171` (runtime dependency detection + warm-up).
