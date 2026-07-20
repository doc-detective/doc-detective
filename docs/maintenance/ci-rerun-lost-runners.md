# CI auto-rerun for lost runners

The [`Rerun Lost Runners`](../../.github/workflows/rerun-lost-runners.yml)
workflow re-runs a `Test` run once when its only failures are lost hosted
runners, so an infrastructure hiccup doesn't need a human to click "Re-run
failed jobs". Design rationale: [ADR 01054](../../adrs/01054-auto-rerun-lost-runner-jobs.md).

## When it fires

On a completed `Test` run, it reruns exactly when **all** hold:

- the run concluded `failure` on its **first** attempt (`run_attempt == 1`);
- **no** job concluded `failure` or `timed_out` (a genuine red stays red);
- **at least one** job concluded `cancelled`.

With `fail-fast: false` on every matrix, that combination can only mean lost
infrastructure. It does **not** key on step counts — a runner can be reaped
after running many steps.

## What a maintainer sees

- A second `run_attempt` appears on the Test run with **no human trigger** —
  this workflow created it. Not a flaky pipeline, not a compromised token.
- The `Rerun Lost Runners` run's **summary** names the clipped jobs.

## Operational notes

- **Exactly once.** The rerun bumps `run_attempt` to 2; the re-triggered event
  is blocked by the `run_attempt == 1` guard. A run still red after one rerun
  is a real problem — investigate, don't re-trigger blindly.
- **Repeated reruns on one OS pool are a signal, not noise.** If the step
  summary shows the same pool clipped week over week, the pool is degrading —
  escalate (pin the runner image, switch pool, file with GitHub Support)
  rather than leaning on the auto-rerun. The summary note exists precisely so
  this trend is visible.
- **Default-branch only.** `workflow_run` workflows execute from the default
  branch, so changes to this file can't be validated from a PR; the first live
  exercise is after merge. Validate the shell/jq logic by replaying a known
  run's job list (see the ADR's Confirmation section) before merging changes.
- **Genuine failure + lost runner in the same sweep** is left red on purpose
  (`real > 0`): a human reruns after confirming the real failure was the infra
  event, not a code bug.
