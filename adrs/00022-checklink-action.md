---
status: accepted
date: 2022-06-16
decision-makers: doc-detective maintainers
---

# checkLink action

## Context and Problem Statement

Documentation frequently embeds URLs that rot over time, and Doc Detective had no way to assert that
a referenced link still resolved. The runner needed a step type that took a URL, issued an HTTP
request, and produced a PASS/FAIL verdict based on the response status — without spinning up a
browser. What shape should that link-checking step take, and how should it decide pass vs. fail?

## Decision Drivers

* Link rot is a primary documentation-decay failure mode worth a first-class step.
* Checking a link should not require a browser session (cheaper, runs anywhere).
* The verdict must come from the HTTP status code, the standard signal of reachability.
* Reuse an existing HTTP client rather than hand-roll one.

## Considered Options

* **A. A `checkLink` action issuing an HTTP GET via axios and asserting on the status code** (chosen).
* **B. Reuse the browser engine to navigate to the URL and check it loaded.**
* **C. Defer link checking to an external link-checker tool.**

## Decision Outcome

Chosen option: **A**, because an HTTP GET is the cheapest reliable reachability probe and needs no
browser. A `checkLink` action was added in `tests.js`, performing an axios GET against the target URL
and deriving the verdict from the response status (a successful status passes, an error status
fails); `axios` was added as a dependency.

This established link-checking as a browser-free step; its pass/fail contract later grew to accept a
configurable list of acceptable status codes and to mitigate bot-protection (see `00065`, `00142`,
`00151`, `00152`).

### Consequences

* Good: first-class, browser-free link validation in test specs.
* Good: status-code-driven verdict is simple and standard.
* Bad: a bare GET can be blocked by bots or misled by redirects, requiring later hardening.
* Neutral: adds `axios` to the dependency surface.

### Confirmation

Shipped in commit `c33f36e` (added `tests.js` branch + axios dependency). Later evolution confirmed
by the related ADRs below.

## Pros and Cons of the Options

### A. `checkLink` via axios GET
* Good: cheap, browser-free, standard status semantics.
* Bad: naive GET is fragile against bot-blocking/redirects.

### B. Browser navigation
* Good: exercises the real rendering path.
* Bad: heavyweight; needs a driver for a simple reachability check.

### C. External link-checker
* Good: no new code.
* Bad: not integrated with the test verdict model; extra dependency to orchestrate.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `c33f36e`. Inventory ref:
BACKFILL-INVENTORY.md Seq 26. Evolution: `00065`, `00142`, `00151`, `00152`.
