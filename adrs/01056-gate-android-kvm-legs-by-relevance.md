---
status: accepted
date: 2026-07-13
decision-makers: doc-detective maintainers
---

# Skip the android KVM legs on PRs that cannot affect android behavior

## Context and Problem Statement

Three dedicated ubuntu jobs prove the android bootstrap paths on every PR: the emulator-runner
**reuse** leg (~8 min), the **managed-boot** leg (~15 min, `install android` + two boot cycles +
the A6 two-device spec), and the **action-lazy** leg (~7 min, cold SDK bootstrap through the
GitHub Action). That is ~30 runner-minutes per PR — on scarce Linux-KVM runners — verifying flows
that a documentation-fixture or mocha-test-only change cannot alter. ADR 01055's `select` job
already analyzes the change set to build the fixture matrix; the same analysis can gate these legs
under the same silent-skip-proof discipline.

## Decision Drivers

* ~30 runner-minutes per PR is the largest remaining always-on cost after ADR 01048/01055.
* The legs exist to catch regressions in android-adjacent product code — which most PRs don't touch.
* Same non-negotiable as ADR 01055: skipping must fail safe (run the legs) on any uncertainty.
* The release gate must always run all three legs.

## Considered Options

* **A — Safe-list relevance predicate** (chosen): the legs run UNLESS every changed file is
  provably android-inert.
* **B — Trigger-list predicate**: run the legs only when a curated list of android-ish paths
  changes. Inverts the failure direction — a missing entry silently skips the gate. Rejected.
* **C — Status quo**: all three legs on every PR.

## Decision Outcome

Chosen option: **A**.

* `androidLegsRelevant(changedFiles)` in
  [`scripts/select-fixture-bundles.cjs`](../scripts/select-fixture-bundles.cjs) returns `false`
  (skip the legs) only when **every** changed file is android-safe:
  * a fixture spec in a **non-android** bundle group directory,
  * a mocha-suite-only file (`test/<name>.test.js` — never loaded by fixture jobs), or
  * prose (`docs/`, `adrs/`, any `*.md`).
  Everything else is relevant — product code, `scripts/`, workflows, package manifests, shared
  fixture infra (`env`, `config.groups.json`), and **the test servers** (`test/server/**`), which
  the mobile-web legs reach from inside the emulator via 10.0.2.2. Empty change sets are relevant.
* Reusing ADR 01055's self-contained `select` job: it emits an `androidLegs` output (computed by
  the same `--android-legs` run of the script over the PR's changed files), and each of the three
  KVM jobs carries `needs: select` + `if: needs.select.outputs.androidLegs != 'false'`. Job-level
  `if:` **can** read the `needs` context (unlike `matrix`), so this gates cleanly. No input
  plumbing through the callers — the same reason the matrix moved into the reusable workflow
  ([ADR 01055](01055-path-filtered-fixture-bundles.md)).
* Fail-safe by construction: the `select` job coerces anything other than an explicit `false` to
  `true`, and a non-PR trigger (the release gate's push) never narrows — so the legs always run
  there and on any error.
* The general-matrix `android-skip` bundle is NOT gated by this: it asserts the SKIP paths on
  non-KVM hosts and is governed by the ADR 01055 matrix selector like any other bundle.
* Unit tests (`test/select-fixture-bundles.test.js`) pin the predicate — including the test-server
  and shared-infra relevance cases — and assert all three KVM jobs carry the gate.

### Consequences

* Good: fixture-authoring and mocha-test-only PRs shed ~30 runner-minutes and one of the two
  slowest remaining jobs (managed-boot).
* Good: failure direction is safe — any unrecognized file keeps the legs on; the safe-list is
  small, explicit, and unit-pinned.
* Neutral: product-code PRs (the majority) still run all three legs. Deliberate — those changes can
  plausibly reach runtime/installer/driver behavior the legs guard.
* Cost/watch: `test/<name>.test.js` files are classified android-inert on the premise that fixture
  jobs never execute mocha files. If a future fixture leg starts consuming files from `test/`
  outside `core-artifacts/` and `server/`, revisit the predicate.

### Confirmation

* A PR touching only `test/core-artifacts/http/**` shows all three KVM legs as skipped; a PR
  touching any `src/**` file shows them running.
* A push to a release branch runs all three legs (the `select` job's push path never narrows).
* `npx mocha test/select-fixture-bundles.test.js` covers the relevant/inert classifications and
  asserts each KVM job gates on `needs.select.outputs.androidLegs`.

## Pros and Cons of the Options

### A — Safe-list relevance predicate (CHOSEN)

* Good: fail-safe direction; tiny reviewable safe-list; reuses ADR 01055's `select` job end-to-end.
* Bad: conservative — src-touching PRs get no savings (accepted).

### B — Trigger-list of android-ish paths

* Good: bigger savings on src PRs that don't match the list.
* Bad: a stale list silently un-guards exactly the code being changed; the failure mode ADR 01055
  exists to avoid. Rejected.

### C — Status quo

* Good: zero risk.
* Bad: ~30 runner-minutes per PR spent proving flows most PRs cannot break.
