---
status: accepted
date: 2026-06-27
decision-makers: doc-detective maintainers
---

# Custom-assertion `$$steps.*` warning and honoring an explicit `inputDelay: 0`

## Context and Problem Statement

Code review of the routing/expressions promotion ([PR #394](https://github.com/doc-detective/doc-detective/pull/394))
surfaced two behavior defects in addition to the security/quality fixes already recorded in
[ADR 01005](01005-harden-expression-evaluation-escaping-and-redos.md):

- **Finding 5 — silent fail-closed in custom assertions.** `evaluateCustomAssertions`
  ([src/core/routing.ts](../src/core/routing.ts)) evaluates author-written `step.assertions`
  with an empty `steps` map (`steps: {}`), because cross-step `$$steps.*` resolution is deferred
  to a later phase. So a custom assertion that references `$$steps.<id>.outputs.*` resolves
  against nothing, fails closed to FAIL, and turns a passing step into a failure **with no
  explanation**. The guard path already warns about the identical misuse via
  `guardReferencesSteps` (spec/test scope); custom assertions had no equivalent, so authors got
  an unexplained failure instead of a diagnosable one.

- **Finding 6 — explicit `inputDelay: 0` clobbered by the default.** In
  [src/core/tests/typeKeys.ts](../src/core/tests/typeKeys.ts) the recording/browser keystroke
  path resolved the inter-keystroke delay as `step.type.inputDelay || 100`. Because `0` is
  falsy, an author who explicitly set `inputDelay: 0` ("type as fast as possible") silently got
  the 100ms default instead. The schema default *is* 100, but an explicit `0` is a distinct,
  valid author intent the runner must honor.

Both are observable-behavior changes, so they need an ADR.

## Decision Drivers

* Fail-closed is correct (an unresolvable reference must not pass), but it must be **diagnosable** —
  parity with the existing guard-scope warning, not a silent failure.
* "Absent" and "explicitly zero" are different author intents and must resolve differently.
* No behavior change for any test that does not use the affected feature shape — these are
  targeted fixes, not redesigns.
* Keep the new logic in small, pure, unit-testable helpers (per the repo's CLI/runtime helper
  convention) rather than inlined falsy checks.

## Considered Options

* **A. Add a parity warning detector + use nullish-coalescing semantics** (chosen).
* **B. Make `$$steps.*` resolve in custom assertions now** (implement cross-step resolution
  early) and/or **treat `inputDelay: 0` as "use default"**.
* **C. Leave fail-closed silent; clamp `inputDelay` to a minimum of 1ms.**

## Decision Outcome

Chosen option **A**.

1. **Finding 5.** Add `customAssertionsReferenceSteps(step)` — the parity sibling of
   `guardReferencesSteps` — which inspects only the author string form (`string | string[]`,
   ignoring the report shape) for `$$steps.`. At the `runStep` call site, before evaluating
   custom assertions, emit a `warning`-level log naming the step when the detector fires. The
   assertion still fails closed (unchanged verdict); the author is now told why and how to fix it
   (use `$$outputs.*`). Cross-step resolution stays deferred — this is a diagnosability change,
   not a semantics change.

2. **Finding 6.** Introduce `resolveInputDelay(value)` returning the value when it is a number
   and `100` only when it is absent (`undefined`/`null`/non-number) — i.e. nullish semantics, so
   an explicit `0` is honored. Use it on the recording/browser path, which previously clobbered an explicit `inputDelay: 0`
   to `100`. The process-surface path is left unchanged: it already honors an explicit `0` directly
   via its `inputDelay > 0` keystroke-gap guard (so `0` = no inter-key delay there), while an absent
   value is governed by the schema default (`type.inputDelay` defaults to `100`) rather than meaning
   "no delay".

### Consequences

* Good: a `$$steps.*` custom assertion now produces an actionable warning instead of a silent,
  confusing FAIL; `inputDelay: 0` is honored end-to-end.
* Good: both fixes live in pure helpers (`customAssertionsReferenceSteps`, `resolveInputDelay`)
  that are unit-tested without a driver/HTTP.
* Neutral: the FAIL verdict for a `$$steps.*` custom assertion is unchanged (still fails closed);
  only an additional warning is emitted. The `goToTest`/cross-step roadmap is unaffected.
* Known limit: `resolveInputDelay` treats a non-number (e.g. a stray string) as "absent" and
  falls back to 100; the schema already constrains `inputDelay` to a number, so this is defensive.

### Confirmation

* Red→green unit tests:
  [test/custom-assertions.test.js](../test/custom-assertions.test.js) covers
  `customAssertionsReferenceSteps` (string, array, report-shape, empty);
  [test/background-process.test.js](../test/background-process.test.js) covers `resolveInputDelay`
  (undefined/null → 100, explicit 0 → 0, positive → verbatim).
* A focused integration test in [test/core-core.test.js](../test/core-core.test.js) asserts a
  `$$steps.*` custom assertion both fails the step and emits the `$$steps.*` warning.
* A feature fixture permutation in
  [test/core-artifacts/type-to-process.spec.json](../test/core-artifacts/type-to-process.spec.json)
  types into a process surface with `inputDelay: 0` and asserts the result still appears (PASS on
  every platform; SKIPPED where the context can't be provisioned).

## Pros and Cons of the Options

### A. Parity warning detector + nullish-coalescing (chosen)

* Good: minimal, behavior-preserving except for the intended fixes; diagnosable; helper-tested.
* Good: mirrors an existing, accepted pattern (`guardReferencesSteps`).
* Bad: the warning is advisory only; a determined author can still ignore it (acceptable).

### B. Resolve `$$steps.*` early / treat `0` as default

* Good: would make `$$steps.*` in custom assertions actually work.
* Bad: pulls forward deferred cross-step routing work and its risks into a review-fix PR; and
  treating `0` as "use default" contradicts the author's explicit intent.

### C. Silent fail-closed + clamp to 1ms

* Good: tiny diff.
* Bad: keeps the confusing silent failure; a 1ms clamp still ignores the explicit `0` intent.
