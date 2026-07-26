---
status: accepted
date: 2026-07-24
decision-makers: doc-detective maintainers
---

# Record `durationMs` on every report node

## Context and Problem Statement

Nothing in a results report records how long anything took. Grepping `src/core/tests.ts`,
`src/core/index.ts`, and `src/core/utils.ts` for `duration|startTime|elapsed` turns up only an
unrelated poll loop and `warm.durationMs` — no timing was captured around `runStep` or
`runContext`.

Three consequences:

- A **`junit` reporter** (#683) would have to emit `time="0"` on every `<testcase>`, so the GitLab
  MR test-summary widget (and GitHub's test reporting) would show `0s` everywhere. The timing
  columns become dead weight.
- **Slow-test triage is impossible from the report.** There is no way to answer "which spec is
  making CI slow?" without instrumenting by hand.
- The HTML reporter already *tried* to render a run duration: `src/reporters/htmlReporter.ts`
  read `results.meta.startedAt` / `results.meta.finishedAt` — fields **nothing in `src/` ever
  wrote** (`setMeta()` only populates the `DOC_DETECTIVE_META` env var for telemetry). Step rows
  rendered `step.duration`, which is an *authored action input*, not a timing. Both chips rendered
  an em-dash on every real run.

## Decision Drivers

* Unblock a `junit` reporter with real per-testcase times (#683, the first-class GitLab CI
  initiative — `docs/design/gitlab-ci-first-class-support.md`).
* Make slow-test triage answerable from the report alone.
* Do not collide with the authored `duration` action input.
* Honest numbers under `concurrentRunners` — never report a figure whose meaning silently changes
  with the concurrency setting.
* Minimal risk to `runContext`, the largest function in the runner.

## Considered Options

* **A. `durationMs` on every node; wall clock where a contiguous interval exists, sum-of-children
  at test and spec** (chosen).
* **B. `durationMs` as a sum at every level above the context**, including the run.
* **C. Wall-clock span at every level**, tracking min-start / max-end per test and spec.
* **D. Reuse the name `duration`** rather than introducing `durationMs`.

## Decision Outcome

Chosen: **option A**. Every run, spec, test, context, and step report node carries `durationMs` —
integer milliseconds, `readOnly`, system-populated, never authored.

```text
step.durationMs    = measured wall clock of the FINAL attempt
context.durationMs = measured wall clock of the FINAL attempt
test.durationMs    = sum(context.durationMs)
spec.durationMs    = sum(test.durationMs)
run.durationMs     = measured wall clock of the execution phase
```

The run clock starts inside `runSpecs`, so it spans the warm phase, every spec, and teardown, but
**excludes test detection, resolution, and just-in-time dependency installs**, which `runTests`
performs before calling it. On a cold runner the process therefore takes measurably longer than
`run.durationMs` reports. This boundary is deliberate: the excluded work is one-time environment
setup that isn't attributable to any test, and the field's consumers — a `junit` reporter and
slow-test triage — are asking about test execution. The schema description states the exclusion so
the number is not mistaken for total process time.

### Why sums at test and spec

Contexts from every test and every spec are flattened into **one concurrent job pool**. A
wall-clock *span* for a test would therefore include idle time during which unrelated specs were
running — a test whose two contexts got pool slots at t=0 and t=45s would report 47s for 2s of
actual work. The sum is total work: the right answer for "which spec is making CI slow", and the
conventional meaning of JUnit's `<testsuite time>`. This rules out **option C**.

### The concurrency caveat, stated explicitly

`run.durationMs` is measured elapsed time, while `spec.durationMs` is a sum. **Under
`concurrentRunners > 1`, `run.durationMs` can be LESS than the sum of the per-spec durations.**
This is intended: the run figure answers "how long did I wait?" and the spec figures answer "where
did the work go?" Making the run a sum too (**option B**) would give a tidier invariant at the cost
of a headline number that overstates elapsed time — a 4-way-concurrent 60s run would report ~200s,
and the HTML duration chip could not honestly use it.

### Retry semantics

For a step re-run by `onFail: retry` routing, or a context re-run by the `retries` policy
(ADR 01082), `durationMs` is the **final attempt's** elapsed time — not the sum across attempts,
and not including the backoff waits between them. The final attempt is the one the reported
`result` describes, so its timing is the one that matches the verdict. The surrounding `attempts`
and `retries` fields already tell a consumer that earlier attempts happened.

The two retry levels differ in whether that discarded time is recoverable from the report, and the
distinction is easy to state imprecisely:

- **Step retries stay visible one level up.** The context clock spans every attempt of its steps
  plus the backoff waits between them, so a retried step's discarded time is still counted in
  `context.durationMs` even though the step itself reports only its final attempt. It is *counted*,
  not *isolated*: `context.durationMs - sum(step.durationMs)` is an **upper** bound on retry cost,
  because that same gap also holds ordinary context overhead — preflight, driver startup, teardown —
  which is there whether or not anything retried. Read `attempts` to know a retry happened at all.
- **Context retries do not.** A re-run context reports only its final attempt, and because the test
  level is a sum of those final-attempt values, no node absorbs the abandoned attempts. Time spent
  on a context attempt that was thrown away appears nowhere in the totals; `retries` is the only
  signal it happened.

Accepted as a consequence of choosing final-attempt semantics. Summing context attempts instead
would make `context.durationMs` describe work the reported `result` does not, which is the
ambiguity this rule exists to avoid.

### Why `durationMs`, not `duration`

Step reports are built as `{ ...step, ...result }`, so an authored action input named `duration` —
`click` press-duration, `annotation` display-duration, `dragAndDrop`, `moveTo` — already spreads
into the step report. Reusing that name (**option D**) would produce a field that sometimes means
"how long to hold the mouse button" and sometimes "how long the step took." `warm.durationMs`
already establishes the name and the unit in `report_v3`, so this is consistent with the existing
report contract rather than novel.

### Presence, deliberately unlike `attempts` / `visit`

`attempts` and `visit` are *additive-only-when-nontrivial*, so an un-retried, once-visited step
report stays byte-identical. `durationMs` deliberately **does not** follow that convention: it is
present on every node of a completed run, and a step or context that never executed (skipped,
unsafe, guard-`if` false, routing-error marker, crash-isolated) reports `0`. A reporter that has to
branch on presence cannot emit a complete `<testsuite>`, which is the whole point of the field.

That guarantee is enforced in **one place**: the Phase 3 roll-up pass in `runSpecs` defaults any
node still missing the field (`??= 0`) as it walks the tree. Phase 3 is the only code that sees
every node from both execution paths — the flat concurrent pool and the routed sequencer — and both
kinds of node, measured and synthetic. Synthetic context reports are built at seven scattered sites
(`prepareContextSlot`'s spec-guard / test-guard / recording-name-conflict skips, the two
crash-isolation handlers, the routed `stopRest` skip, and the runaway-`goToTest` marker), so
stamping `0` at each construction site would be a standing invitation for the next one to forget —
and because the report is not runtime-validated (ADR 01060), a forgotten site would surface only as
`undefined` in a downstream reporter. One default in the pass that already traverses everything is
the durable form.

Two consequences worth noting: the `runContext` step loop's `pushStepReport` funnel needs no default
of its own, and the recording-teardown sweep (`stopAllRecordings`) — which pushes step reports
directly, bypassing that funnel — is given a **real clock** rather than being left to the `0`
default, because those steps genuinely execute.

### Consequences

* Good: a `junit` reporter can emit real times; slow-test triage works from the report; the HTML
  reporter's duration chip and per-step durations render real values for the first time.
* Good: `runContext` is untouched — the clock lives in `runContextWithRetries`, its sole caller,
  which covers all twelve of `runContext`'s exits (eleven early SKIPPED returns plus the normal
  one) with one measurement.
* Bad: `run.durationMs < sum(spec.durationMs)` under concurrency will surprise anyone who assumes
  a uniform roll-up. Mitigated by saying so in the schema descriptions, the docs, and here.
* Neutral: reports grow by one small integer field per node.
* Neutral: `Date.now()` (not `performance.now()`) matches the `warmPhase.ts` precedent and is
  wall-clock, so a suspended/throttled CI runner's stalls are counted — which is what a user
  waiting on CI actually experiences.

### Confirmation

* `src/common/test/validate.test.js` — `report_v3 durationMs`: positive case with the field on all
  five node levels, back-compat case without it, and negatives (negative value, fractional value)
  at each level. The negatives assert the failure comes from the `minimum`/`integer` constraint and
  **not** from `additionalProperties`, so they cannot pass against a schema that never declared the
  field.
* `test/core-core.test.js` — `durationMs on report nodes`: present, integer and non-negative on
  every node of a completed run; `test == sum(contexts)`, `spec == sum(tests)`,
  `context >= sum(steps)`; a step re-run by `onFail: retry` reports well under the accumulated
  backoff; a never-executed step reports `0`; a context skipped by a false test guard — one of the
  synthetic sites that never reaches a clock — still carries the field; a filtered-to-zero run does
  not throw.
* `test/concurrency.test.js` — the 1-runner vs 2-runner byte-identical-report assertion now asserts
  `durationMs` is present at every level, then strips it before comparing. It is measured time, so
  it can never match across runs, and the run-level value is *expected* to differ: that test
  observed ~3985 ms serial against ~1969 ms with two runners, while the spec-level sums held at
  ~2770 ms either way — a direct demonstration of both the concurrency caveat and the stability of
  the sum-based levels.
* `test/browser-fallback.test.js` — `runContextWithRetries`: the retries-disabled fast path is
  still stamped, and a retried context reports the final attempt rather than the sum.

Feature fixtures under `test/core-artifacts/` are **not** used here: a spec cannot read its own run
report, so this behavior is not expressible through the PASS/SKIPPED gate. Per `CLAUDE.md`, the
precise assertions live in `test/core-core.test.js` instead.

## Pros and Cons of the Options

### A. Wall clock where measurable, sums at test and spec (chosen)

* Good, run figure is honest elapsed time — usable for the HTML duration chip.
* Good, spec/test figures are total work — stable under any `concurrentRunners` value.
* Good, matches JUnit's conventional `<testsuite time>`.
* Bad, the roll-up invariant is not uniform across all five levels.

### B. Sum all the way up

* Good, uniform invariant: `parent == sum(children)` above the context.
* Bad, `run.durationMs` overstates elapsed time under concurrency, sometimes by several multiples.
* Bad, leaves the HTML duration chip with no honest source.

### C. Wall-clock span at every level

* Good, "duration" means one thing everywhere.
* Bad, a test's span includes idle gaps while unrelated specs ran, so slow-test triage is actively
  misleading — the failure mode that motivated the issue.
* Bad, requires threading min-start / max-end through the concurrent pool.

### D. Reuse the name `duration`

* Good, no new vocabulary.
* Bad, collides with authored action inputs through the `{ ...step, ...result }` spread; the field
  would mean two different things depending on the action.
