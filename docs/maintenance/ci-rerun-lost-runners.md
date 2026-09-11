# CI auto-rerun for lost runners

The [`Rerun Lost Runners`](../../.github/workflows/rerun-lost-runners.yml)
workflow re-runs a `Test` run once when its only failures are lost hosted
runners. An infrastructure hiccup then doesn't need a human to click "Re-run
failed jobs". For the design rationale, see
[ADR 01054](../../adrs/01054-auto-rerun-lost-runner-jobs.md).

## When it fires

On a completed `Test` run, it reruns exactly when **all** hold:

- the run concluded `failure` on its **first** attempt (`run_attempt == 1`);
- **no** job concluded `failure` or `timed_out` (a genuine red stays red);
- **at least one** job concluded `cancelled`.

With `fail-fast: false` on every matrix, that combination can only mean lost
infrastructure. It does **not** key on step counts, because a runner can be
reaped after running many steps.

## What a maintainer sees

- A second `run_attempt` appears on the Test run with **no human trigger**.
  This workflow created it. It's not a flaky pipeline or a compromised token.
- The `Rerun Lost Runners` run's **summary** names the clipped jobs.

## Operational notes

- **Exactly once.** The rerun bumps `run_attempt` to 2, and the `run_attempt
  == 1` guard blocks the re-triggered event. A run still red after one rerun
  is a real problem. Investigate, don't re-trigger blindly.
- **Repeated reruns on one OS pool are a signal, not noise.** If the step
  summary shows the same pool clipped week over week, the pool is degrading.
  Escalate rather than leaning on the auto-rerun. Pin the runner image, switch
  pool, or file with GitHub Support. The summary note exists precisely so this
  trend is visible.
- **Default-branch only.** `workflow_run` workflows run from the default
  branch, so changes to this file can't be validated from a PR. The first live
  exercise is after merge. Validate the shell and jq logic by replaying a known
  run's job list before merging changes. See the ADR's Confirmation section.
- **A genuine failure plus a lost runner in the same sweep** is left red on
  purpose, when `real > 0`. A human reruns after confirming the real failure
  was the infra event, not a code bug.
