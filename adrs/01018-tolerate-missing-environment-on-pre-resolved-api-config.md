---
status: accepted
date: 2026-07-02
decision-makers: doc-detective maintainers
---

# Tolerate a missing `config.environment` on pre-resolved DOC_DETECTIVE_API configs

## Context and Problem Statement

`DOC_DETECTIVE_API` lets a runner fetch a fully pre-resolved test bundle (`resolvedTests`) from an
external orchestration API instead of resolving it locally (`getResolvedTestsFromEnv` in
`src/utils.ts`). `runTests()` (`src/core/index.ts`) then passes `resolvedTests.config` straight
into `runSpecs()`, deliberately skipping `setConfig()` — the orchestration API is the source of
truth for that config, and `setConfig()` is where local file/env config resolution and validation
normally live.

`setConfig()` is also the only place that populates `config.environment` (`getEnvironment()` sets
`arch`/`platform`, and `getAvailableApps()` fills in `apps`). Because the API path never calls
`setConfig()`, `config.environment` is `undefined` for the whole run. `getAvailableApps()`
(`src/core/config.ts`) unconditionally read `config.environment.platform === "mac"` to gate Safari
detection, so any DOC_DETECTIVE_API run crashed with `Cannot read properties of undefined (reading
'platform')` — before a single step executed, regardless of what schema-valid `resolvedTests` the
orchestration API returned.

Two contributing test hygiene issues let this ship unnoticed:

1. `test/resolvedTests.test.js`'s `apiConfig.url` was set to the full `resolved-tests` endpoint
   (`http://localhost:8093/api/resolved-tests`) instead of the base API URL. `getResolvedTestsFromEnv`
   appends `/resolved-tests` itself, so every real request 404'd, `process.exit(1)` fired before the
   crash site was ever reached, and the assertions after it never ran.
2. The tests waited for an output file and skipped their assertions entirely
   (`if (fs.existsSync(outputFile)) { ... }`) if the file never appeared, instead of failing. Combined
   with (1), the suite reported green while never exercising a real DOC_DETECTIVE_API run.

## Decision Drivers

* A pre-resolved config from an external API must run correctly without requiring that API to
  replicate every field `setConfig()` would normally compute locally.
* The fix must not weaken `getAvailableApps()`'s existing Safari-detection behavior for the
  locally-resolved path (where `config.environment` is always present).
* Tests must fail loudly when the run they're supposed to validate didn't happen, not silently skip.

## Considered Options

* **A. Fall back to a fresh `getEnvironment()` platform read inside `getAvailableApps()` when
  `config.environment` is absent** (chosen).
* **B. Require the orchestration API to include a populated `environment` in `resolvedTests.config`.**
* **C. Call `setConfig()` (or just `getEnvironment()`) on the pre-resolved config in `runTests()`
  before it reaches `runSpecs()`.**

## Decision Outcome

Chosen option: **A**. `getAvailableApps()` already has exactly one caller-independent way to learn
the current platform — `getEnvironment()` — and `runSpecs()` calls it independently anyway to build
`runnerDetails.environment`. Reading `config?.environment?.platform ?? getEnvironment().platform`
makes `getAvailableApps()` self-sufficient: it uses the caller-supplied value when present (the
local path, and any future caller that does populate it) and computes the same value the local path
would have computed otherwise. This mirrors an existing defensive read at
`getBrowserDiagnostics`'s `config?.environment?.platform` a few hundred lines below in the same
file — option A brings the outlier in line with the codebase's existing pattern instead of
introducing a new one.

B was rejected: it pushes an internal implementation detail (how the local runner happens to
represent its own host) onto every orchestration API implementer, and a stale/absent value there
would recreate the same bug at the integration layer instead of a single call site. C was rejected
as broader than necessary — `runTests()` deliberately does not run `setConfig()` against
API-supplied config (see the comment at `src/core/index.ts` around the `resolvedTests.config` merge)
because that config is the orchestration API's contract, not something to re-derive or
re-validate locally; a partial `setConfig()`-like call would blur that boundary for one field.

### Consequences

* Good: DOC_DETECTIVE_API runs no longer crash before executing any step, regardless of what the
  orchestration API includes in `resolvedTests.config`.
* Good: no behavior change for the locally-resolved path — `config.environment.platform` is always
  present there, so the `??` fallback never triggers.
* Neutral: `getAvailableApps()` now computes the platform twice per `runSpecs()` call in the API
  path (once here, once in `runnerDetails.environment` in `src/core/tests.ts`) — `getEnvironment()`
  is a cheap synchronous `os.arch()`/`process.platform` read, not worth memoizing further.

### Confirmation

* Red→green unit test in `test/config-coverage.test.js` ("does not throw when config.environment is
  absent (pre-resolved API config)") exercises `getAvailableApps({ config: { cacheDir } })` with no
  `environment` key.
* `test/resolvedTests.test.js`'s `apiConfig.url` fixed to the base API URL, and its previously-silent
  `if (fs.existsSync(outputFile))` guards replaced with hard assertions. Since a DOC_DETECTIVE_API
  run reports results via `reportResults()` (a POST to the orchestration API), not
  `outputResults()`/`-o`, the assertions now parse the results JSON that `runTests()` always logs to
  stdout (the `(INFO) RESULTS:` marker) rather than waiting on a file that run mode never produces.
  The suite's own fixture context (`test/server/index.js`'s `/api/resolved-tests` handler) has no
  `platform` field, so this is the same shape a real orchestration API is expected to send.
* Manual end-to-end repro: `test/server` API endpoint + `DOC_DETECTIVE_API=... node
  ./bin/doc-detective.js` reproduced the crash before the fix and completed successfully
  (including reporting results back via `/contexts`) after it.

## Pros and Cons of the Options

### A. Fresh `getEnvironment()` fallback inside `getAvailableApps()`
* Good: single, self-contained fix; matches an existing defensive pattern in the same file.
* Good: zero contract change for orchestration API implementers.
* Bad: computes platform detection twice per run on the API path (cheap, synchronous).

### B. Require the orchestration API to send a populated `environment`
* Good: no runner code change.
* Bad: leaks an internal field's shape into an external API contract; a stale value silently
  misdetects Safari support instead of crashing loudly, which is worse.

### C. Run `setConfig()` (or an equivalent) over pre-resolved config
* Good: would also backfill any other field the local path assumes is present.
* Bad: broader than the actual bug; blurs the deliberate boundary that API-supplied config skips
  local config resolution/validation; higher risk of unintended side effects (e.g. re-detecting
  `environment.apps`, which the API path already computes explicitly via `getAvailableApps`).

## More Information

See `getAvailableApps()` in `src/core/config.ts` and its existing `config?.environment?.platform`
sibling read in `getBrowserDiagnostics()` a few hundred lines below. The pre-resolved-config merge
this bug depends on is in `runTests()` in `src/core/index.ts`.
