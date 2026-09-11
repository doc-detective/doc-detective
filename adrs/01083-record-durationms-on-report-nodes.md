---
status: accepted
date: 2026-07-24
decision-makers: doc-detective maintainers
---

# Record `durationMs` on every report node

## Context and Problem Statement

Nothing in a results report records how long anything took. Grepping `src/core/tests.ts`,
`src/core/index.ts`, and `src/core/utils.ts` for `duration|startTime|elapsed` turns up only an
unrelated poll loop and `warm.durationMs`. No timing was captured around `runStep` or
`runContext`.

Three consequences:

- A **`junit` reporter** (#683) would have to emit `time="0"` on every `<testcase>`, so the GitLab
  MR test-summary widget (and GitHub's test reporting) would show `0s` everywhere. The timing
  columns become dead weight.
- **Slow-test triage is impossible from the report.** There is no way to answer "which spec is
  making CI slow?" without instrumenting by hand.
- The HTML reporter already *tried* to render a run duration. `src/reporters/htmlReporter.ts`
  read `results.meta.startedAt` and `results.meta.finishedAt`, fields **nothing in `src/` ever
  wrote**. `setMeta()` only populates the `DOC_DETECTIVE_META` env var for telemetry. Step rows
  rendered `step.duration`, which is an *authored action input* rather than a timing. Both chips
  rendered an em-dash on every real run.

## Decision Drivers

* Unblock a `junit` reporter with real per-testcase times. That's #683, the first-class GitLab CI
  initiative, in `docs/design/gitlab-ci-first-class-support.md`.
* Make slow-test triage answerable from the report alone.
* Do not collide with the authored `duration` action input.
* Honest numbers under `concurrentRunners`. Never report a figure whose meaning silently changes
  with the concurrency setting.
* Minimal risk to `runContext`, the largest function in the runner.

## Considered Options

* **A. `durationMs` on every node; wall clock where a contiguous interval exists, sum-of-children
  at test and spec** (chosen).
* **B. `durationMs` as a sum at every level above the context**, including the run.
* **C. Wall-clock span at every level**, tracking min-start / max-end per test and spec.
* **D. Reuse the name `duration`** rather than introducing `durationMs`.

## Decision Outcome

Chosen: **option A**. Every run, spec, test, context, and step report node carries `durationMs`.
It's integer milliseconds, `readOnly`, system-populated, and never authored.

```text
step.durationMs    = measured wall clock of the FINAL attempt
context.durationMs = measured wall clock of the FINAL attempt
test.durationMs    = sum(context.durationMs)
spec.durationMs    = sum(test.durationMs)
run.durationMs     = measured wall clock of the execution phase
```

The run clock starts inside `runSpecs`, so it spans the warm phase, every spec, and teardown. But it
**excludes test detection, resolution, and just-in-time dependency installs**, which `runTests`
performs before calling it. On a cold runner the process therefore takes measurably longer than
`run.durationMs` reports. This boundary is deliberate. The excluded work is one-time environment
setup that isn't attributable to any test. And the field's consumers, a `junit` reporter and
slow-test triage, are asking about test execution. The schema description states the exclusion, so
the number is not mistaken for total process time.

### Why sums at test and spec

Contexts from every test and every spec are flattened into **one concurrent job pool**. A
wall-clock *span* for a test would therefore include idle time while unrelated specs were running.
A test whose two contexts got pool slots at t=0 and t=45s would report 47s for 2s of actual work.
The sum is total work. That's the right answer for "which spec is making CI slow", and the
conventional meaning of JUnit's `<testsuite time>`. This rules out **option C**.

### The concurrency caveat, stated explicitly

`run.durationMs` is measured elapsed time, while `spec.durationMs` is a sum. **Under
`concurrentRunners > 1`, `run.durationMs` can be LESS than the sum of the per-spec durations.**
This is intended: the run figure answers "how long did I wait?" and the spec figures answer "where
did the work go?" Making the run a sum too, **option B**, would give a tidier invariant. But the
cost is a headline number that overstates elapsed time. A 4-way-concurrent 60s run would report
~200s, and the HTML duration chip could not honestly use it.

### Retry semantics

Take a step re-run by `onFail: retry` routing, or a context re-run by the `retries` policy
(ADR 01082). `durationMs` is the **final attempt's** elapsed time. It isn't the sum across attempts,
and doesn't include the backoff waits between them. The final attempt is the one the reported
`result` describes, so its timing is the one that matches the verdict. The surrounding `attempts`
and `retries` fields already tell a consumer that earlier attempts happened.

The two retry levels differ in whether that discarded time is recoverable from the report, and the
distinction is easy to state imprecisely:

- **Step retries stay visible one level up.** The context clock spans every attempt of its steps,
  plus the backoff waits between them. So a retried step's discarded time is still counted in
  `context.durationMs`, even though the step itself reports only its final attempt. It is *counted*
  rather than *isolated*. `context.durationMs - sum(step.durationMs)` is an **upper** bound on retry
  cost, because that same gap also holds ordinary context overhead. That's preflight, driver
  startup, and teardown, which are there whether or not anything retried. Read `attempts` to know a
  retry happened at all.
- **Context retries do not.** A re-run context reports only its final attempt. The test level is a
  sum of those final-attempt values, so no node absorbs the abandoned attempts. Time spent on a
  context attempt that was thrown away appears nowhere in the totals. `retries` is the only signal
  it happened.

Accepted as a consequence of choosing final-attempt semantics. Summing context attempts instead
would make `context.durationMs` describe work the reported `result` does not, which is the
ambiguity this rule exists to avoid.

### Why `durationMs`, not `duration`

Step reports are built as `{ ...step, ...result }`. So an authored action input named `duration`
already spreads into the step report. That covers `click` press-duration, `annotation`
display-duration, `dragAndDrop`, and `moveTo`. Reusing that name, **option D**, would produce an
overloaded field. It would sometimes mean "how long to hold the mouse button", and sometimes "how
long the step took." `warm.durationMs`
already establishes the name and the unit in `report_v3`, so this is consistent with the existing
report contract rather than novel.

### Presence, deliberately unlike `attempts` / `visit`

`attempts` and `visit` are *additive-only-when-nontrivial*, so an un-retried, once-visited step
report stays byte-identical. `durationMs` deliberately **does not** follow that convention. It is
present on every node of a completed run. A step or context that never executed reports `0`. That
covers skipped, unsafe, guard-`if` false, routing-error marker, and crash-isolated nodes. A reporter
that has to branch on presence cannot emit a complete `<testsuite>`, which is the whole point of the
field.

That guarantee is enforced in **one place**. The Phase 3 roll-up pass in `runSpecs` defaults any
node still missing the field, with `??= 0`, as it walks the tree. Phase 3 is the only code that sees
every node from both execution paths, the flat concurrent pool and the routed sequencer. It's also
the only code that sees both kinds of node, measured and synthetic. Synthetic context reports are
built at seven scattered sites. Those are `prepareContextSlot`'s spec-guard, test-guard, and
recording-name-conflict skips, the two crash-isolation handlers, the routed `stopRest` skip, and the
runaway-`goToTest` marker. So stamping `0` at each construction site would be a standing invitation
for the next one to forget. The report is not runtime-validated, per ADR 01060, so a forgotten site
would surface only as `undefined` in a downstream reporter. One default in the pass that already
traverses everything is the durable form.

Two consequences are worth noting. The `runContext` step loop's `pushStepReport` funnel needs no
default of its own. And the recording-teardown sweep, `stopAllRecordings`, pushes step reports
directly, bypassing that funnel. It is given a **real clock** rather than being left to the `0`
default, because those steps genuinely execute.

### Consequences

* Good: a `junit` reporter can emit real times, and slow-test triage works from the report. The HTML
  reporter's duration chip and per-step durations render real values for the first time.
* Good: `runContext` is untouched. The clock lives in `runContextWithRetries`, its sole caller. That
  covers all twelve of `runContext`'s exits with one measurement, meaning eleven early SKIPPED
  returns plus the normal one.
* Bad: `run.durationMs < sum(spec.durationMs)` under concurrency will surprise anyone who assumes
  a uniform roll-up. Mitigated by saying so in the schema descriptions, the docs, and here.
* Neutral: reports grow by one small integer field per node.
* Neutral: it uses `Date.now()` rather than `performance.now()`, matching the `warmPhase.ts`
  precedent. That's wall-clock, so a suspended or throttled CI runner's stalls are counted. That's
  what a user waiting on CI actually experiences.

### Confirmation

* `src/common/test/validate.test.js` covers `report_v3 durationMs`. There's a positive case with the
  field on all five node levels, and a back-compat case without it. Negatives at each level cover a
  negative value and a fractional value. The negatives assert the failure comes from the `minimum`/`integer` constraint and
  **not** from `additionalProperties`, so they cannot pass against a schema that never declared the
  field.
* `test/core-core.test.js` covers `durationMs on report nodes`. It's present, integer, and
  non-negative on every node of a completed run. `test == sum(contexts)`, `spec == sum(tests)`, and
  `context >= sum(steps)`. A step re-run by `onFail: retry` reports well under the accumulated
  backoff. A never-executed step reports `0`. A context skipped by a false test guard still carries
  the field, and that's one of the synthetic sites that never reaches a clock. And a
  filtered-to-zero run does not throw.
* `test/concurrency.test.js` has the 1-runner versus 2-runner byte-identical-report assertion. It
  now asserts `durationMs` is present at every level, then strips it before comparing. It is
  measured time, so it can never match across runs. The run-level value is *expected* to differ.
  That test observed ~3985 ms serial against ~1969 ms with two runners, while the spec-level sums
  held at ~2770 ms either way. That's a direct demonstration of both the concurrency caveat, and the
  stability of the sum-based levels.
* `test/browser-fallback.test.js` covers `runContextWithRetries`. The retries-disabled fast path is
  still stamped, and a retried context reports the final attempt rather than the sum.

Feature fixtures under `test/core-artifacts/` are **not** used here. A spec cannot read its own run
report, so this behavior is not expressible through the PASS/SKIPPED gate. Per `CLAUDE.md`, the
precise assertions live in `test/core-core.test.js` instead.

## Pros and Cons of the Options

### A. Wall clock where measurable, sums at test and spec (chosen)

* Good, the run figure is honest elapsed time, usable for the HTML duration chip.
* Good, the spec and test figures are total work, stable under any `concurrentRunners` value.
* Good, matches JUnit's conventional `<testsuite time>`.
* Bad, the roll-up invariant is not uniform across all five levels.

### B. Sum all the way up

* Good, uniform invariant: `parent == sum(children)` above the context.
* Bad, `run.durationMs` overstates elapsed time under concurrency, sometimes by several multiples.
* Bad, leaves the HTML duration chip with no honest source.

### C. Wall-clock span at every level

* Good, "duration" means one thing everywhere.
* Bad, a test's span includes idle gaps while unrelated specs ran. So slow-test triage is actively
  misleading, the failure mode that motivated the issue.
* Bad, requires threading min-start / max-end through the concurrent pool.

### D. Reuse the name `duration`

* Good, no new vocabulary.
* Bad, collides with authored action inputs through the `{ ...step, ...result }` spread; the field
  would mean two different things depending on the action.
