---
status: accepted
date: 2023-10-11
decision-makers: doc-detective maintainers
---

# Test-level setup/cleanup and detectSteps

## Context and Problem Statement

Many documented procedures share a common precondition (log in, seed data) and postcondition (tear
down) that authors had to repeat in every test. There was also no per-test switch to turn off the
automatic detection of steps from surrounding markup. We needed a way for a test to name a spec to
run before and after it (with that spec's steps prepended/appended into the test) and a boolean to
control whether markup-detected steps are included. What is the contract for `setup`/`cleanup` and
`detectSteps` at the test level?

## Decision Drivers

* Shared preconditions/postconditions should be reusable, not copy-pasted per test.
* Setup/cleanup steps must participate in the same validation and verdict as the test.
* Authors need to opt out of markup auto-detection on a per-test basis.
* Backward compatibility: tests without these fields behave exactly as before.

## Considered Options

* **A. String `setup`/`cleanup` referencing a spec whose steps are prepended/appended (then re-validated), plus a `detectSteps` boolean defaulting true** (chosen).
* **B. Inline arrays of setup/cleanup steps embedded directly in the test.**
* **C. Global-only setup/cleanup hooks (no per-test scope).**

## Decision Outcome

Chosen option: **A**, because referencing a spec keeps shared fixtures DRY while the
prepend/append-then-revalidate model means setup/cleanup steps are first-class steps of the test.
`setup` and `cleanup` are string fields naming a spec to run before/after the test; that spec's steps
are prepended (setup) or appended (cleanup) to the test's step list and the assembled test is
re-validated. `detectSteps` is a boolean (default `true`) controlling whether markup-detected steps
are included for the test.

### Consequences

* Good: reusable preconditions/postconditions via a single referenced spec.
* Good: setup/cleanup steps validate and report as part of the test.
* Neutral: `detectSteps` default `true` is later flipped to `false` (opt-in detection) once markup
  auto-detection matured.
* Neutral: this string-reference setup/cleanup is later superseded by the richer
  beforeAny/afterAll + before/after ordering model.

### Confirmation

Shipped in common `537855c`, `a40e5ee` (schema `setup`/`cleanup`/`detectSteps`) and core `6e330c03`,
`2b327d8f` (prepend/append + re-validate). Exercised by fixtures pairing a setup/cleanup spec with a
main test and by `detectSteps` on/off cases.

## Pros and Cons of the Options

### A. Spec-referencing string setup/cleanup + `detectSteps` boolean
* Good: DRY; steps are first-class; simple boolean opt-out.
* Bad: requires a separate spec file to hold shared steps.

### B. Inline step arrays
* Good: self-contained.
* Bad: copy-paste across tests; no reuse.

### C. Global hooks only
* Good: one place.
* Bad: can't scope to a single test.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-common commits `537855c`, `a40e5ee`;
doc-detective-core commits `6e330c03`, `2b327d8f`. Inventory ref: BACKFILL-INVENTORY.md Seq 93.
Related: `00028` (config-level setup/cleanup hooks), `00076` (detectSteps default true→false),
`00088` (test-level detectSteps precedence), `01000` (beforeAny/afterAll/before/after ordering).
