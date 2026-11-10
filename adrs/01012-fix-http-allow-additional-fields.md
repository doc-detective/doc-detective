---
status: accepted
date: 2026-06-30
decision-makers: doc-detective maintainers
---

# Fix `allowAdditionalFields: false` to reject responses with extra fields

## Context and Problem Statement

The `httpRequest` step type exposes `allowAdditionalFields`. When set to `false`, the documented
intent is that a response must **not** carry fields beyond those the author declared in
`response.body`. Extra keys should fail the step.

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
subset check PASSes and `noUnexpectedFields` stayed `true`. The option silently did nothing. A
response with additional fields was accepted, even though the author asked for a strict shape.

This is a contract bug, not a contract change: `allowAdditionalFields: false` was always meant to
reject additional fields. The subset check was simply the wrong tool for the job.

## Decision Drivers

* Make `allowAdditionalFields: false` honor its documented meaning: reject responses whose keys
  aren't declared in the expected body, recursively for nested objects.
* Don't regress the guard for a non-object or undefined expected body. The **unset** body case also
  matters (`response.body` defaults to `{}`), where "no declared fields" must mean "no key
  constraint", never "reject the whole response".
* Keep value-mismatch handling where it already lives, in the body-match check (5), instead of
  overloading the key-set check with value comparison.
* Keep the new logic a small, pure, unit-testable function; no new dependency.

## Considered Options

* **Add the reverse subset direction.** Also require `objectExistsInObject(response.data,
  expectedBody)` to PASS, so every actual key is present in expected.
* **Dedicated recursive key-collection.** A new `findUnexpectedKeys(expected, actual)` walks
  the actual object's keys. It collects any not declared in expected, as dot-paths, and recurses into
  nested plain objects.

## Decision Outcome

Chosen: **dedicated recursive key-collection** (`findUnexpectedKeys`, plus a small `isPlainObject`
helper). Reusing `objectExistsInObject` in reverse would conflate two concerns. That helper FAILs on
value mismatches too. So `objectExistsInObject(actual, expected)` would flag a value disagreement as
an "unexpected field", double-counting what the body-match check already reports and producing a
misleading description. A purpose-built function keeps `noUnexpectedFields` strictly about the
presence of undeclared **keys**.

`findUnexpectedKeys(expected, actual, prefix)` returns the list of undeclared keys as dot-paths
(e.g. `user.extra`):

* Compares key-by-key only when both sides are plain objects. If either side isn't, meaning a
  primitive, array, `null`, or mismatched shape, there are no object keys to compare. It returns
  `[]`, no extras, and defers any shape or value disagreement to the body-match check.
* Recurses into nested plain objects, so extras are flagged, and named, at any depth.
* Does **not** special-case an empty expected object: a nested `{}` still constrains, so extras under
  it are reported.

The **root** empty or unset case is handled by the *caller*, not the helper. `findUnexpectedKeys`
runs only when the expected body is a plain object with at least one key. This preserves the
unset-body behavior (`response.body` defaults to `{}` ⇒ no key constraint ⇒ PASS), while still letting a nested
`{}` reject extras. The verdict is `noUnexpectedFields = unexpectedKeys.length === 0`, and the
failure description **names** the offending paths: `Response contained unexpected fields: <a, b.c>.`

The guard for a non-object / undefined expected body (`noUnexpectedFields = true`) is unchanged.
Behavior when `allowAdditionalFields` is `true` or absent is unchanged (the check block only runs
when it is falsy).

### Consequences

* Good: `allowAdditionalFields: false` now rejects responses with fields beyond the expected body,
  recursively. The option finally does what it says.
* Good: value comparison stays in one place (body-match check). `noUnexpectedFields` is purely a
  key-set verdict.
* Neutral: a value mismatch on a same-key-set response now leaves `noUnexpectedFields === true`. The
  step still FAILs, through `bodyMatches`. Previously the subset check drove `noUnexpectedFields`
  false for that case, a coincidental side effect rather than the intended signal. The coverage test
  that asserted the old side effect was updated to assert the corrected split: FAIL through
  `bodyMatches`, with `noUnexpectedFields` true.
* Neutral: a documentation spec that relied on the buggy lenient behavior will now FAIL. That's a
  spec expecting a partial body while setting `allowAdditionalFields: false`. That is the point of
  the option. Authors who want lenient matching should leave `allowAdditionalFields` at its default,
  `true`.

### Confirmation

Unit coverage in [test/httprequest-coverage.test.js](../test/httprequest-coverage.test.js): the
`[bug #437]` test asserts that expected `{ a: 1 }` vs actual `{ a: 1, extra: 99 }` with
`allowAdditionalFields: false` FAILs with `noUnexpectedFields === false` and a description naming the
unexpected field. A companion `[bug #437]` test drives the **recursion** path. Expected
`{ user: { name: "Jo" } }` vs actual `{ user: { name: "Jo", extra: 99 } }` FAILs with the dot-path
`user.extra` in the description. A nested-empty test confirms the short-circuit is **root-only**.
Expected `{ user: {} }` vs actual `{ user: { id: 7 } }` FAILs, naming `user.id`. An
**unset** expected body accepts any response shape, a PASS. Sibling tests confirm an exact key-set
match PASSes, and a non-object expected body short-circuits to PASS. A same-key-set value mismatch
FAILs through `bodyMatches`, with `noUnexpectedFields` true. Server-based tests in
[test/httpRequest-assertions.test.js](../test/httpRequest-assertions.test.js) confirm the unset-body
(`{}`) case still PASSes. All pass (`npm run build` then
`npx mocha --exit test/httprequest-coverage.test.js test/httpRequest.test.js
test/httpRequest-assertions.test.js`).

## Docs impact

`allowAdditionalFields` is a documented action option whose reference describes it as rejecting
additional or unexpected fields when `false`. This change makes the implementation honor that
documented meaning, so the reference text does not need to change. But any example or guide that
demonstrated a partial `response.body` alongside `allowAdditionalFields: false` and expected a PASS
is now inaccurate, and should be corrected. No new flag, output, or default is introduced.

## Pros and Cons of the Options

### Dedicated recursive key-set comparison
* Good: strictly key-set semantics; no false coupling to value comparison; recurses cleanly; pure and
  unit-testable; no dependency.
* Bad: a small amount of new code to maintain (covered by tests).

### Reverse subset direction (`objectExistsInObject(actual, expected)`)
* Good: reuses an existing helper; no new function.
* Bad: it conflates value mismatches with unexpected fields, since that helper FAILs on value
  disagreement. It double-reports what the body-match check already covers, and yields a misleading
  verdict and description.
