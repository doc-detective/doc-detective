---
status: accepted
date: 2026-07-06
decision-makers: doc-detective maintainers
---

# Sweep on-disk managed-dep orphans into the runtime manifest before every JIT install

## Context and Problem Statement

[ADR 01025](01025-non-destructive-runtime-cache-installs.md) made runtime-cache installs additive:
`recordRuntimeDependencies` writes every managed package into the runtime `package.json`'s
`dependencies` before and after each `npm install`, so npm's reify no longer prunes siblings as
extraneous. Its candidate set was `installed.json`'s package list ∪ the manifest's current
`dependencies` — both written **only after a fully successful install batch**.

That leaves a gap: a batch that is **interrupted after npm extracted packages but before it exited
0** produces *orphans* — packages physically present in `node_modules` that neither recording
source knows about. The very next JIT install prunes them all, because to arborist they are
extraneous and to `recordRuntimeDependencies` they are invisible.

This is not hypothetical. In doc-detective/github-action's `test.yml` "Pass tests (windows-latest)"
jobs (runs [28828343936](https://github.com/doc-detective/github-action/actions/runs/28828343936)
and [28828962220](https://github.com/doc-detective/github-action/actions/runs/28828962220), both
on `doc-detective@4.23.0` — a release that already contains the ADR 01025 fix), the observed
sequence in job 85498414593 was:

1. `npx doc-detective@latest …` — npx installs the package; the postinstall pre-warm
   ([scripts/postinstall.js](../scripts/postinstall.js)) spawns `doc-detective install all`.
2. The bulk runtime batch exceeds `ensureRuntimeInstalled`'s **5-minute default npm timeout**
   ([src/runtime/installer.ts](../src/runtime/installer.ts) passes no `installTimeoutMs`) on the
   slow runner; the npm child is killed. The npx gap was 5 m 50 s — extraction time plus the
   5-minute kill. ~1064 packages (appium, drivers, webdriverio transitives, …) are on disk;
   `installed.json` and the manifest record none of them.
3. The run's JIT preflight installs the few missing packages:
   `npm[stdout]: added 9 packages, removed 1064 packages, and changed 55 packages in 1m`.
   The orphaned appium tree is pruned mid-flight.
4. `Starting Appium on port 64593` → `Appium server on port 64593 failed to start within 120
   seconds` → exit 1.

A manual rerun passed (the bulk finished under the timeout that time) — the classic
timing-dependent flake. The same mechanism can be triggered by an OOM-killed npm, a cancelled CI
job, a crash mid-batch, or a `Ctrl+C` during first-run install. This is the remaining
"non-destructive installs" work item on
[issue #501](https://github.com/doc-detective/doc-detective/issues/501).

## Decision Drivers

* **No install batch may prune a previously installed package** — including packages installed by
  a batch that never completed. Interruption must degrade to "repair on next install", never
  "destroy on next install".
* Preserve ADR 01025's no-resurrection rule: a package whose install genuinely failed (best-effort
  PTY backend on an exotic platform — not on disk) must never be wedged into future ideal trees.
* Hoisted transitives must still never be promoted to direct dependencies — the candidate set must
  stay doc-detective-managed.
* Negligible cost on the hot path (every JIT install runs this).

## Considered Options

1. **Extend `recordRuntimeDependencies`' candidate set with the shim's full managed-dep universe**
   (every name the shim declares as a runtime install source, plus peer companions), relying on
   the existing physical-presence filter to keep only what is actually on disk.
2. Record the requested specs in a `finally` block when an install batch fails, so a killed batch
   still records what it managed to extract.
3. Scan `node_modules` top-level directories and record everything found.
4. Raise/remove the 5-minute npm timeout for the bulk path so the postinstall batch stops being
   killed.

## Decision Outcome

Chosen option: **1 — sweep the managed-dep universe**. `managedDepNames()` (new export in
[src/runtime/heavyDeps.ts](../src/runtime/heavyDeps.ts)) returns the union of `HEAVY_NPM_DEPS`
and the keys of the shim manifest's `ddRuntimeDependencies` / `optionalDependencies` fields,
expanded with peer companions. The manifest fields matter: the app-surface drivers
(appium-novawindows-driver, appium-mac2-driver, appium-uiautomator2-driver) are JIT-installed by
the platform preflights but declared **only** there, not in `HEAVY_NPM_DEPS` (gap flagged by
Copilot in review). The manifest's regular `dependencies` field is deliberately excluded: its
names can collide with transitives hoisted into the cache, and sweeping them would promote a
hoisted transitive to a direct dependency. `recordRuntimeDependencies` adds these names to its
candidate set. The existing rules do the rest: only names with
`node_modules/<name>/package.json` on disk are recorded, ranges come from the shim's declared
constraint, and recording stays best-effort.

Every orphan a doc-detective install can create is by construction a shim-declared name (install
specs come from `getDeclaredVersion`), so the universe sweep covers exactly the gap. Because the
sweep runs **before** the npm spawn, the very first install after the interruption already keeps —
and, where the tree is incomplete, repairs — the orphans instead of pruning them.

Option 2 was rejected as strictly weaker: it cannot cover hard kills (SIGKILL, OOM, power loss)
where no `finally` runs, and option 1 subsumes it. Option 3 records packages doc-detective never
managed (hoisted transitives, stray user installs), violating the managed-set invariant. Option 4
treats the trigger, not the defect — any interruption (job cancel, crash, Ctrl+C) would still
destroy the cache; it also re-opens the hung-npm-freezes-first-run problem the timeout exists to
prevent. Timeout tuning for the bulk path remains available as an independent latency improvement.

### Consequences

* Good: an interrupted bulk install now degrades gracefully — the next run keeps the ~1000 already
  extracted packages, installs the missing few, and Appium starts. The CI flake mode above is
  eliminated at the root.
* Good: hard-kill scenarios (OOM, cancelled job) are covered with no extra bookkeeping at failure
  time.
* Neutral: up to ~25 extra `existsSync` probes per install (the universe is small).
* Neutral: a *partially extracted* orphan (killed mid-package, `package.json` present but files
  missing) is recorded and included in the next ideal tree; npm's reify validates and repairs it.

### Confirmation

* Red→green unit test in [test/runtime-loader.test.js](../test/runtime-loader.test.js):
  shim-declared orphans on disk with **no** `installed.json` entry and **no** manifest entry are
  recorded before the npm child spawns; declared-but-absent names (including the best-effort PTY
  backend) stay unrecorded.
* Existing ADR 01025 tests still pass unchanged (sequential-install preservation, pre-fix-cache
  seeding, no-resurrection).
* Field confirmation: the github-action `test.yml` Windows legs, where the failure reproduced ~2/3
  runs before the fix, once a release containing it reaches `@latest`.

## Pros and Cons of the Options

### Option 1 — sweep the managed-dep universe (chosen)

* Good: covers every interruption class, including hard kills, with one code path.
* Good: reuses the presence filter, so no-resurrection and managed-set invariants hold by
  construction.
* Bad: the universe is the *current* shim's declared set; a legacy orphan the current shim no
  longer declares is not swept (already covered by the `installed.json` candidate source in
  practice).

### Option 2 — record on failure in `finally`

* Good: records exactly what the failed batch touched.
* Bad: never runs on hard kills — the highest-value scenario; redundant once option 1 exists.

### Option 3 — record everything in `node_modules`

* Good: catches even unmanaged strays.
* Bad: promotes hoisted transitives to direct dependencies, permanently distorting future ideal
  trees and violating the managed-set invariant.

### Option 4 — raise/remove the bulk install timeout

* Good: fewer interrupted batches in the first place; worth doing independently for latency.
* Bad: does not make interruption safe; re-opens the hung-npm hang the timeout was added to stop.
