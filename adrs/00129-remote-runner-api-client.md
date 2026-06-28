---
status: accepted
date: 2025-10-23
decision-makers: doc-detective maintainers
---

# Remote-runner client: fetch resolved tests and POST results via DOC_DETECTIVE_API

## Context and Problem Statement

A hosted Doc Detective service wanted to dispatch already-resolved tests to a local runner and collect the results — the local machine drives browsers/apps, while the service owns resolution, storage, and reporting. The runner had no way to pull a resolved test set from a remote endpoint or to push results back. How should a local runner be configured to act as a remote-driven execution client?

## Decision Drivers

* The hosted service should hand the runner pre-resolved tests so the runner just executes.
* Fetched tests must be validated against the same `resolvedTests_v3` contract the runner already executes.
* Results must round-trip back to the service.
* Configuration should come from the environment (CI/agent-friendly), not a file.

## Considered Options

* **A. `DOC_DETECTIVE_API` env object that GETs resolved tests, validates `resolvedTests_v3`, runs, and POSTs results back** (chosen).
* **B. A local polling daemon with a custom protocol.**
* **C. File-drop exchange (service writes a tests file, runner writes a results file).**

## Decision Outcome

Chosen option: **A**, because a small env-configured HTTP round-trip reuses the existing `resolvedTests_v3` envelope (`00112`) end-to-end and needs no bespoke protocol or daemon. The runner GETs resolved tests, validates them, executes, and POSTs results — a stateless request/response that fits CI and agent environments.

Contract decided:

* `DOC_DETECTIVE_API` env object: `{ accountId, url, token, contextIds }`.
* GET `/resolved-tests` to fetch the test set; validate against `resolvedTests_v3`.
* Run the resolved tests locally; POST results to `/contexts`.
* `axios` added as the HTTP client dependency.

### Consequences

* Good: local runner can be remote-driven by the hosted service with no new protocol.
* Good: reuses the `resolvedTests_v3` envelope for the fetched payload.
* Neutral: introduces an `axios` dependency.

### Confirmation

Shipped in doc-detective `23f2f71`, `8bd4305`, `dee756d`, `3ac6163` (#158); `getResolvedTestsFromEnv` entrypoint.

## Pros and Cons of the Options

### A. DOC_DETECTIVE_API round-trip
* Good: stateless HTTP; reuses resolvedTests_v3; env-configured.
* Bad: adds an HTTP client dependency.

### B. Polling daemon
* Good: push-style dispatch.
* Bad: long-lived process; custom protocol surface.

### C. File-drop exchange
* Good: no network code.
* Bad: fragile coordination; no auth/context selection.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective `23f2f71`, `8bd4305`, `dee756d`, `3ac6163` (#158). Inventory ref: BACKFILL-INVENTORY.md Seq 189. Related: `00127` (env config + Doc Detective API integration), `00112` (`resolvedTests_v3` envelope).
