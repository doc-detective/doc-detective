---
status: accepted
date: 2026-10-14
decision-makers: doc-detective maintainers
---

# Detect the browser build that installed.json records

## Context and Problem Statement

`getAvailableApps` (`src/core/config.ts`) builds the list of usable browsers. It reads them from a
read-only `@puppeteer/browsers` scan of `<cacheDir>/browsers`. It took the **first** scanned build
of each browser. Several builds of one browser can coexist there. The installer prunes the previous build
only after the replacement validates. That prune is best-effort. A Windows file lock can make it
fail, and the failure is logged at `debug`. The orphaned build stays on disk.

The scan lists builds in directory order, so the older build sorts first and wins. On one Windows
machine the cache held `firefox/win64-nightly_154.0a1` (orphaned) and `win64-nightly_160.0a1`.
`installed.json` recorded `nightly_160.0a1`, and the `install status` diagnostic reported it. The
runner launched 154, which exits during session start (`Process unexpectedly closed with status 0`),
while 160 starts cleanly under the same geckodriver. The on-demand repair then reinstalled 160 and
retried, but detection still resolved 154, so every Firefox context fell back to Chrome. Three
Firefox-pinned tests in `test/core-core.test.js` failed on that machine and passed in CI, whose cache
is clean.

## Decision Drivers

* The runner must launch the build the installer validated and tracks, the same one the diagnostic
  reports.
* Repair has to be able to heal a broken build, not just reinstall one nobody launches.
* Keep it working when there is no record (a legacy snapshot dir, or a hand-populated cache).

## Considered Options

* **A. Prefer the build `installed.json` records, else the first scanned build** (chosen).
* **B. Pick the newest scanned build by version.**
* **C. Make the installer's prune reliable and keep first-match.**

## Decision Outcome

Chosen: **option A**. A pure helper, `selectInstalledBuild(scanned, name, recordedBuildId)`, returns
the scanned build whose `buildId` matches the record's `installedVersion`. With no record, or a
record naming a build that isn't on disk, it returns the first scanned build, as before. It applies
to `chrome`, `chromedriver`, and `firefox`.

### Consequences

* Good: the runner, the installer, the repair path, and `install status` agree on one build.
* Good: a cache with a single build behaves exactly as before.
* Neutral: orphaned builds still occupy disk. Pruning them is a separate concern.
* Bad/limit: `patchAppCache` still adds a repaired browser only when the cache holds no entry of
  that name. A repair that installs a *different* build than detection picked keeps the old entry
  for the rest of the run. With this decision detection already picks the recorded build, so that
  only bites when the channel moves during a run.

### Confirmation

`test/config-coverage.test.js` covers `selectInstalledBuild`. The recorded build wins over scan
order. An absent or unmatched record falls back to the first scanned build. An uninstalled browser
returns `undefined`. The three `core-core` tests that pin headless Firefox pass on the machine that
reproduced the bug.

## Pros and Cons of the Options

### A. Prefer the recorded build

* Good: uses the source of truth the installer already writes.
* Good: one small pure function, unit-testable without a browser.

### B. Newest scanned build

* Good: needs no record.
* Bad: nightly and stable build IDs need per-browser version parsing.
* Bad: a newer but partially extracted build would win over the validated one.

### C. Reliable prune

* Good: fixes the disk debris too.
* Bad: a Windows file lock can't always be beaten, and caches already holding duplicates stay
  broken.
