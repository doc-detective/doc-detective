---
status: accepted
date: 2026-07-14
decision-makers: [hawkeyexl]
---

# Default the core `log` level to `info` so 2-arg calls stop silently dropping messages

## Context and Problem Statement

The core logger `log(config, level, message)` in [src/core/utils.ts](../src/core/utils.ts) supports a
convenience 2-argument form, `log(message, level)`. When invoked with two arguments it resets
`config = {}`, so `config.logLevel` is `undefined`. The level-gating logic — extracted by the Phase-1
performance work (PR #632) into the pure predicate `logLevelEnabled(config, level)`, which `log`
delegates to — is a chain of `if (config.logLevel === "error" && …)` branches with **no branch for an
undefined `logLevel`**, so the predicate evaluates to `false` and nothing is printed.

Every 2-arg call therefore emitted **nothing**. The seven active 2-arg call sites all live in
[src/core/expressions.ts](../src/core/expressions.ts) — expression/assertion evaluation:

- line 45 — `"warning"`: could not resolve a standalone expression
- line 238 — `"error"`: error applying a JSON pointer to a value
- line 305 — `"warning"`: could not evaluate an embedded `{{…}}` expression
- line 449 — `"error"`: regex extraction error
- line 493 — `"error"`: error evaluating an expression (`new Function` failure)
- line 779 — `"debug"`: condition has an unresolved meta value; treated as false
- line 804 — `"error"`: error evaluating an assertion

Several are `"error"`-level diagnostics that should surface to help users debug broken conditions and
expressions. Instead they were swallowed. This was confirmed by CodeRabbit on PR #632.

## Decision Drivers

- Error and warning diagnostics from expression/assertion evaluation should reach the user.
- The fix should be small, low-risk, and not require restructuring the expression engine.
- Level semantics should stay consistent with the other logger in the codebase.
- Explicit silencing (`logLevel: "silent"`) must keep suppressing all output.

## Considered Options

- **(a) Default an undefined `logLevel` to `"info"`** inside the `logLevelEnabled` predicate that the
  core `log` delegates to (parity with [src/utils.ts](../src/utils.ts)'s `log`, which already does
  `config.logLevel || "info"`).
- **(b) Convert the seven `expressions.ts` sites to the 3-arg `log(config, level, message)` form** by
  threading a `config` object into the expression engine so each log respects the user's configured
  `logLevel`.

## Decision Outcome

Chosen option: **(a)**, because `config` is **not in scope** at any `expressions.ts` log site and does
not thread cleanly. The seven functions involved (`resolveExpression`, `resolveExpressionOrThrow`,
`replaceMetaValues`, `getMetaValue`, `resolveEmbeddedExpressions`, `evaluateExpression`,
`evaluateAssertion`) all pass a `context` object, never a `config`. Threading `config` would require
changing all seven signatures **plus** the routing-layer callers
(`evaluateImplicitAssertions`, `evaluateGuard`, `evaluateCustomAssertions`, and their entire call
chains through [src/core/routing.ts](../src/core/routing.ts) and
[src/core/tests.ts](../src/core/tests.ts)) — a broad, invasive change spread across several files for
a one-line defect. Option (a) is a single, well-contained fix that also aligns the core logger's
default with the existing CLI logger.

The change: inside `logLevelEnabled`, compute `const currentLevel = config.logLevel || "info"` and
branch on `currentLevel`. Because `log` delegates to `logLevelEnabled`, the guard predicate (used by
hot call sites to skip expensive message construction) and `log`'s own gating share one source of
truth for the level policy and cannot drift.

### Consequences

- Good, because previously-silent `error`/`warning` diagnostics from expression and assertion
  evaluation now surface for users at the default `info` verbosity.
- Good, because core `log` now matches [src/utils.ts](../src/utils.ts)'s `info` default, removing a
  latent inconsistency between the two loggers.
- Good, because `logLevel: "silent"` (and any explicit level) is preserved — the default only applies
  to an undefined/empty level, so explicit silencing still suppresses everything.
- Neutral/known trade-off: all 2-arg core `log` calls now print at the `info` default regardless of
  the user's configured level (a 2-arg call carries no `config`, so it never could respect the
  configured level). This is bounded — only the seven `expressions.ts` sites use the 2-arg form, the
  `"debug"` one (line 779) still stays suppressed under the `info` default, and every other core
  `log` call already uses the 3-arg form or a correctly-wrapped injected logger that forwards
  `config`. If a future need arises to make these respect configured verbosity, option (b) remains
  available as a follow-up.

### Confirmation

Covered by unit tests in
[test/core-utils-coverage.test.js](../test/core-utils-coverage.test.js). In the
`log (level filtering + 2-arg form)` block, the 2-arg form now emits `info`/`warning`/`error`,
still suppresses `debug` under the `info` default, and the 3-arg form with an explicit `logLevel` is
unaffected. In the `logLevelEnabled` block, the predicate now reports `true` for an undefined/empty
`logLevel` at `error`/`warning`/`info` and `false` at `debug`, while an explicit `silent` still
suppresses everything. The pre-existing tests that asserted the buggy "2-arg form logs nothing" and
"undefined `logLevel` returns `false`" behaviors were updated to assert the corrected behavior.

## Pros and Cons of the Options

### (a) Default undefined `logLevel` to `info`

- Good, because it is a one-line, self-contained change with no ripple across the expression engine.
- Good, because it makes the core logger consistent with the CLI logger's existing `info` default.
- Good, because it preserves explicit `silent`/level settings.
- Bad, because 2-arg calls print at `info` regardless of configured verbosity (bounded to the seven
  `expressions.ts` sites, and `debug` stays suppressed).

### (b) Thread `config` into the expression engine and use the 3-arg form

- Good, because those logs would respect the user's configured `logLevel`.
- Bad, because `config` is not in scope anywhere in the expression engine; it would require changing
  seven `expressions.ts` signatures plus the routing/tests call chains — a large, invasive change for
  a one-line defect, with correspondingly higher regression risk.
