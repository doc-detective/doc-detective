---
status: accepted
date: 2026-07-13
decision-makers: doc-detective maintainers
---

# Auto-rerun Test runs whose only failures are lost hosted runners

## Context and Problem Statement

GitHub's hosted runner pools occasionally drop a VM mid-run: the runner is
assigned but never reports (or a healthy sibling is reaped in the same sweep),
the affected jobs conclude `cancelled`, and the whole `Test` run concludes
`failure`. There is nothing to fix in the code — the only remedy is a human
clicking "Re-run failed jobs". This was observed on the macOS pool (PR #616,
run 29219105593: two jobs clipped in one sweep, one having executed 18 steps,
the other zero) and cost a manual rerun mid-merge-train. As the PR gate's job
count grows (sharded mocha + bundled fixtures), the exposure to at least one
pool hiccup per run rises.

## Decision Drivers

* Remove the manual-rerun toil for infrastructure losses.
* Never mask a genuine test failure — a real red must stay red.
* Bounded: rerun at most once, no loops, no runaway runner spend.
* Don't hide a *systemic* pool problem behind silent reruns.

## Considered Options

* **A — Signature-gated auto-rerun via `workflow_run`** (chosen): detect the
  infra-loss signature from the completed run and call `rerun-failed-jobs` once.
* **B — Status quo**: humans click rerun. Reliable but toilsome, and stalls
  merge trains until someone notices.
* **C — Larger / self-hosted runners**: fewer losses, but real cost and
  operational burden, and hosted losses still happen. Orthogonal.
* **D — Blanket "retry any failed run once"**: trivial, but masks real
  failures and doubles CI cost on every genuine red. Rejected.

## Decision Outcome

Chosen option: **A**. [.github/workflows/rerun-lost-runners.yml](../.github/workflows/rerun-lost-runners.yml)
triggers on `workflow_run` completion of `Test` and reruns exactly when the
infra-loss signature holds. The signature is derived from GitHub's
run-conclusion semantics rather than a fragile heuristic:

* **Job `if:` `conclusion == 'failure' && run_attempt == 1`.** A user
  run-cancel or a concurrency `cancel-in-progress` supersede concludes the run
  `cancelled`, not `failure`, so those never enter. `run_attempt == 1` makes
  the rerun fire at most once: `rerun-failed-jobs` bumps the attempt to 2, and
  the re-triggered event carries `run_attempt == 2`, which the guard blocks.
* **`real == 0`** (no `failure`/`timed_out` job): a genuine failure or timeout
  leaves such a job, so this guard keeps real reds red.
* **`cancelled > 0`.** With `fail-fast: false` on every matrix (test.yml,
  fixtures.yml), a real failure never cancels siblings — so a run that
  concluded `failure` with zero failed/timed-out jobs and ≥1 cancelled job can
  *only* be lost infrastructure. **No per-step heuristic is used**: the first
  draft required a cancelled job with zero executed steps, but run 29219105593
  shows a lost runner can be reaped after many steps (18), so that condition
  produced false negatives. The run-level guards above are sufficient and
  strictly more correct.

`rerun-failed-jobs` re-runs `cancelled` jobs (verified: attempt 2 of the run
above re-ran both and passed). On a rerun the workflow writes a
`$GITHUB_STEP_SUMMARY` note naming the clipped jobs, so repeated reruns on one
pool surface as a visible pattern rather than being silently absorbed.

### Consequences

* Good: infra losses self-heal once, no human in the loop; genuine failures
  are untouched (`real == 0` guard).
* Good: bounded and loop-free (`run_attempt` guard); pagination-safe job
  enumeration (`--paginate --jq '.jobs[]' | jq -s`).
* Cost/watch: a rerun costs a second execution of the clipped jobs. If a pool
  degrades systematically, the workflow reruns each occurrence — the step
  summary is the signal to escalate (pin the image, switch pool, file with
  GitHub) instead of leaning on the rerun. Recorded in
  docs/maintenance/ci-rerun-lost-runners.md.
* Limitation: `workflow_run` runs only from the default branch, so the logic
  cannot be exercised from its own PR; first live activation is post-merge.

### Confirmation

* Replaying run 29219105593's attempt-1 job set through the signature yields
  `real == 0, cancelled == 2` → rerun (matches the manual rerun that fixed it).
* The 17-genuine-failure run (29212878097) yields `real > 0` → no rerun.
* A concurrency-superseded run concludes `cancelled` → job `if:` never fires.

## Pros and Cons of the Options

### A — Signature-gated auto-rerun (CHOSEN)

* Good: heals the exact infra case, provably excludes genuine failures and
  user/concurrency cancels, bounded to one attempt.
* Bad: relies on GitHub run-conclusion semantics (documented + verified here);
  can't self-test pre-merge.

### B — Manual rerun (status quo)

* Good: zero machinery, full human judgment.
* Bad: toil; stalls merges until noticed.

### D — Blanket retry-once

* Good: trivial.
* Bad: masks real failures and doubles CI cost on every genuine red.
