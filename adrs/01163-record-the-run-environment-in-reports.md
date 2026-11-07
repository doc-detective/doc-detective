---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# Record the run environment in reports

Amends [ADR 01083](01083-record-durationms-on-report-nodes.md) with start times.

## Context and Problem Statement

A test that passed yesterday fails today. Four things can cause that: the product changed, the docs
changed, the test is flaky, or the environment changed under it. "Chrome updated overnight" is a
common example of the last. The report can't tell these apart. It records results and durations, but
not which Doc Detective, Node.js, OS, browser, or driver produced them.

The report also has no start times. `runId` looks like a timestamp (`2026-11-06T02-33-28-631Z`), so
consumers parse it. It's really a folder name: on a clash it gains a `-N` suffix, and its format isn't
ISO 8601. Contexts and steps carry `durationMs` (ADR 01083) but nothing says when they ran. A consumer
can't line a step up with a server log, or order steps across concurrent contexts.

Rollout item 1.2 in [docs/design/v5-rollout.md](../docs/design/v5-rollout.md) asks for a run
fingerprint. Run history in 5.4 depends on it.

## Decision Drivers

* Separate product drift from environment drift using the report alone.
* Additive only. It ships on 4.x, so no existing field changes shape or meaning.
* One name for one concept. Config already has a read-only `environment` that describes the host.
* Don't leak local paths into a report that may be shared or uploaded.
* No extra cost per context. Don't spawn a process or send a command to read a version.

## Considered Options

* **A. Reuse `environment` for the host; put browser and driver on each context** (chosen).
* **B. A new root object, such as `runner`**, holding the host and a map of browser versions.
* **C. Record versions only, no start times.**

## Decision Outcome

Chosen: **option A**, plus `startedAt` on the run, each context, and each step. Every new field is
`readOnly` and system-populated.

```json
{
  "runId": "2026-11-06T02-33-28-631Z",
  "startedAt": "2026-11-06T02:33:28.631Z",
  "environment": {
    "platform": "linux",
    "arch": "x64",
    "docDetectiveVersion": "4.42.0",
    "nodeVersion": "24.15.0",
    "osRelease": "6.8.0-1017-azure"
  },
  "specs": [{ "tests": [{ "contexts": [{
    "contextId": "default",
    "startedAt": "2026-11-06T02:33:28.640Z",
    "browser": { "name": "chrome", "version": "131.0.6778.85" },
    "driver": { "name": "chromedriver", "version": "131.0.6778.85" },
    "steps": [{ "stepId": "open", "startedAt": "2026-11-06T02:33:28.645Z", "durationMs": 138 }]
  }]}]}]
}
```

### The report's `environment` is config's `environment`

`report_v3.environment` `$ref`s `config_v3#/components/schemas/environment`, which gains three
optional fields: `docDetectiveVersion`, `nodeVersion`, and `osRelease`. Both describe the host that
ran Doc Detective, so they share one schema. `getEnvironment()` fills all of them, so the resolved
config and the report agree.

* `docDetectiveVersion` is read from doc-detective's own `package.json`. The lookup walks up from the
  module rather than using a fixed `../../package.json`, because the CJS bundle (`dist/index.cjs`)
  sits one level shallower than the ESM build.
* `nodeVersion` is `process.versions.node`, without the leading `v`.
* `osRelease` is `os.release()`.
* `workingDirectory` stays out of the report. It's a local path, and it says nothing about drift.

### Browser and driver on each context

Each context that started a browser gets `browser.version` and a `driver` object. Both come from
the WebdriverIO session's capabilities, falling back to what Doc Detective detected when the session
is silent. `sessionVersions()` in `src/core/utils.ts` holds the rules:

| Engine | `browser.version` | `driver` |
|---|---|---|
| Chrome | `browserVersion` capability | `chromedriver`, from `chrome.chromedriverVersion` |
| Firefox | the detected build, minus its channel (`nightly_161.0a1` → `161.0a1`) | `geckodriver`, from the managed `geckodriver-<version>` binary name |
| Safari | `browserVersion` capability | `safaridriver`, with no version |

Firefox needs the fallbacks because appium-geckodriver echoes the requested capabilities, not
geckodriver's. A context that never started a browser has neither field. Mobile web contexts record
what the device session reports. There's no desktop app entry to fall back on.

`browser.version` lives on the context's existing `browser` object, so `browser` gains an optional
`readOnly` `version` in `context_v3`. Validation doesn't enforce `readOnly`, so an authored
`runOn` browser can carry a `version`. Context resolution drops it when it clones each browser, so
only the session sets it. Otherwise a context that skipped before Chrome started would report the
authored value. The runner writes a copy, so the version never feeds back into the context's launch
settings.

