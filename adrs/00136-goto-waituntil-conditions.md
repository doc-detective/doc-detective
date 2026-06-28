---
status: accepted
date: 2025-11-19
decision-makers: doc-detective maintainers
---

# goTo waitUntil conditions and timeout

## Context and Problem Statement

The `goTo` step navigated and waited for `document.readyState === "complete"` (`00106`), but many
modern pages keep loading content asynchronously after `readyState` — XHR/fetch traffic, DOM
mutations, or a specific element appearing. Authors needed to express *what* "loaded enough" means
for a given page before subsequent steps run. How should `goTo_v3` let an author specify the
readiness conditions and bound the wait with a timeout?

## Decision Drivers

* `readyState=complete` is insufficient for SPA/async pages.
* Authors should be able to wait for network quiescence, DOM stability, and/or an element.
* Each condition must be individually tunable and individually disable-able.
* The wait must be bounded by an explicit timeout.

## Considered Options

* **A. Add `goTo_v3.timeout` (default `30000`) and a `waitUntil` object with `networkIdleTime`
  (default `500`), `domIdleTime` (default `1000`), and `element`; `null` disables a condition; the
  runner checks ready/network-idle/DOM-stable/element-found in parallel** (chosen).
* **B. Keep waiting only for `readyState=complete` and rely on explicit `wait` steps.**
* **C. A single coarse `waitMode` enum (e.g. `load` / `networkidle`).**

## Decision Outcome

Chosen option: **A**, because composable, individually-tunable conditions cover the range of real
pages while sane defaults keep the common case simple. The contract: `goTo_v3` gains `timeout`
(default `30000` ms) and a `waitUntil` object with `networkIdleTime` (default `500` ms),
`domIdleTime` (default `1000` ms), and an `element` to wait for; setting a condition to `null`
disables it. The runner evaluates the readyState, network-idle, DOM-stable, and element-found checks
in parallel and proceeds when the configured conditions are satisfied or the timeout elapses (schema
`doc-detective-common` `9d7d503`; runner `doc-detective-core` `107766`).

### Consequences

* Good: reliable navigation waits for async/SPA pages without ad-hoc `wait` steps.
* Good: each condition is tunable and can be turned off via `null`.
* Bad: more `goTo` surface to learn than a single readyState wait.
* Neutral: defaults preserve a reasonable wait when `waitUntil` is unspecified.

### Confirmation

`goTo_v3` carries `timeout` + `waitUntil{ networkIdleTime, domIdleTime, element }` with the stated
defaults in `doc-detective-common` `9d7d503`; the parallel readiness checks ship in
`doc-detective-core` `107766`.

## Pros and Cons of the Options

### A. `waitUntil` object + `timeout`
* Good: composable, tunable, null-disable per condition; bounded by timeout.
* Bad: larger step surface.

### B. readyState only + explicit waits
* Good: minimal step contract.
* Bad: pushes brittle timing logic onto authors.

### C. Coarse `waitMode` enum
* Good: simple to pick.
* Bad: not tunable; can't combine network/DOM/element conditions.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-common` commit `9d7d503`,
`doc-detective-core` commit `107766`. Inventory ref: BACKFILL-INVENTORY.md Seq 196. Related:
`00106` (goTo readyState wait + WARNING verdict), `00096` (v3 action-as-key schema redesign).
