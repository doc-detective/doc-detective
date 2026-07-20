---
status: accepted
date: 2026-07-11
decision-makers: doc-detective maintainers
---

# `httpRequest` must not implicitly assert a JSON-object response body

## Context and Problem Statement

`httpRequest`'s response defaults (`src/core/tests/httpRequest.ts`) used to set `response.body` to
`{}` whenever a step didn't declare one:

```js
response: {
  headers: {},
  body: {},
  required: [],
  ...(step.httpRequest.response || {}),
},
```

The body-match check that follows only skips when `typeof step.httpRequest.response.body ===
"undefined"`. Because of the default above, that was never true — `response.body` was always at
least `{}`. So the check always ran, and it opens with a type comparison: `typeof
step.httpRequest.response.body !== typeof response.data`. For a JSON API this is harmless (axios
parses the body into an object, so both sides are `"object"`). For any **non-JSON** response — plain
text, an HTML directory listing, an empty `204` body — axios leaves `response.data` as a string (or
empty string), the types mismatch, and the step fails with "Expected response body type didn't match
actual response body type" — even though the step never asked for a body assertion.

This surfaced while authoring inline docs tests (PR #576): `python -m http.server` (HTML directory
listing) had to be replaced with a custom JSON-only fixture (`simple-json-server.js`) to avoid
tripping this check. That's a workaround for a real bug in `httpRequest`, not a docs problem.

## Decision Drivers

* A step that sets no `response.body` must not implicitly require anything about the response body's
  shape or content type.
* No regression for steps that DO set `response.body` — every existing assertion behavior there is
  unchanged.
* Prefer the smallest fix that removes the false assumption at its source, over teaching the
  type-match check to special-case "empty" after the fact.
* Match already-published docs: `$$bodyMatches` is documented as present "when `response.body` is
  set" — it should not be computed (or defaulted to `true`) when it isn't.

## Considered Options

* **A. Stop defaulting `response.body` to `{}`** (chosen).
* **B. Keep the `{}` default, but skip the type-match check when the expected body has zero keys**
  (mirroring the sibling `allowAdditionalFields` check's existing "empty root body imposes no
  constraint" special-case).
* **C. Make the type-match Content-Type-aware** — only require a JSON-object body when the actual
  response's `Content-Type` says JSON.

## Decision Outcome

Chosen option: **A**. The body-match check already has the right guard
(`typeof ... !== "undefined"`); the bug is that the value was never allowed to BE `undefined`. Not
defaulting it removes the false assumption at its source instead of adding a second layer of
special-casing on top of it (Option B), and doesn't require parsing/trusting response headers to
decide whether an assertion applies (Option C, which also doesn't fully resolve the "was this the
default or did the user ask for it" ambiguity for a JSON endpoint that returns a top-level string).

Implementation: removed `body: {}` from the `response` defaults spread in `httpRequest.ts`. `headers`
and `required` keep their defaults (`{}` and `[]` respectively) since the checks that read them
already treat an empty object/array as "no constraint" by construction, not by an added special case.

A useful side effect: the OpenAPI `mockResponse` branch already had a
`typeof step.httpRequest.response.body === "undefined"` check to decide whether to fall back to the
example response body — that check was unreachable dead code because of the `{}` default. It now
works as originally intended.

### Consequences

* Good: a step with no `response.body` no longer implicitly requires a JSON-object (or array)
  response — it passes against plain text, HTML, or an empty body, same as if no body check existed.
* Good: `outputs.bodyMatches` is now genuinely absent (not `true`) when no body assertion applies,
  matching the documented contract.
* Good: no change whatsoever to steps that explicitly set `response.body` — same comparisons, same
  outputs, same failure messages.
* Neutral / behavior change for anyone who was implicitly relying on the old default to reject a
  non-object response as a coarse "is this even JSON" check: that was an undocumented side effect
  of a bug, not a supported way to assert response shape. Use `response.required` (existence) or an
  explicit `response.body` to assert intentionally.

### Confirmation

Red→green tests added to `test/httprequest-coverage.test.js`
("no implicit body assertion when response.body is unset"): an HTML response, a plain-text response,
an empty 204 response, a JSON object response, and a JSON array response ALL now PASS with
`outputs.bodyMatches` absent when `response.body` is unset, and a control case confirms an explicit
`response.body` still asserts and can still FAIL. Full existing suites
(`test/httprequest-coverage.test.js`, `test/httpRequest-assertions.test.js`, `test/httpRequest.test.js`)
pass unchanged — every pre-existing `bodyMatches`-related test already set `response.body` explicitly,
so none of them exercised (or depended on) the removed default.

## Pros and Cons of the Options

### A. Remove the default
* Good: fixes the root cause; the existing guard does the right thing once the value can be
  genuinely absent; also revives the dead OpenAPI mock-response fallback.
* Bad: none identified — the default served no purpose the guard didn't already anticipate.

### B. Special-case an empty expected body
* Good: also fixes the symptom.
* Bad: duplicates the "empty means no constraint" convention that already exists for
  `allowAdditionalFields`, instead of just not creating the ambiguous default in the first place.

### C. Content-Type-aware check
* Good: could, in principle, give a clearer failure message ("expected JSON, got text/html").
* Bad: more moving parts (header parsing, trusting a possibly-absent/incorrect Content-Type header);
  doesn't remove the underlying "default vs. user-authored `{}`" ambiguity.