### Start times (amends ADR 01083)

`startedAt` is an ISO 8601 UTC timestamp with milliseconds (`Date.prototype.toISOString()`). The
schema declares `format: "date-time"`.

* **Run.** The same clock as `run.durationMs`: the start of the execution phase inside `runSpecs`.
  A run whose `--spec` or `--test` filters matched nothing still carries it, along with
  `environment`. That holds for the local runner and for the orchestration API path, which
  returns before sending anything.
* **Context.** Stamped in `runContextWithRetries`, beside `durationMs`, so all of `runContext`'s
  exits get it. A context re-run by the `retries` policy reports the start of its final attempt,
  the attempt its `result` describes, matching its `durationMs`.
* **Step.** Stamped where each attempt runs, and by the recording-teardown sweep. A retried step
  reports its final attempt's start.
* **Spec and test** don't get one. Their `durationMs` is a sum of children (ADR 01083), not a span,
  so a start time would mislead.
* **No `endedAt`.** It's `startedAt + durationMs`.

Unlike `durationMs`, `startedAt` is absent on nodes that never ran: a skipped step, a
guard-skipped context, a routing marker. There's no honest start to report, and a default would be
a lie. A reporter that needs every node to carry a field already has `durationMs`.

`runId` keeps its format. Its description now says it's opaque: `Opaque, sortable ID of the run
folder. Read startedAt for the time.`

### Consequences

* Good: a failed run can be diffed against a passing one for environment changes, from the report
  alone.
* Good: steps across concurrent contexts can be ordered and lined up with external logs.
* Good: consumers have a supported timestamp, so they can stop parsing `runId`.
* Neutral: config's resolved `environment` also shows the three versions. It's the same host.
* Neutral: `browser.version` on an authored context validates and is ignored. Resolution drops it,
  so it never reaches the report.
* Bad: the Firefox browser version is Doc Detective's detected build ID, not one the browser
  reported. It still changes exactly when Firefox does, which is what drift detection needs.
* Bad: tests that compare two reports for equality must strip `startedAt`, as they already strip
  `durationMs`.

### Confirmation

* `src/common/test/validate.test.js`, `report_v3 run metadata`: the full shape validates, and a
  context without a browser or driver validates. An unknown `environment.platform` (`plan9`), an
  unknown `environment` key, a non-date `startedAt`, and a driver without a name are each invalid.
* `test/run-metadata.test.js` runs the real pipeline over a shell-only spec. It checks
  `environment.nodeVersion === process.versions.node`, `docDetectiveVersion` against
  `package.json`, `osRelease` against `os.release()`, and no `workingDirectory`. It checks ISO
  timestamps on the run, every context, and every step, with each step starting at or after its
  context. No browser or driver version appears without a browser. An authored `browser.version`
  doesn't reach the report of a context that skipped. The emitted metadata validates against
  `report_v3`. Unit cases cover `sessionVersions()` for each engine. They also cover `null` and
  non-string capabilities, which it ignores rather than throwing on.
* `test/utils.test.js`: both filter short-circuits, `runSpecs` and `runViaApi`, carry `startedAt`
  and `environment`.
* `test/htmlReporter.test.js`: the step input panel strips `startedAt` along with `durationMs`.
* `test/config-coverage.test.js`: `getEnvironment()` returns the three versions and no working
  directory.
* `test/core-artifacts/reporters/run-metadata.spec.json` reads a nested run's `--output` JSON. A
  no-browser permutation runs everywhere. A browser permutation runs where Chrome is available.

A full report on 4.x doesn't validate against `report_v3` yet, for reasons outside this change. The
test-level `result` isn't declared. And `runShell`'s `outputs.stdio` is an object where the schema
says string. The v5 report contract (ADR 01149, on `feat/v5-rc`) closes those. So the pipeline test
validates the emitted metadata on a minimal report rather than the whole report.

## Pros and Cons of the Options

### A. Reuse `environment`; browser and driver per context

* Good, one schema and one name for the host, in config and in the report.
* Good, browser versions sit on the context that used them, where a consumer already looks.
* Bad, `environment` in a report could be misread as the config's copy. It is the same data, so the
  misreading is harmless.

### B. A new `runner` object

* Good, no chance of confusing it with config.
* Bad, two names and two schemas for the same host facts, which drift apart.
* Bad, a root map of browser versions needs a key per context, duplicating `contexts[]`.

### C. Versions only

* Good, smaller.
* Bad, leaves consumers parsing `runId` for a time, and gives no way to line steps up with external
  logs.
