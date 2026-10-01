---
status: accepted
date: 2026-10-01
decision-makers: hawkeyexl
---

# Required test contexts report on every pull request

## Context and Problem Statement

PR #729 changed documentation only. Every check that ran was green, the review was
approved, `mergeable` was `MERGEABLE`, and the merge was still refused: *"the base
branch policy prohibits the merge."*

Two repository settings disagreed. The `main` ruleset requires five status checks
by name, four of which come from this workflow pair:

* `test / Test (ubuntu-latest, node 22, shard 1)`
* `test / Test (ubuntu-latest, node 22, shard 2)`
* `test / Coverage ratchet (src/common)`
* `test / Coverage ratchet (root, cross-platform)`

`npm-test.yaml` carried a `paths:` filter listing `src/**`, `test/**` and the
build inputs, and its own comment said docs-only PRs skip. A workflow that never
triggers reports nothing, and a required check that never reports is not pending,
not failing, and not satisfiable. The pull request is blocked permanently.

The combination had never fired because no earlier pull request was documentation
only. #728 looked like one but carried `src/core/tests/closeSurface.ts`, which
matched `src/**`. #713 touched workflows and tests.

So the question is not whether to test documentation. It is how a required check
reports an outcome when the work it gates is irrelevant to the change.

## Decision Drivers

* A documentation-only change must be mergeable without an administrator
  bypassing the repository's own rules.
* A code change must never become mergeable because the matrix did not run. The
  failure mode to avoid is under-running, not over-running.
* `release.yml` calls the same reusable workflow and must keep running everything.
* No ruleset edit. Changing which contexts are required is repository
  configuration, and a code change should not depend on an out-of-band settings
  change to be correct.
* The fixture fan-out must not start running on documentation PRs. Its selector
  fails safe to the FULL bundle matrix, Android and iOS included.

## Considered Options

* **A. Always trigger the workflow, and report the required contexts from
  placeholder jobs when there is nothing to exercise** (chosen).
* **B. Rely on a skipped job counting as a passing required check.**
* **C. Point the ruleset at one aggregate "gate" job instead of four contexts.**
* **D. Leave it, and merge documentation PRs with `--admin`.**
* **E. Drop the four contexts from the ruleset's required list.**

## Decision Outcome

Chosen: **option A**.

`npm-test.yaml` loses its `paths:` filter, so the workflow runs on every pull
request and the four contexts always appear. The filter becomes a `changes` job
that asks `scripts/select-test-matrix.cjs` whether the change set touches code,
and passes the answer to the reusable workflow as `run-matrix`.

In `test.yml`, the three real jobs gain `if: ${{ inputs.run-matrix }}`. Three
placeholder jobs carry `if: ${{ !inputs.run-matrix }}` and repeat the required
names exactly, so one set or the other reports, never both. Each placeholder
prints why it did no work.

The selector fails safe in one direction only. No pull request context, a `gh
api` failure, a hang, an empty list, or any value that is not literally `false`
all mean run the matrix. The shell coerces with `[ "$code" = "false" ] || code=true`.

`run-matrix` defaults to `true`, so `release.yml`, which passes no inputs, is
untouched.

The `fixtures` job is gated by the same output, but through a job-level `if:`,
because none of its contexts are required. That guard is load-bearing, not an
optimization. `scripts/select-fixture-bundles.cjs` returns the full bundle list
when nothing relevant matched. Without the guard, a documentation typo would fan
out every bundle.

### Consequences

* Good, because a documentation-only pull request is now mergeable on its own
  merits, with no administrator bypass.
* Good, because the gate's meaning is unchanged for code. The same five checks
  must pass, and the matrix still runs whenever the change set can affect it.
* Good, because the decision list is now unit-tested code rather than YAML that
  no test could reach.
* Neutral, because a documentation pull request now spins up five short runners,
  one `changes` job and four placeholders, instead of zero.
* Neutral, because `workflow_dispatch` remains the way to force a full run.
* Bad or limiting, because a check named `Test (ubuntu-latest, node 22, shard 1)`
  can now report success without running tests. The name is dictated by the
  ruleset, which matches on the exact string. Each placeholder's log says it
  exercised nothing, and the pair is mutually exclusive, so a code change can
  never be waved through by one.
* Bad or limiting, because the required names are duplicated in three places: the
  ruleset, the real jobs, and the placeholders. A rename breaks the gate silently.
  `test/npm-test-workflow.test.js` pins the four strings against both job sets to
  catch exactly that.

### Confirmation

`test/npm-test-workflow.test.js`, written red before green, covers both halves.

The selector has five cases. A docs-only list is `false`. Code paths are `true`:
`src/**`, `test/**`, `bin/**`, `scripts/**`, the build inputs, `.mocharc.yml`,
and the three workflow files. A list mixing documentation and code is `true`,
which is the old `paths:` behavior. An empty, blank, or non-array list is `true`,
which is the fail-safe.

The wiring is pinned too. `npm-test.yaml` carries neither `paths:` nor
`paths-ignore:`. The `changes` job uses the selector and exposes `code`, the
`test` job passes it as `run-matrix`, and the `fixtures` job is gated by it.
`run-matrix` is a boolean input defaulting to `true`. Each of the four required
strings is produced by at least two jobs, and the real and placeholder conditions
are exact negations.

The end-to-end confirmation is this pull request's own gate: it changes CI and
test files, so the matrix runs here. The docs-only path is confirmed by PR #729,
which must go from blocked to mergeable once this lands.

## Pros and Cons of the Options

### A. Placeholder jobs that report the required contexts

* Good, because it needs no repository settings change, so the fix is complete in
  the repository.
* Good, because the reported conclusion is a real `success` from a job that ran,
  not a conclusion whose meaning depends on how GitHub treats skips.
* Bad, because it duplicates four job names, which is why a test pins them.

### B. Rely on a skipped job counting as a pass

* Good, because it is the smallest possible diff: one `if:` per job.
* Bad, because it rests on how a required check treats the `skipped` conclusion,
  which is not a contract this repository controls.
* Bad, because a skipped CALLER job produces no nested check runs at all. The
  `if:` has to live on the leaf jobs instead, and the behavior differs between the
  two places it could go. That subtlety is what the current failure is made of.

### C. One aggregate gate job, required instead of the four

* Good, because it removes the duplicated names and is the cleanest end state.
* Good, because the aggregate can encode "succeeded or legitimately skipped" once.
* Bad, because it requires editing the ruleset, so the repository is broken until
  someone with admin rights makes a matching settings change. Worth doing later as
  a deliberate two-step, not as part of a fix for a blocked pull request.

### D. Merge documentation PRs with `--admin`

* Good, because it needs no change at all.
* Bad, because it makes every documentation change need an administrator. It also
  trains everyone to bypass the gate, which is the one habit a gate cannot survive.

### E. Drop the four contexts from the required list

* Good, because it is a one-line settings change.
* Bad, because it weakens the gate for every code pull request to serve a
  documentation edge case. The matrix and the coverage ratchets are the signals
  worth requiring.
