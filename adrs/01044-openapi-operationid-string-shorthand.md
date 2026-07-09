---
status: accepted
date: 2026-07-08
decision-makers: doc-detective maintainers
---

# Make OpenAPI `httpRequest` resolve descriptions at runtime (context propagation + string shorthand)

## Context and Problem Statement

An `httpRequest` step can target an OpenAPI operation with `openApi` (by `operationId`, by
registered `name`, or by inline `descriptionPath`). Reviewing a new "Generate requests from OpenAPI"
guide (PR #412) surfaced that the feature did **not work end to end** — for two independent reasons.

**1. Loaded descriptions never reached the step.** `resolveTests` loads each spec/test OpenAPI
description (`fetchOpenApiDocuments` over `spec.openApi` + `test.openApi`, attaching a dereferenced
`definition`) onto `resolvedTest.openApi`. But `resolveContext` seeded each context's `openApi` from
the **original** `test.openApi` — an array that carries no loaded `definition` and omits spec-level
entries. At execution the runner passes `context.openApi` to `httpRequest` as `openApiDefinitions`,
so it received an **empty** array. Every OpenAPI step — object form included — failed with:

```text
OpenAPI definition not found.
```

This is why the only OpenAPI httpRequest fixture in the repo sat unused in `test/core-need_updates/`.

**2. The documented string shorthand was unhandled.** The `httpRequest_v3` schema defines `openApi`
as a union whose first branch is a bare string (`operationId`), ships `"openApi": "getUserById"` as
an example, and the reference docs use it. But the resolver only read the object shape
(`.descriptionPath` / `.name` / `.operationId`), so a bare string produced `undefined` lookups and
the same "OpenAPI definition not found."

## Decision Drivers

* The feature the schema and docs advertise must actually run; a loaded description must reach the
  step that uses it.
* The failure is silent and misleading (`OpenAPI definition not found`), not a clear diagnostic.
* Fixes should be minimal and localized, with no change to non-OpenAPI resolution or the object form.

## Considered Options

* **Propagate the resolved descriptions to the context, and normalize the string shorthand to the
  object form.** Two small, targeted fixes.
* **Only normalize the shorthand.** Leaves the feature broken end to end (descriptions still don't
  reach the step).
* **Remove the string branch and the OpenAPI guide.** Abandons an advertised, half-built feature.

## Decision Outcome

Chosen option: **propagate + normalize.**

* **Propagation** (`src/core/resolveTests.ts`): `resolveTest` passes the loaded set
  (`resolvedTest.openApi`) into `resolveContext`, which uses it for `context.openApi` — so the
  description-loaded, spec+test-merged documents reach `httpRequest`'s `openApiDefinitions`.
* **Normalization** (`src/core/tests/httpRequest.ts`): at the top of the `openApi` block, a bare
  string becomes `{ operationId: <string> }`, then the existing object-form resolution runs
  unchanged.

Together these make the schema, docs, and runtime agree: `openApi: "getUsers"` resolves exactly like
`openApi: { operationId: "getUsers" }`, and both actually run.

### Consequences

* Good: OpenAPI `httpRequest` steps resolve their descriptions at runtime — the feature works end to
  end for the first time, and the string shorthand works as documented.
* Good: no change to the object-shape API, to steps without `openApi`, or to non-OpenAPI resolution
  (the propagation line only sets a field that was previously mis-sourced).
* Neutral: the shorthand searches every registered description for the `operationId`, resolving to
  the first match — the same behavior the object form already had; pin with `name` when ambiguous.

### Confirmation

* Red→green unit tests in `test/httpRequest.test.js` ("httpRequest openApi string shorthand"):
  before, the string form FAILs with `OpenAPI definition not found` while the object form PASSes;
  after, the string form resolves and matches the object form.
* A hermetic feature fixture (`test/core-artifacts/http/openapi-string-shorthand.spec.json`,
  `mockResponse` so it never hits the network) exercises both the shorthand and the object form
  end to end through the real runner in the `http` fixtures job — this fixture only passes because
  the propagation fix delivers the loaded description to the step.
* Existing `resolvedTests` / `resolvetests-coverage` / `httpRequest` suites still pass (no
  resolution regression).

## Pros and Cons of the Options

### Propagate + normalize

* Good: makes the advertised feature actually run, end to end.
* Good: two localized changes; no schema, generated-type, or object-form churn.
* Neutral: relies on the existing first-match search when an `operationId` is ambiguous.

### Only normalize the shorthand

* Bad: descriptions still never reach the step, so nothing resolves — the shorthand fix would be
  unreachable and unverifiable end to end.

### Remove the string branch and the guide

* Bad: breaks the published example and abandons a feature the schema and docs already promise.
