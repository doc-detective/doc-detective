---
status: accepted
date: 2026-10-14
decision-makers: doc-detective maintainers
---

# Detect browsers only for runs that use them

## Context and Problem Statement

Every non-dry run called `getAvailableApps` twice: once in `setConfig` to fill
`config.environment.apps`, and once at the top of `runSpecs` for the runner's own list. The first
call probes. It loads `@puppeteer/browsers`, scans the browser cache, and spawns
`chromedriver --version` and `geckodriver --version`. The second call hits a per-process cache.
The probe costs about 80–90 ms on Windows. A run whose specs only run shell commands, HTTP
requests, or code paid it anyway, though nothing in that run reads the result. Can we skip it
without changing any result?

## Decision Drivers

* Identical results, reports, and skip decisions for every run.
* Runs that use a browser see the same available-apps list as before.
* Public API callers of `setConfig` and `detectAndResolveTests` keep the populated
  `environment.apps` they get today.
* Compatible with in-flight changes to `getAvailableApps` internals, such as which cached build it
  picks.

## Considered Options

* **A. Skip detection when no resolved context can read its result** (chosen).
* **B. Memoize driver verification on disk, keyed by binary mtime and size.**
* **C. Keep probing on every run.**

## Decision Outcome

Chosen option: **A**. A pure predicate, `runNeedsAvailableApps(specs)` in `src/core/tests.ts`,
returns true when any context meets one of these conditions:

* It names a browser.
* It targets a mobile platform (`android`, `ios`).
* It has a step that drives a browser (any `BROWSER_STEP_KEYS` key, such as `goTo`, `find`, or
  `record`).
* It has a `startSurface` or `closeSurface` step.

That's a superset of every reader of the available-apps list in the runner. The browser-required
checks, default-browser choice, context-support gate, record-engine coercion, warm-up, and driver
capabilities all sit behind one of those conditions. A run where the predicate is false never
consults the list.

* `runSpecs` probes only when the predicate holds. Otherwise its list is `[]`, and it still sets
  `APPIUM_HOME`, the probe's one lasting side effect, so child processes see the same
  environment.
* `setConfig` takes `detectApps` (default `true`). `runTests` passes `false` and, after
  resolution, fills `environment.apps` with the same `getAvailableApps` call when the predicate
  holds. It also fills it when the run goes to the orchestration API, which receives the resolved
  config. That uses the same `willRunViaApi` gate as the dispatch itself, so an API key with
  `DOC_DETECTIVE_API` set, which runs locally, doesn't force detection. The gate reads the effective
  config, so an API key that only arrives through `setConfig`, such as the `DOC_DETECTIVE`
  environment override, counts too. Before, the dispatch read the caller's config and missed it. `detectAndResolveTests` keeps the default, so public callers are unaffected.

The change sits at the call sites. `getAvailableApps` itself is unchanged, so changes to its
internals compose with this one.

### Consequences

* Good: a shell-only run skips about 50 ms (interleaved A/B, 15 rounds, Windows, telemetry off:
  787 → 737 ms) and never loads `@puppeteer/browsers` (19 modules).
* Good: browser runs probe exactly as before, from the same function with the same cache.
* Neutral: when `runTests` resolves the specs itself and no context uses a browser, the resolved
  config's `environment.apps` is `[]` instead of the host's browser list. Nothing in the runner,
  the reports, or the run folder reads that field, and the dry-run output already showed `[]`.
* Neutral: on a browser run, a detection warning, such as a driver that fails to execute, now logs
  after test resolution instead of before it.
* Bad: a future reader of the available-apps list must sit behind one of the predicate's
  conditions, or it sees `[]` on non-browser runs. The predicate's comment names this contract.

### Confirmation

`test/available-apps-lazy.test.js` covers the predicate's cases. It seeds the apps cache with a
sentinel. With it, the tests show that `setConfig` still detects by default and that
`detectApps: false` skips detection. They also show that `detectAndResolveTests` still populates
the field, and that `runSpecs` skips only when no context can use the list. `test/startup-modules.test.js` asserts that a shell-only CLI run
never loads `@puppeteer/browsers`.

## Pros and Cons of the Options

### A. Skip when unused

* Good: removes the whole probe, including the module load and cache scan, for non-browser runs.
* Bad: one more invariant to keep, which the predicate's comment and tests carry.

### B. Disk memo for driver verification

* Good: helps browser runs too.
* Bad: saves only the two `--version` spawns, about 30 ms. The module load and cache scan remain.
* Bad: a cached "works" verdict can outlive a change the key misses, such as a removed shared
  library.

### C. Keep probing

* Good: no change.
* Bad: every non-browser run pays for a probe it never reads.
