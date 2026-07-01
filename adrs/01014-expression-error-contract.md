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

- **[#424](https://github.com/doc-detective/doc-detective/issues/424)** — `resolveExpression`
  wrapped its whole body in a `try/catch` that, on **any** error, logged at `error` level and
  returned the *original `expression` argument verbatim*. Callers could not distinguish "resolved to
  this string" from "failed, here is your input back."
- **[#423](https://github.com/doc-detective/doc-detective/issues/423)** — because the resolver never
  threw, the `{{…}}` loop in `resolveEmbeddedExpressions` never saw a failure. A failing embedded
  expression such as `{{jq($$d, "@@@invalid")}}` therefore emitted the **half-resolved internal
  sub-expression** — `jq($$d, "@@@invalid")` with `$$d` left unexpanded — leaking implementation
  detail into user-facing output (`r=jq($$d, "@@@invalid")`). The loop's own `catch`, written to
  preserve the original `{{…}}`, was **unreachable**.
- **[#425](https://github.com/doc-detective/doc-detective/issues/425)** — that unreachable `catch`,
  plus the `jq()` helper's *synchronous* `catch` (jq rejects **asynchronously**, so the sync `catch`
  can never fire), plus a couple of defensive type-guards, were structurally dead — code that reads
  as protection but does nothing, and blocked the file from an honest 100%.

Root-cause chain: the swallow-and-return-input (#424) causes the leak (#423) and leaves the dead
error arms (#425). One contract decision resolves all three.

## Decision Drivers

* **Don't leak internals.** A failed embedded expression must not emit a half-resolved internal
  form; the author should see something intentional.
* **Preserve the byte-identical happy path.** The dynamic-routing roadmap
  ([docs/design/dynamic-routing-roadmap.md](../docs/design/dynamic-routing-roadmap.md)) pins that
  `step.variables` and `{{…}}` interpolation must resolve unchanged: `"x > out.txt"` stays a literal
  string; an unresolved `$$token` passes through as a literal. Only genuine evaluation errors reach
  the `catch`, so the error behavior can change without touching that contract.
* **Keep the standalone `step.variables` fallback non-breaking.** A malformed variable expression
  should still degrade to literal text rather than crash the step.
* **Make coverage honest.** Dead error arms must become reachable or be annotated with a reason.

## Considered Options

* **A — Preserve the original `{{…}}` on embedded failure** (make the existing loop `catch`
  reachable via a throwing worker).
* **B — Render an empty string** for a failed embedded expression.
* **C — Propagate the error** so a failed expression fails the step (including `step.variables`).

## Decision Outcome

Chosen: **Option A — preserve the original `{{…}}`**, implemented by splitting the resolver into a
**worker** and a **boundary**:

* `resolveExpressionOrThrow(...)` — the core resolver, WITHOUT the swallow. Genuine evaluation errors
  (a `jq` rejection, a `new Function` `SyntaxError`) propagate to the caller.
* `resolveExpression(...)` — the public boundary. It wraps the worker in a `try/catch` that, for
  back-compat on the standalone path (`step.variables` and direct callers), returns the input
  unchanged and logs at `warning` (an intentional swallow, not a surfaced failure).
* `resolveEmbeddedExpressions(...)` now calls the **worker** directly, so a genuine failure lands in
  its existing `catch`, which pushes `m[0]` — the author's original `{{…}}` — plus a `warning` log.

`jq()` errors are allowed to propagate: the dead synchronous `catch` around `jq.then(...)` (which
could never catch an async rejection) is removed, so a bad jq query rejects, the awaiting worker
surfaces it, and the embedded loop preserves `{{…}}` (while the standalone boundary swallows to the
literal input, unchanged from today).

Option B was rejected because an empty string silently drops the expression with no in-band signal —
the author sees `r=` and must consult logs to know anything failed. Option C was rejected because it
would make a malformed `step.variables` value crash the step, a breaking change to a path the
roadmap requires to stay byte-identical.

**Scope of the behavior change is narrow.** `evaluateAssertion` (condition path) and `step.variables`
(standalone) both still call the **public** `resolveExpression`, so their behavior is unchanged
(still swallow-and-return-input). Only the embedded `{{…}}` loop's failure output changes: from the
leaked sub-expression to the preserved `{{…}}`.

### Consequences

* Good: a failed embedded expression now renders the author's original `{{…}}` — no internal leak
  (#423). The embedded `catch` is reachable and tested (#425).
* Good: the `error`-level log on an intentional swallow becomes `warning`, matching its meaning
  (#424).
* Good: expressions.ts reaches 100% lines/statements/functions; the two genuinely-unreachable
  defensive guards (the non-string entry guard; the embedded object branch the worker already
  JSON-stringifies away) are annotated `/* c8 ignore … */` with a reason (#425).
* Neutral: a **synchronous** eval error inside an embedded expression (e.g. the malformed
  `{{jq(}}`) still resolves to `undefined` and renders as an empty string — that path returns
  `undefined` without throwing, so it is not the preserved-`{{…}}` path. Documented and tested.
* Neutral: expressions.ts logging is a pre-existing latent no-op — `log` is imported as
  `log(config, level, message)` but called `log(message, level)` (no `config` is threaded into
  `resolveExpression`). Fixing the signature is out of scope here (it requires threading `config`
  through the resolver); the new calls follow the file's existing 2-arg convention. Tracked
  separately.

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

`npx c8 --include 'dist/core/expressions.js'` reports 100% lines/statements/functions for
expressions.ts. A feature fixture
([test/core-artifacts/expression-embedded-failure.spec.json](../test/core-artifacts/expression-embedded-failure.spec.json))
exercises `step.variables` with a valid `{{…}}`, an invalid `{{…}}` (preserved), and an
operator-like literal end-to-end through the runner (PASS/SKIPPED only).

## Docs impact

`{{…}}` interpolation and `step.variables` are user-facing. The observable change is limited to the
failure case: a broken embedded expression now shows the original `{{…}}` rather than a leaked
internal form. This is closer to what a reader expects and needs at most a short note in the
variables/expressions reference; no flag, output field, or default changes. The happy path is
byte-identical.

## Pros and Cons of the Options

### A — Preserve the original `{{…}}`
* Good: no internal leak; least surprising; reuses the loop's already-written intent; keeps the
  standalone and condition paths byte-identical.
* Bad: a small worker/boundary refactor.

### B — Render empty string
* Good: cleanest output.
* Bad: silently drops the expression; no in-band signal that anything failed.

### C — Propagate / fail the step
* Good: loudest; a broken expression can never produce wrong output.
* Bad: breaking for `step.variables`, which the roadmap requires to stay byte-identical.
