---
status: accepted
date: 2026-06-01
decision-makers: doc-detective maintainers
---

# Node 22 engines floor

## Context and Problem Statement

The runtime provisioning chain moved `@puppeteer/browsers` to v3, which targets newer Node, and the
codebase's ESM/TypeScript surface increasingly relied on modern Node features. Older Node releases
could install Doc Detective but then fail at runtime in confusing ways. Should Doc Detective declare
a hard Node floor so incompatible environments fail fast at install time instead of mid-run?

## Decision Drivers

* Heavy-dep tooling (`@puppeteer/browsers` v3, runtime installer) assumes modern Node.
* A runtime failure on old Node is far worse UX than an install-time `EBADENGINE`.
* The supported-Node contract should be explicit and machine-checkable in `package.json`.
* Node 18 had already been dropped from CI; the declared floor should match reality.

## Considered Options

* **A. Declare `engines.node` `>=22.12.0` so older Node triggers `EBADENGINE`** (chosen).
* **B. Leave `engines` open and document a recommended Node version.**
* **C. Add runtime version checks instead of an install-time engines floor.**

## Decision Outcome

Chosen option: **A**, because an `engines` declaration is the standard, fail-fast way to communicate
a runtime floor and npm surfaces it at install. `package.json` now declares `engines` requiring node
`>=22.12.0`; older Node now produces an `EBADENGINE` warning at install (commit `e9680596`).

### Consequences

* Good: incompatible environments are flagged at install, not mid-run.
* Good: the supported-Node contract is explicit and machine-readable.
* Neutral: aligns the declared floor with CI (Node 18 already dropped).
* Bad: users on older Node must upgrade before installing.

### Confirmation

`package.json` `engines.node` `>=22.12.0`. Shipped in `e9680596`.

## Pros and Cons of the Options

### A. `engines.node >=22.12.0`
* Good: standard, fail-fast, machine-checkable.
* Bad: hard cutoff for users on older Node.

### B. Open engines + docs
* Good: no install-time friction.
* Bad: failures surface late and confusingly at runtime.

### C. Runtime version check
* Good: can give a tailored message.
* Bad: reinvents `engines`; fires later than install.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `e9680596`. Inventory ref:
BACKFILL-INVENTORY.md Seq 229. Related: `00164` (runtime lazy-install provisioning), `00130`
(drop Node 18 from CI).
