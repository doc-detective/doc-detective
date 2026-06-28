---
status: accepted
date: 2025-10-24
decision-makers: doc-detective maintainers
---

# Appium readiness via /status probe and dropping Node 18

## Context and Problem Statement

The runner probed Appium's `/sessions` endpoint to decide when the server was ready to accept work, but `/sessions` is not a reliable readiness signal — Appium v3.1 exposes a dedicated `/status` endpoint for exactly this. Meanwhile the CI matrix still tested Node 18, which had reached end of life and was holding back dependency choices. Should readiness move to `/status`, and should Node 18 be dropped from the support matrix?

## Decision Drivers

* Appium readiness must be detected reliably before the runner issues commands.
* Appium v3.1 provides a purpose-built `/status` readiness endpoint.
* Supporting an end-of-life Node version constrains dependencies and CI cost.
* Pinned `sharp` optionalDeps were no longer needed.

## Considered Options

* **A. Probe `/status` for Appium readiness and drop Node 18 from the CI matrix** (chosen).
* **B. Keep polling `/sessions`.**
* **C. Fixed sleep before first command.**

## Decision Outcome

Chosen option: **A**, because `/status` is Appium's intended readiness signal and gives a correct ready/not-ready answer where `/sessions` only indirectly implied it. Dropping Node 18 (already EOL) removes a constraint on dependency versions and trims the CI matrix.

Contract decided:

* Appium readiness probe changed from `/sessions` to `/status`.
* Node 18 removed from the CI test matrix.
* Pinned `sharp` `optionalDependencies` removed.

### Consequences

* Good: more reliable Appium readiness detection.
* Good: frees dependency choices and shrinks the CI matrix.
* Bad: users still on Node 18 lose support (it is EOL).

### Confirmation

Shipped in core `9f6bde13` (Appium v3.1 `/status` probe + Node 18 matrix drop + sharp pin removal).

## Pros and Cons of the Options

### A. /status probe + drop Node 18
* Good: correct readiness signal; lighter, modern matrix.
* Bad: ends Node 18 support.

### B. Keep /sessions polling
* Good: no change.
* Bad: indirect, less reliable readiness signal.

### C. Fixed sleep
* Good: trivial.
* Bad: races on slow starts; wastes time on fast ones.

## More Information

Recorded retrospectively (ADR backfill). Origin: core `9f6bde13`. Inventory ref: BACKFILL-INVENTORY.md Seq 190. Related: `00118` (driver init timeouts), `00166` (Node 22 engines floor), `00132` (WDIO v9 classic).
