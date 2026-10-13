---
status: accepted
date: 2026-10-12
decision-makers: doc-detective maintainers
---

# Cache the WebDriverAgent products separately in the iOS fixture legs

## Context and Problem Statement

The iOS fixture legs prebuild WebDriverAgent (WDA) with `install ios` into the Doc Detective cache.
The products are keyed by Xcode version and `appium-xcuitest-driver` version. The whole cache
directory rides one `dd-cache` entry, keyed by OS, ISO week, Node line, and lockfile hash. The
Sunday cache warmer saves that entry. `actions/cache` never saves over a key that hit.

Since ADR 01111, the runtime installs the newest driver its range allows. When a driver release
lands mid-week, or a runner image moves to a new Xcode, the weekly entry holds products for the old
key. Every iOS leg then rebuilds WDA, and the rebuild is never saved. The prebuild step took
1.4–6.2 min in the legs measured for the iOS startup hillclimb, against seconds on a matching key.

The same legs' "Wait for pre-booted simulator" step ran `timeout 300 …`. macOS runners have no
GNU `timeout`, so the step failed in under a second and never waited.

## Decision Drivers

* iOS leg time, without weakening what the legs test.
* Rebuild WDA only when the product key actually changes.
* Keep the `dd-cache` entry and its weekly rotation as they are.

## Considered Options

* **A. A separate WDA products cache that saves when the product set changes** (chosen).
* **B. Add the driver version to the `dd-cache` key.** The version is only known after the
  runtime install, which happens after the restore.
* **C. Rely on the Sunday warmer.** Leaves every mid-week driver or Xcode change rebuilding all
  week.

## Decision Outcome

Chosen option: **A**. On the iOS legs (`prebootIos`), `fixtures.yml` now:

1. Reads the Xcode version (`xcodebuild -version`).
2. Restores `~/.dd-cache/ios/wda` from the newest `wda-<os>-<xcode>-` entry.
3. Runs `install ios`, which reuses matching products or builds new ones and prunes stale keys.
4. Keys the result by a hash of the product directory names left. Those names are the Xcode and
   driver keys.
5. Saves under that key only when it differs from the entry restored.

The wait step now bounds `simctl bootstatus` with `perl -e 'alarm…; exec'`. Perl ships on macOS
runners, and the alarm survives `exec`. `fixtures-debug.yml` carries the same steps, per its drift
test.

### Consequences

* Good: a driver or Xcode change costs one WDA build per cache scope, not one per leg per job.
* Neutral: caches saved from a pull request are visible only to that pull request's runs. The
  release gate on `main` saves to the scope every pull request can read.
* Neutral: the simulator wait now actually waits. That moves boot time into its own step, which is
  what the step was for.

### Confirmation

* Workflow tests assert the restore, prebuild, and save order, the save condition, and that the
  wait step doesn't use `timeout`.
* Same-batch A/B `fixtures-debug.yml` runs against the previous commit. After the first build
  saves, candidate legs show the prebuild in seconds and a shorter job, with every context's
  PASS/SKIP result unchanged.

## Pros and Cons of the Options

### A. Separate products cache

* Good: saves exactly when the products change.
* Bad: two caches over one directory, ordered by the restore step.

### B. Driver version in the dd-cache key

* Good: one cache.
* Bad: the key would need the version before the install that determines it.

### C. Weekly warmer only

* Good: no change.
* Bad: keeps the mid-week rebuilds.
