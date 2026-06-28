---
status: accepted
date: 2024-02-08
decision-makers: doc-detective maintainers
---

# Spread full stepResult into reports and stop runShell failing on stderr

## Context and Problem Statement

The step-report builder copied only a fixed pair of fields (status and description) from each action
handler's result, so any extra fields a handler produced were silently dropped before reaching the
report. Separately, `runShell` failed a step whenever the spawned command wrote anything to stderr —
but many well-behaved tools (and progress meters) write to stderr on success, so legitimate commands
were reported FAIL. How should handler results flow into the report, and what actually constitutes a
`runShell` failure?

## Decision Drivers

* Action handlers should be able to surface arbitrary result fields without report plumbing changes.
* The context-level verdict must read the step's real result status, not a stale copy.
* `runShell` success/failure must be decided by exit code, not by the presence of stderr output.

## Considered Options

* **A. Spread the full `stepResult` into the report and decide `runShell` verdict on exit code only**
  (chosen).
* **B. Keep the fixed field copy and add fields to the allow-list one by one.**
* **C. Treat stderr as failure but add a per-step opt-out flag.**

## Decision Outcome

Chosen option: **A** (`core`, commits `039c0353`, `300a592`):

1. **Full spread**: the step report spreads the entire `stepResult` — `status` maps to `result` and
   `description` to `resultDescription` — so any extra fields a handler emits flow through.
2. **Verdict source**: context-level failure detection reads `step.result === "FAIL"` (the spread
   field), not the old fixed copy.
3. **runShell**: stderr output no longer fails the step; only a non-success exit code does.

## Pros and Cons of the Options

### A. Spread + exit-code verdict (chosen)
* Good: handlers extend results freely; correct runShell verdicts; verdict reads the real status.
* Bad: report objects now carry whatever a handler emits (must be kept tidy).

### B. Fixed copy + allow-list growth
* Good: explicit about what reaches reports.
* Bad: every new handler field needs a plumbing change; the original churn cause.

### C. stderr-fails with opt-out
* Good: preserves the strict default.
* Bad: forces an opt-out on every command that logs to stderr — noisy and surprising.

### Consequences

* Good: richer, accurate step reports; commands that log to stderr now pass correctly.
* Good: a single source of truth for the step verdict.
* Bad: nothing structural prevents a handler from leaking an internal field into the report.
* Neutral: this report shape is later restructured under the v3 unified `outputs` object.

### Confirmation

Step-result spread and context-fail read in `doc-detective-core` `039c0353`; runShell stderr
behavior in `300a592`.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `039c0353`, `300a592`.
Inventory ref: BACKFILL-INVENTORY.md Seq 107. Related: `00019` (runShell action), `00045` (runStep
dispatch + verdict rollup), `00105` (unified outputs object).
