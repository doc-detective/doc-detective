---
status: accepted
date: 2022-09-27
decision-makers: doc-detective maintainers
---

# httpRequest action

## Context and Problem Statement

Documentation for APIs describes requests and their expected responses, but Doc Detective could only
check that a link resolved (`checkLink`, `00022`) — it could not issue a real request with a method,
headers, body, and query parameters, then assert on the response. The runner needed an `httpRequest`
step type that drives an arbitrary HTTP call and validates the response, including extracting values
from the response for later use. What should that step's contract be, and how should it evolve?

## Decision Drivers

* API documentation needs end-to-end request/response verification, not just reachability.
* Requests must support method, headers, query params, body, and acceptable status codes.
* Responses must be assertable by deep comparison of headers and data.
* Response values must be capturable into environment variables for chained steps.
* Field names must stay clear as the request and response halves both grow.

## Considered Options

* **A. An `httpRequest` action with full request shape, deep response comparison, `$ENV` substitution, response-data env capture, and request/response-prefixed field names** (chosen).
* **B. Extend `checkLink` with optional method/body/headers.**
* **C. Defer API testing to an external HTTP-test tool.**

## Decision Outcome

Chosen option: **A**, because API verification is distinct enough from link-checking to warrant its
own step, and the request/response contract grew incrementally to its final shape. The contract
evolved across several commits:

1. The `httpRequest` action was added with `uri`/`method`/`headers`/`params`/`requestData`/
   `statusCodes` plus sanitization, deep array/object comparison against `responseHeaders`/
   `responseData`, and `$ENV` substitution (commits `77bcb850`, `2db85f0d`, `359bcbf3`, `e44bbab1`,
   `52ef39f3`; implementation in `src/lib/tests/httpRequest.js`).
2. `envsFromResponseData` was added — an array of `{name, jqFilter}` entries that capture response
   values into environment variables via node-jq (commit `499b4934`, PR #13).
3. The request fields were renamed `headers`→`requestHeaders` and `params`→`requestParams`, with the
   old names kept as fallbacks, and runners began returning report values to callers (commits
   `3da8a767`, `30c3249f`, PR #14; `loadEnvs(requestHeaders) || loadEnvs(headers)`).

The net contract: a configurable request, status-code and deep response assertions, `$ENV`
substitution, jq-based response capture, and request-prefixed field names with legacy fallbacks.

### Consequences

* Good: full request/response verification for API documentation.
* Good: response values flow into env vars (`envsFromResponseData`) for chained steps.
* Good: deep comparison asserts both response headers and data.
* Bad: the `headers`/`params` → `requestHeaders`/`requestParams` rename added dual-name handling.
* Neutral: this v1 shape is later restructured under v2/v3 schemas (stricter HTTP shapes).

### Confirmation

Shipped across commits `77bcb850`, `2db85f0d`, `359bcbf3`, `e44bbab1`, `52ef39f3` (base action),
`499b4934`/PR #13 (`envsFromResponseData`), and `3da8a767`, `30c3249f`/PR #14 (field renames +
report value return). Implementation in `src/lib/tests/httpRequest.js`.

## Pros and Cons of the Options

### A. Dedicated httpRequest action
* Good: full request/response model; env capture; clear field names.
* Bad: large step surface; rename introduced legacy-name fallbacks.

### B. Extend checkLink
* Good: one step to learn.
* Bad: overloads a reachability check; muddied semantics.

### C. External HTTP-test tool
* Good: no new step code.
* Bad: not integrated with the verdict/env model; extra orchestration.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `77bcb850`, `2db85f0d`,
`359bcbf3`, `e44bbab1`, `52ef39f3`, `499b4934` (PR #13), `3da8a767`, `30c3249f` (PR #14). Inventory
ref: BACKFILL-INVENTORY.md Seq 39, 53, 54. Related: `00022` (checkLink); later HTTP redesigns under
the v2/v3 schema ADRs.
