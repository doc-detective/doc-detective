---
status: accepted
date: 2026-07-01
decision-makers: doc-detective maintainers
---

# Expression error contract: preserve the original `{{…}}` on embedded-expression failure

## Context and Problem Statement

`src/core/expressions.ts` resolves runtime expressions in three shapes that share one resolver
(`resolveExpression`): standalone `$$meta` / operator expressions (used by `step.variables`),
embedded `{{…}}` interpolation, and the condition/assertion path (`evaluateAssertion`).

Three linked defects were found while writing characterization tests for the Phase 2 coverage work
([#422](https://github.com/doc-detective/doc-detective/issues/422)):

- **[#424](https://github.com/doc-detective/doc-detective/issues/424)**. `resolveExpression`
  wrapped its whole body in a `try/catch` that, on **any** error, logged at `error` level and
  returned the *original `expression` argument verbatim*. Callers could not distinguish "resolved to
  this string" from "failed, here is your input back."
- **[#423](https://github.com/doc-detective/doc-detective/issues/423)**. Because the resolver never
  threw, the `{{…}}` loop in `resolveEmbeddedExpressions` never saw a failure. A failing embedded
  expression such as `{{jq($$d, "@@@invalid")}}` therefore emitted the **half-resolved internal
  sub-expression**. That's `jq($$d, "@@@invalid")` with `$$d` left unexpanded, leaking implementation
  detail into user-facing output (`r=jq($$d, "@@@invalid")`). The loop's own `catch`, written to
  preserve the original `{{…}}`, was **unreachable**.
- **[#425](https://github.com/doc-detective/doc-detective/issues/425)**. Three things were
  structurally dead. That unreachable `catch`, the `jq()` helper's *synchronous* `catch`, and a
  couple of defensive type-guards. The sync `catch` can never fire, because jq rejects
  **asynchronously**. All of it reads as protection but does nothing, and blocked the file from an
  honest 100%.

Root-cause chain: the swallow-and-return-input (#424) causes the leak (#423) and leaves the dead
error arms (#425). One contract decision resolves all three.

## Decision Drivers

* **Don't leak internals.** A failed embedded expression must not emit a half-resolved internal
  form; the author should see something intentional.
* **Preserve the byte-identical happy path.** The dynamic-routing roadmap
  ([docs/design/dynamic-routing-roadmap.md](../docs/design/dynamic-routing-roadmap.md)) pins that
  `step.variables` and `{{…}}` interpolation must resolve unchanged. `"x > out.txt"` stays a literal
  string, and an unresolved `$$token` passes through as a literal. Only genuine evaluation errors
  reach the `catch`, so the error behavior can change without touching that contract.
* **Keep the standalone `step.variables` fallback non-breaking.** A malformed variable expression
  should still degrade to literal text rather than crash the step.
* **Make coverage honest.** Dead error arms must become reachable or be annotated with a reason.

## Considered Options

* **A. Preserve the original `{{…}}` on embedded failure**, making the existing loop `catch`
  reachable through a throwing worker.
* **B. Render an empty string** for a failed embedded expression.
* **C. Propagate the error**, so a failed expression fails the step, including `step.variables`.

## Decision Outcome

Chosen: **Option A, preserve the original `{{…}}`**. It's implemented by splitting the resolver into
a **worker** and a **boundary**:

* `resolveExpressionOrThrow(...)` is the core resolver, WITHOUT the swallow. Errors that escape
  `evaluateExpression` propagate to the caller. In practice that is an **async** operator rejection.
  A bad `jq()` query rejects *after* `evaluateExpression`'s synchronous `try/catch` has returned, so
  the awaiting worker surfaces it. A **synchronous** eval error, such as a `new Function`
  `SyntaxError`, is caught inside `evaluateExpression` and becomes `undefined`. So it does not
  propagate. See the neutral consequence below.
* `resolveExpression(...)` is the public boundary. It wraps the worker in a `try/catch` that returns
  the input unchanged and logs at `warning`. That preserves back-compat on the standalone path, for
  `step.variables` and direct callers. It's an intentional swallow, not a surfaced failure.
* `resolveEmbeddedExpressions(...)` now calls the **worker** directly, so a genuine failure lands in
  its existing `catch`. That pushes `m[0]`, the author's original `{{…}}`, plus a `warning` log.

`jq()` errors are allowed to propagate. The dead synchronous `catch` around `jq.then(...)` is
removed, since it could never catch an async rejection. So a bad jq query rejects, the awaiting
worker surfaces it, and the embedded loop preserves `{{…}}`. The standalone boundary still swallows
to the literal input, unchanged from today.

Option B was rejected because an empty string silently drops the expression with no in-band signal.
The author sees `r=` and must consult logs to know anything failed. Option C was rejected because it
would make a malformed `step.variables` value crash the step. That's a breaking change to a path the
roadmap requires to stay byte-identical.

**Scope of the behavior change is narrow.** `evaluateAssertion` (condition path) and `step.variables`
(standalone) both still call the **public** `resolveExpression`, so their behavior is unchanged
(still swallow-and-return-input). Only the embedded `{{…}}` loop's failure output changes: from the
leaked sub-expression to the preserved `{{…}}`.

### Consequences

* Good: a failed embedded expression now renders the author's original `{{…}}`, with no internal
  leak (#423). The embedded `catch` is reachable and tested (#425).
* Good: the `error`-level log on an intentional swallow becomes `warning`, matching its meaning
  (#424).
* Good: expressions.ts reaches 100% of lines, statements, and functions. The two
  genuinely-unreachable defensive guards are annotated `/* c8 ignore … */` with a reason (#425).
  Those are the non-string entry guard, and the embedded object branch the worker already
  JSON-stringifies away.
* Neutral: a **synchronous** eval error inside an embedded expression still resolves to `undefined`
  and renders as an empty string. Take the malformed `{{jq(}}`. That path returns `undefined`
  without throwing. So the preserved-`{{…}}` path never applies. This behavior is documented and
  tested.
* Neutral: expressions.ts logging is a pre-existing latent no-op. `log(config, level, message)`
  explicitly supports the 2-arg form the file uses. When `message` is `undefined` it shifts, with
  `message = config; config = {}`. So `log(message, level)` is a *supported* call, not a
  signature bug. The no-op is that the defaulted `config`, `{}`, carries no `logLevel`, so no level
  ever matches and nothing is emitted. The fix is therefore to thread a real `config` carrying
  `logLevel` into `resolveExpression`, so these warnings actually surface. That's out of scope here,
  and tracked separately.

### Confirmation

Unit coverage in [test/expressions-coverage.test.js](../test/expressions-coverage.test.js):

* `{{jq($$d, "@@@invalid")}}` resolves to the preserved `r={{jq($$d, "@@@invalid")}}` (was the
  leaked `r=jq($$d, "@@@invalid")`).
* A failed embedded expression is preserved while a sibling that resolves still resolves
  (`ok={{$$n}} bad={{…}}`).
* A synchronous eval error (`{{jq(}}`) renders empty.
* Byte-identical happy-path pins: `"x > out.txt"` → itself; `value=$$missing` → literal;
  `value=$$here` → interpolated.
* The standalone boundary still returns the input on a genuine error
  (`jq($$data, "@@@bad")` → itself).

`npx c8 --include 'dist/core/expressions.js'` reports 100% of lines, statements, and functions for
the expressions module. A feature fixture,
[test/core-artifacts/expression-embedded-failure.spec.json](../test/core-artifacts/expression-embedded-failure.spec.json),
exercises `step.variables` end-to-end through the runner, PASS or SKIPPED only. It covers a valid
`{{…}}`, an invalid `{{…}}` that is preserved, and an operator-like literal.

## Docs impact

`{{…}}` interpolation and `step.variables` are user-facing. The observable change is limited to the
failure case. A broken embedded expression now shows the original `{{…}}` rather than a leaked
internal form. This is closer to what a reader expects, and needs at most a short note in the
variables and expressions reference. No flag, output field, or default changes. The happy path is
byte-identical.

## Pros and Cons of the Options

### A: preserve the original `{{…}}`
* Good: no internal leak, and least surprising. It reuses the loop's already-written intent, and
  keeps the standalone and condition paths byte-identical.
* Bad: a small worker and boundary refactor.

### B: render an empty string
* Good: cleanest output.
* Bad: it silently drops the expression, with no in-band signal that anything failed.

### C: propagate, and fail the step
* Good: loudest. A broken expression can never produce wrong output.
* Bad: breaking for `step.variables`, which the roadmap requires to stay byte-identical.

## Follow-up: a handled bad `jq()` must not leak jq's exit code

`jq-web` is an emscripten and WASM build of jq. On a jq **compile** error, meaning an invalid query,
its runtime leaks jq's own exit code `3` into `process.exitCode` as a side effect. This ADR's
contract handles the error gracefully, by preserving `{{…}}`. Even so, the host process would still
exit non-zero on an otherwise-passing run. That was invisible under mocha, since the framework owns
the process exit. It surfaced once fixtures began running through the standalone CLI and GitHub
Action, per [ADR 01022](01022-parallel-feature-fixture-jobs.md). The `guards` fixture group exited
`3` purely because of `expression-embedded-failure.spec.json`. The `jq` operator in
`src/core/expressions.ts` now snapshots and restores `process.exitCode` around the `jq-web` call. So
a gracefully-handled bad `jq()` query never reddens the caller's exit code. The regression test is
in `test/expressions-unit.test.js`, named "a bad jq() query does NOT leak jq's exit code into
process.exitCode".
