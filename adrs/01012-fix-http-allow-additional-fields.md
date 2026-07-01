---
status: accepted
date: 2026-06-30
decision-makers: doc-detective maintainers
---

# Fix `allowAdditionalFields: false` to reject responses with extra fields

## Context and Problem Statement

The `httpRequest` step type exposes `allowAdditionalFields`. When set to `false`, the documented
intent is that a response must **not** carry fields beyond those the author declared in
`response.body` — extra keys should fail the step.

The "no unexpected fields" check in [src/core/tests/httpRequest.ts](../src/core/tests/httpRequest.ts)
computed the boolean like this ([#437](https://github.com/doc-detective/doc-detective/issues/437)):

```ts
const noUnexpectedFields =
  expectedBody && typeof expectedBody === "object"
    ? objectExistsInObject(expectedBody, response.data).result.status !== "FAIL"
    : true;
```

`objectExistsInObject(expected, actual)` is a **subset** check: it verifies that `actual` contains
every key in `expected`, but it never looks at keys present only in `actual`. So EXTRA keys in the
response can never make it FAIL. With `expected = { a: 1 }` and `actual = { a: 1, extra: 99 }`, the
subset check PASSes and `noUnexpectedFields` stayed `true`. The option silently did nothing — a
response with additional fields was accepted even though the author asked for a strict shape.

This is a contract bug, not a contract change: `allowAdditionalFields: false` was always meant to
reject additional fields. The subset check was simply the wrong tool for the job.

## Decision Drivers

* Make `allowAdditionalFields: false` honor its documented meaning: reject responses whose keys
  aren't declared in the expected body, recursively for nested objects.
* Don't regress the guard for a non-object / undefined expected body, or for the **unset** body case
  (`response.body` defaults to `{}`), where "no declared fields" must mean "no key constraint", never
  "reject the whole response".
* Keep value-mismatch handling where it already lives — the body-match check (5) — instead of
  overloading the key-set check with value comparison.
* Keep the new logic a small, pure, unit-testable function; no new dependency.

## Considered Options

* **Add the reverse subset direction** — also require `objectExistsInObject(response.data,
  expectedBody)` to PASS (every actual key present in expected).
* **Dedicated recursive key-collection** — a new `findUnexpectedKeys(expected, actual)` that walks
  the actual object's keys, collects any not declared in expected (as dot-paths), and recurses into
  nested plain objects.

## Decision Outcome

Chosen: **dedicated recursive key-collection** (`findUnexpectedKeys`, plus a small `isPlainObject`
helper). Reusing `objectExistsInObject` in reverse would conflate two concerns: that helper FAILs on
value mismatches too, so `objectExistsInObject(actual, expected)` would flag a value disagreement as
an "unexpected field", double-counting what the body-match check already reports and producing a
misleading description. A purpose-built function keeps `noUnexpectedFields` strictly about the
presence of undeclared **keys**.

`findUnexpectedKeys(expected, actual, prefix)` returns the list of undeclared keys as dot-paths
(e.g. `user.extra`):

* Compares key-by-key only when both sides are plain objects; if either side isn't (primitive,
  array, `null`, mismatched shape), there are no object keys to compare, so it returns `[]` (no
  extras) and defers any shape/value disagreement to the body-match check.
* Recurses into nested plain objects so extras are flagged — and named — at any depth.
* Does **not** special-case an empty expected object: a nested `{}` still constrains, so extras under
  it are reported.

The **root** empty/unset case is handled by the *caller*, not the helper: `findUnexpectedKeys` runs
only when the expected body is a plain object with at least one key. This preserves the unset-body
behavior (`response.body` defaults to `{}` ⇒ no key constraint ⇒ PASS) while still letting a nested
`{}` reject extras. The verdict is `noUnexpectedFields = unexpectedKeys.length === 0`, and the
failure description **names** the offending paths: `Response contained unexpected fields: <a, b.c>.`

The guard for a non-object / undefined expected body (`noUnexpectedFields = true`) is unchanged.
Behavior when `allowAdditionalFields` is `true` or absent is unchanged (the check block only runs
when it is falsy).

### Consequences

* Good: `allowAdditionalFields: false` now rejects responses with fields beyond the expected body,
  recursively — the option finally does what it says.
* Good: value comparison stays in one place (body-match check). `noUnexpectedFields` is purely a
  key-set verdict.
* Neutral: a value mismatch on a same-key-set response now leaves `noUnexpectedFields === true` (the
  step still FAILs, via `bodyMatches`). Previously the subset check drove `noUnexpectedFields` false
  for that case — a coincidental side effect, not the intended signal. The coverage test that
  asserted the old side effect was updated to assert the corrected split (FAIL via `bodyMatches`,
  `noUnexpectedFields` true).
* Neutral: a documentation spec that relied on the (buggy) lenient behavior — expecting a partial
  body while setting `allowAdditionalFields: false` — will now FAIL. That is the point of the option;
  authors who want lenient matching should leave `allowAdditionalFields` at its default (`true`).

### Confirmation

Unit coverage in [test/httprequest-coverage.test.js](../test/httprequest-coverage.test.js): the
`[bug #437]` test asserts that expected `{ a: 1 }` vs actual `{ a: 1, extra: 99 }` with
`allowAdditionalFields: false` FAILs with `noUnexpectedFields === false` and a description naming the
unexpected field. A companion `[bug #437]` test drives the **recursion** path — expected
`{ user: { name: "Jo" } }` vs actual `{ user: { name: "Jo", extra: 99 } }` FAILs with the dot-path
`user.extra` in the description. A nested-empty test confirms the short-circuit is **root-only**:
expected `{ user: {} }` vs actual `{ user: { id: 7 } }` FAILs (naming `user.id`), while an
**unset** expected body accepts any response shape (PASS). Sibling tests confirm an exact key-set
match PASSes, a non-object expected body short-circuits to PASS, and a same-key-set value mismatch
FAILs via `bodyMatches` with `noUnexpectedFields` true. Server-based tests in
[test/httpRequest-assertions.test.js](../test/httpRequest-assertions.test.js) confirm the unset-body
(`{}`) case still PASSes. All pass (`npm run build` then
`npx mocha --exit test/httprequest-coverage.test.js test/httpRequest.test.js
test/httpRequest-assertions.test.js`).

## Docs impact

`allowAdditionalFields` is a documented action option whose reference describes it as rejecting
additional/unexpected fields when `false`. This change makes the implementation honor that
documented meaning — the reference text does not need to change, but any example or guide that
demonstrated a partial `response.body` alongside `allowAdditionalFields: false` and expected a PASS
is now inaccurate and should be corrected. No new flag, output, or default is introduced.

## Pros and Cons of the Options

### Dedicated recursive key-set comparison
* Good: strictly key-set semantics; no false coupling to value comparison; recurses cleanly; pure and
  unit-testable; no dependency.
* Bad: a small amount of new code to maintain (covered by tests).

### Reverse subset direction (`objectExistsInObject(actual, expected)`)
* Good: reuses an existing helper; no new function.
* Bad: conflates value mismatches with unexpected fields (that helper FAILs on value disagreement),
  double-reporting what the body-match check already covers and yielding a misleading verdict and
  description.
