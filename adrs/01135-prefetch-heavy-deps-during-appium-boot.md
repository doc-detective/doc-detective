---
status: accepted
date: 2026-10-14
decision-makers: hawkeyexl
---

# Prefetch heavy dependencies while Appium boots

## Context and Problem Statement

A browser run spawns an Appium server, then waits about 1.3 seconds for it to
answer `/status`. Appium boots in its own process, so the runner's main thread
is idle for that wait. Only after Appium is ready does `driverStart` call
`wdio.remote()`. webdriverio's CommonJS entry is a thin wrapper: `remote()`
first imports its real module graph from a sibling `./node.js`, which takes
300 to 400 ms on Windows. A run with a screenshot step later loads `sharp` the
same way, about 45 ms more. Both loads sit on the critical path even though
the thread was idle seconds earlier.

## Decision Drivers

* Shorter time to the first browser step, for every browser and app run.
* Identical results and error reporting. A broken install must fail at the
  same point, with the same error, as before.
* No new install side effects, and no unhandled promise rejections.

## Considered Options

1. **Start the imports when an Appium spawn begins** and let the existing
   loads share Node's module cache.
2. **Load webdriverio at runner start-up**, before any Appium spawn.
3. **Leave the loads where they are.**

## Decision Outcome

Chosen option: **1**. `prefetchHeavyDep(name, ctx)` in
[src/runtime/loader.ts](../src/runtime/loader.ts) resolves the dep the same
way `loadHeavyDep` does (shim, then runtime cache) and starts a dynamic
`import()` whose rejection is swallowed. For webdriverio it imports the
deferred `./node.js` sibling, the module `remote()` imports; for other deps,
the resolved entry.

- Every Appium spawn path prefetches webdriverio right after the spawn:
  `spawnAppiumServer` (browser pool, app surfaces, mobile prefetch) and
  `getRunner`.
- The browser pool also prefetches `sharp` when any job has a screenshot step
  (`jobTakesScreenshot`).
- A prefetch never installs. A dep that isn't installed is skipped, and the
  real load installs it as before.
- A failed early import isn't reported by the prefetch. Node caches a module
  that threw during evaluation, so the real load rejects with that same error
  where it's awaited. A module that can't be found isn't cached, so the real
  load retries it as before.

Option 2 would make runs without a browser pay the import. It could also
delay the Appium spawn, because module evaluation blocks the main thread.
Starting after the spawn keeps the evaluation inside the readiness wait.

### Consequences

* Good, because the time from Appium ready to the first step drops by about
  300 ms per browser run (measured on Windows: median 1222 ms to 908 ms over
  8 runs each).
* Good, because the first screenshot no longer pays the sharp load.
* Neutral, because each module is still evaluated once per process.
* Bad, because a run whose Appium server fails to start now also loads
  webdriverio, which it never uses. The cost is CPU time during a failure.
* Bad, because the webdriverio target depends on its build layout. A unit
  test asserts the `./node.js` sibling exists and is what the entry imports,
  so an upgrade that moves it fails loudly instead of silently losing the
  saving.

### Confirmation

* [test/runtime-loader.test.js](../test/runtime-loader.test.js), the
  `prefetchHeavyDep` block: the prefetch evaluates the dep once and the later
  load reuses it; an evaluation error surfaces at the later load with no
  unhandled rejection; a missing dep is a no-op that installs nothing; the
  webdriverio target is the sibling its entry imports.
* [test/heavy-dep-prefetch.test.js](../test/heavy-dep-prefetch.test.js):
  `jobTakesScreenshot` gates the sharp prefetch.

## Pros and Cons of the Options

### 1. Prefetch when an Appium spawn begins

* Good, because the import overlaps an idle wait that every browser run has.
* Good, because the existing load path and its errors are unchanged.
* Bad, because it relies on webdriverio's build layout, guarded by a test.

### 2. Load at runner start-up

* Good, because it's one call in one place.
* Bad, because non-browser runs pay for it, and the evaluation can land
  before the Appium spawn and delay it.

### 3. Leave the loads where they are

* Good, because it needs no change.
* Bad, because every browser run keeps about 300 ms on its critical path.
