---
status: accepted
date: 2025-12-24
decision-makers: doc-detective maintainers
---

# checkLink sends a browser user-agent and reports the actual status

## Context and Problem Statement

The `checkLink` step (`00022`) issued a plain GET and failed when the response status wasn't in the
expected set. In practice many documented links sit behind bot-protection or CDNs that reject
requests lacking a browser-like `User-Agent`/`Accept`, returning 403/429 to Doc Detective even
though a real browser loads the page fine. Worse, the failure message didn't say *what* status came
back, so authors couldn't tell a genuine broken link from a bot block. How should `checkLink` behave
so that it stops producing false failures and reports actionable diagnostics?

## Decision Drivers

* Links that load fine in a browser must not fail solely because the request looked automated.
* Failures must name the actual status code so authors can diagnose bot blocks vs. real breakage.
* The request must terminate predictably (timeout, bounded redirects) rather than hang.
* No change to the `checkLink` schema or its expected-status contract.

## Considered Options

* **A. Send browser-like request headers, bound the request, and report the actual status in the error** (chosen).
* **B. Treat 403/429 as soft-pass (warn instead of fail).**
* **C. Leave `checkLink` as-is and document a manual header workaround.**

## Decision Outcome

Chosen option: **A**, because mimicking a browser request removes the most common false-failure
cause while keeping the pass/fail contract honest, and surfacing the real status makes the remaining
failures diagnosable.

The contract for `checkLink`'s GET:

* Sends a browser-like `User-Agent` and `Accept` header.
* Uses a 10-second timeout and follows up to `maxRedirects: 5`.
* On a non-matching status, the error reads `Returned NNN. Expected one of […]`, naming the actual
  status and the expected set.

This is a runtime behavior change only — the step's schema and the `statusCodes` expectation set are
unchanged.

### Consequences

* Good: links behind common bot protection stop producing false failures.
* Good: error messages now name the actual status, so authors can tell a block from a real 404.
* Good: bounded timeout/redirects make `checkLink` terminate predictably.
* Bad: a server that *only* serves browser UAs is now "passing" even though scripted clients can't
  reach it — the check is slightly less strict about non-browser reachability.
* Neutral: later iterations extend this with non-2xx acceptance (`00151`) and retry/HEAD fallback
  for stubborn 429/403 (`00152`).

### Confirmation

Shipped in core `e433358`. Confirmed by the `Returned NNN. Expected one of […]` error string and
the browser UA/Accept headers, 10s timeout, and `maxRedirects: 5` on the GET.

## Pros and Cons of the Options

### A. Browser UA + bounded request + actual-status error
* Good: removes the main false-failure source; diagnosable errors; predictable termination.
* Bad: slightly weakens strict non-browser reachability checking.

### B. Soft-pass 403/429
* Good: trivial.
* Bad: hides genuinely broken links behind those codes; ambiguous verdict.

### C. Document a manual workaround
* Good: no code change.
* Bad: every author re-solves the same problem; defaults stay broken.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commit `e433358`. Inventory ref:
BACKFILL-INVENTORY.md Seq 203. Related: `00022` (checkLink action), `00151` (non-2xx status codes),
`00152` (bot-protection mitigation: retry + HEAD fallback).
