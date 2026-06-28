---
status: accepted
date: 2026-06-13
decision-makers: doc-detective maintainers
---

# Runtime dependency detection and Appium warm-up guard

## Context and Problem Statement

A test run can target several browsers, but the heavy per-browser assets (the matching driver, the
browser binary, the Appium automation driver) are expensive to install and not all of them are
needed for any given run. Installing everything up front wastes time; installing nothing leaves the
runner to fail mid-run when a driver is missing. The runner also spins up an in-process Appium server
("warm-up") for driver-backed steps, but warming it up when no test actually needs a driver burns
startup time. How should the runner decide which browser assets to provision and when to pay the
Appium warm-up cost?

## Decision Drivers

* Provision only the assets a run actually needs, keyed by the browsers in play.
* Keep the per-browser asset list in one place rather than scattered across install code paths.
* Avoid starting Appium when no resolved test requires a driver.
* Keep the table small and declarative so adding a browser is a data change, not a control-flow change.

## Considered Options

* **A. A `requiredBrowserAssets(name)` lookup table plus an Appium warm-up guard gated on
  driver-required tests** (chosen).
* **B. Always install every supported browser's assets and always warm Appium.**
* **C. Lazily install each asset at the moment a step first needs it.**

## Decision Outcome

Chosen option: **A**, because table-driving the per-browser asset set keeps provisioning declarative
and lets the runner compute the exact install set from the browsers a run resolves to, while the
warm-up guard avoids paying the Appium startup cost for runs that never touch a driver.

Contract decided:

* `requiredBrowserAssets(name)` returns the asset set (driver / browser binary / Appium driver) for a
  given browser name; the provisioning step unions the assets across the browsers a run needs.
* Appium warm-up is guarded: the in-process server is started only when at least one resolved test
  requires a driver, otherwise warm-up is skipped.

Implementation in `src/core/tests.ts` (warm-up guard) and `src/core/browsers.ts`
(`requiredBrowserAssets` table).

### Consequences

* Good: only the needed browser assets are provisioned; faster, leaner runs.
* Good: no Appium startup cost for driver-free runs.
* Good: adding a browser is a table edit, not new branching logic.
* Neutral: the table must be kept in sync with each newly supported browser/driver.

### Confirmation

Shipped in `45adfaf1` (PR #338); `requiredBrowserAssets` in `src/core/browsers.ts`, the warm-up guard
in `src/core/tests.ts`.

## Pros and Cons of the Options

### A. Asset table + warm-up guard
* Good: declarative, minimal install set, skips needless Appium warm-up.
* Bad: the table is a second source of truth that must track supported browsers.

### B. Always install everything, always warm
* Good: trivial; never missing an asset.
* Bad: slow startup; installs and warm-up work nobody asked for.

### C. Lazy per-step install
* Good: provisions nothing until proven needed.
* Bad: pushes install latency and failure into the middle of a run; harder to reason about.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `45adfaf1` (PR #338). Inventory
ref: BACKFILL-INVENTORY.md Seq 241. Related: `00164` (runtime lazy-install provisioning), `00172`
(concurrent test runners, which shares the warm-up path), `00130` (Appium readiness probe).
