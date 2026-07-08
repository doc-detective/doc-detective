---
status: accepted
date: 2026-07-08
decision-makers: doc-detective maintainers
---

# Diagnostic fixture-artifact upload is non-fatal

## Context and Problem Statement

Every `fixtures.yml` job ends with an `actions/upload-artifact` step that preserves the run's
`dd-output-<group>.json` for debugging (`if: always()`, `retention-days: 3`). This upload runs
**after** the real pass/fail gate (`Gate on results` → `scripts/check-fixture-results.cjs`), so its
only purpose is diagnostics.

GitHub's ArtifactService is occasionally unavailable. When it is, the upload exhausts the
action's internal retries and the step fails:

```
Attempt 1 of 5 failed with error: Request timeout: /twirp/github.actions.results.api.v1.ArtifactService/CreateArtifact …
##[error]Failed to CreateArtifact: Failed to make request after 5 attempts: Request timeout …
```

Because the step was fatal, this failed the **whole fixture job even though the fixture run itself
passed** (`All 11 spec(s) passed or skipped`). Observed on a `main` dispatch: `interactions
(macos-latest)` went red purely on this upload timeout while every spec passed. A run's green/red
signal should reflect the product, not a transient GitHub storage outage — this both produces false
failures and, under a strict "all-green" release/merge gate, resets convergence for reasons entirely
outside the code under test.

## Decision Drivers

* A job's conclusion must reflect the **test result**, not GitHub-infrastructure availability.
* The real gate already ran and failed the job first on any genuine fixture FAIL — the upload is
  strictly diagnostic and sequenced after it.
* Must not weaken failure detection: a real fixture FAIL must still fail the job.
* Minimal, uniform change across all fixture legs.

## Considered Options

* **A. `continue-on-error: true` on every diagnostic upload step** (chosen).
* **B. Add a bespoke retry/backoff wrapper around the upload.** The action already retries 5×
  internally; wrapping it duplicates that and still fails when the outage outlasts the wrapper.
* **C. Leave it fatal; re-run the job when it happens.** Pushes transient-infra toil onto every
  consumer and, under strict all-green gating, keeps resetting convergence on non-code failures.

## Decision Outcome

Chosen option: **A**. Add `continue-on-error: true` to the four `actions/upload-artifact` steps in
`fixtures.yml` (the general matrix job + the three Android KVM legs). Each already runs `if: always()`
and *after* its gate, so making it non-fatal cannot mask a real failure — it only prevents a GitHub
ArtifactService outage from turning a passing run red. B adds complexity for no gain over the action's
own retries; C keeps the false-failure toil.

Trade-off accepted: when the ArtifactService is down, that job's diagnostic JSON is simply absent for
those 3 days. That artifact only matters when a fixture FAILs — and a real FAIL fails the gate step
regardless — so losing it on a passing run costs nothing, and on a failing run the gate log still
carries the failure detail.

## Consequences

* **Good** — a transient `CreateArtifact` timeout no longer produces a false job failure; the job's
  status reflects the fixture result. Removes a whole class of environmental false-reds from the Test
  workflow (relevant to strict all-green gating).
* **Neutral** — on an ArtifactService outage the diagnostic JSON for that job is not uploaded; the
  gate step's log still shows pass/fail and, for failures, the per-spec detail.
* **Good / preserved** — real fixture FAILs and zero-spec/mis-pointed runs still fail the job via the
  gate step, which runs before the upload. Failure detection is unchanged.

## Confirmation

* Inspect `fixtures.yml`: every `actions/upload-artifact` step carries `continue-on-error: true` and
  is sequenced after its `check-fixture-results.cjs` gate.
* The Test workflow still fails on a genuine fixture FAIL (the gate step), verified by the existing
  fixture suite going red on any FAILed spec.

## Pros and Cons of the Options

### A. `continue-on-error: true` on every diagnostic upload

* Good: one-line, uniform; job status reflects the test, not GitHub storage availability.
* Good: cannot mask real failures — the gate runs first; the upload is diagnostic-only.
* Neutral: diagnostic JSON missing for a passing run during an ArtifactService outage (no value lost).

### B. Bespoke retry/backoff wrapper around the upload

* Good: keeps trying to preserve the artifact.
* Bad: duplicates the action's built-in 5× retry; still fails when the outage outlasts the wrapper;
  more workflow complexity for a diagnostic side-effect.

### C. Leave fatal; re-run the job

* Good: zero change.
* Bad: recurring false-red toil; under strict all-green gating it resets convergence on failures that
  have nothing to do with the code under test.
