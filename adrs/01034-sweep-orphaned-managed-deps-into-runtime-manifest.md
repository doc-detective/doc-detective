---
status: accepted
date: 2026-07-06
decision-makers: doc-detective maintainers
---

# Sweep on-disk managed-dep orphans into the runtime manifest before every JIT install

## Context and Problem Statement

[ADR 01025](01025-non-destructive-runtime-cache-installs.md) made runtime-cache installs additive.
`recordRuntimeDependencies` writes every managed package into the runtime `package.json`'s
`dependencies` before and after each `npm install`, so npm's reify no longer prunes siblings as
extraneous. Its candidate set was `installed.json`'s package list ∪ the manifest's current
`dependencies`. Both are written **only after a fully successful install batch**.

That leaves a gap. A batch **interrupted after npm extracted packages, but before it exited 0**,
produces *orphans*. Those are packages physically present in `node_modules` that neither recording
source knows about. The very next JIT install prunes them all, because to arborist they are
extraneous and to `recordRuntimeDependencies` they are invisible.

This is not hypothetical. It showed up in doc-detective/github-action's `test.yml`
"Pass tests (windows-latest)" jobs. See runs
[28828343936](https://github.com/doc-detective/github-action/actions/runs/28828343936) and
[28828962220](https://github.com/doc-detective/github-action/actions/runs/28828962220), both on
`doc-detective@4.23.0`, a release that already contains the ADR 01025 fix. The observed
sequence in job 85498414593 was:

1. `npx doc-detective@latest …` runs. npx installs the package, and the postinstall pre-warm
   ([scripts/postinstall.js](../scripts/postinstall.js)) spawns `doc-detective install all`.
2. The bulk runtime batch exceeds `ensureRuntimeInstalled`'s **5-minute default npm timeout** on the
   slow runner, since [src/runtime/installer.ts](../src/runtime/installer.ts) passes no
   `installTimeoutMs`. The npm child is killed. The npx gap was 5 m 50 s, extraction time plus the
   5-minute kill. About 1064 packages are on disk, including appium, drivers, and webdriverio
   transitives. `installed.json` and the manifest record none of them.
3. The run's JIT preflight installs the few missing packages:
   `npm[stdout]: added 9 packages, removed 1064 packages, and changed 55 packages in 1m`.
   The orphaned appium tree is pruned mid-flight.
4. `Starting Appium on port 64593` → `Appium server on port 64593 failed to start within 120
   seconds` → exit 1.

A manual rerun passed, because the bulk finished under the timeout that time. It's the classic
timing-dependent flake. The same mechanism can be triggered by an OOM-killed npm, a cancelled CI
job, a crash mid-batch, or a `Ctrl+C` during first-run install. This is the remaining
"non-destructive installs" work item on
[issue #501](https://github.com/doc-detective/doc-detective/issues/501).

## Decision Drivers

* **No install batch may prune a previously installed package**, including packages installed by
  a batch that never completed. Interruption must degrade to "repair on next install", never
  "destroy on next install".
* Preserve ADR 01025's no-resurrection rule. A package whose install genuinely failed must never be
  wedged into future ideal trees. Say the best-effort PTY backend on an exotic platform, not on disk.
* Hoisted transitives must still never be promoted to direct dependencies. The candidate set must
  stay doc-detective-managed.
* Negligible cost on the hot path (every JIT install runs this).

## Considered Options

1. **Extend `recordRuntimeDependencies`' candidate set with the shim's full managed-dep universe.**
   That's every name the shim declares as a runtime install source, plus peer companions. It relies
   on the existing physical-presence filter to keep only what is actually on disk.
2. Record the requested specs in a `finally` block when an install batch fails, so a killed batch
   still records what it managed to extract.
3. Scan `node_modules` top-level directories and record everything found.
4. Raise/remove the 5-minute npm timeout for the bulk path so the postinstall batch stops being
   killed.

## Decision Outcome

Chosen option: **1, sweep the managed-dep universe**. `managedDepNames()` is a new export in
[src/runtime/heavyDeps.ts](../src/runtime/heavyDeps.ts). It returns the union of `HEAVY_NPM_DEPS`
and the keys of the shim manifest's `ddRuntimeDependencies` and `optionalDependencies` fields,
expanded with peer companions. The manifest fields matter. The app-surface drivers are JIT-installed
by the platform preflights, but declared **only** there, not in `HEAVY_NPM_DEPS`. Those are
appium-novawindows-driver, appium-mac2-driver, and appium-uiautomator2-driver, and Copilot flagged
the gap in review. The manifest's regular `dependencies` field is deliberately excluded. Its
names can collide with transitives hoisted into the cache, and sweeping them would promote a
hoisted transitive to a direct dependency. `recordRuntimeDependencies` adds these names to its
candidate set. The existing rules do the rest. Only names with
`node_modules/<name>/package.json` on disk are recorded, ranges come from the shim's declared
constraint, and recording stays best-effort.

Every orphan a doc-detective install can create is by construction a shim-declared name, since
install specs come from `getDeclaredVersion`. So the universe sweep covers exactly the gap. The
sweep runs **before** the npm spawn. So the very first install after the interruption already keeps
the orphans instead of pruning them, and repairs them where the tree is incomplete.

Option 2 was rejected as strictly weaker. It cannot cover hard kills, such as SIGKILL, OOM, or power
loss, where no `finally` runs, and option 1 subsumes it. Option 3 records packages doc-detective
never managed, like hoisted transitives and stray user installs, violating the managed-set
invariant. Option 4 treats the trigger, rather than the defect. Any interruption would still destroy
the cache, whether a job cancel, a crash, or Ctrl+C. It also re-opens the hung-npm-freezes-first-run
problem the timeout exists to prevent. Timeout tuning for the bulk path remains available as an
independent latency improvement.

### Consequences

* Good: an interrupted bulk install now degrades gracefully. The next run keeps the ~1000 already
  extracted packages, installs the missing few, and Appium starts. The CI flake mode above is
  eliminated at the root.
* Good: hard-kill scenarios, such as OOM or a cancelled job, are covered with no extra bookkeeping
  at failure time.
* Neutral: up to ~25 extra `existsSync` probes per install, since the universe is small.
* Neutral: a *partially extracted* orphan is recorded and included in the next ideal tree, and npm's
  reify validates and repairs it. That's one killed mid-package, with `package.json` present but
  files missing.

### Confirmation

* A red→green unit test in [test/runtime-loader.test.js](../test/runtime-loader.test.js) covers the
  sweep. Shim-declared orphans on disk with **no** `installed.json` entry and **no** manifest entry
  are recorded before the npm child spawns. Declared-but-absent names stay unrecorded, including the
  best-effort PTY backend.
* Existing ADR 01025 tests still pass unchanged. Those cover sequential-install preservation,
  pre-fix-cache seeding, and no-resurrection.
* Field confirmation comes from the github-action `test.yml` Windows legs, where the failure
  reproduced in roughly 2 of 3 runs before the fix. That lands once a release containing it reaches
  `@latest`.

## Pros and Cons of the Options

### Option 1: sweep the managed-dep universe (chosen)

* Good: covers every interruption class, including hard kills, with one code path.
* Good: reuses the presence filter, so no-resurrection and managed-set invariants hold by
  construction.
* Bad: the universe is the *current* shim's declared set. A legacy orphan the current shim no
  longer declares is not swept. In practice the `installed.json` candidate source already covers
  that.

### Option 2: record on failure in `finally`

* Good: records exactly what the failed batch touched.
* Bad: it never runs on hard kills, the highest-value scenario. It's redundant once option 1 exists.

### Option 3: record everything in `node_modules`

* Good: catches even unmanaged strays.
* Bad: promotes hoisted transitives to direct dependencies, permanently distorting future ideal
  trees and violating the managed-set invariant.

### Option 4: raise or remove the bulk install timeout

* Good: fewer interrupted batches in the first place; worth doing independently for latency.
* Bad: does not make interruption safe; re-opens the hung-npm hang the timeout was added to stop.
