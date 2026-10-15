---
status: accepted
date: 2026-10-14
decision-makers: hawkeyexl
---

# Memoize the debug dump's tool probes per process

## Context and Problem Statement

`doc-detective debug` reports tool versions through `probeAllTools` in
[src/debug/tools.ts](../src/debug/tools.ts). Six of its probes spawn a shell
command: `npm`, `npx`, `python3` (or `python`), `java`, `git`, and `docker`,
each with `--version`. One dump costs about 250 to 300ms, bounded by the
slowest spawn.

The CLI dumps once per process, so the cost doesn't matter there. The mocha
suite builds the dump in-process dozens of times and spawns the same six
commands each time to get the same answers. That's about 10 seconds of the debug
test files' 23 seconds locally.

## Decision Drivers

* Results must not change, including the print order and the per-call
  `cacheDir` handling of the Appium probe.
* A changed `PATH` can change which binary resolves, so it must re-probe.
* A transient timeout shouldn't become the answer for the rest of the process.
* No test-only branches in product code.

## Considered Options

1. **Memoize the spawned probes per process, keyed on `PATH`.**
2. **Memoize the whole `probeAllTools` result**, keyed on `cacheDir`.
3. **Leave it.**

## Decision Outcome

Chosen option: **1**.

`probeSystemTools` caches one promise for the six spawned probes. The key is
the `PATH` value the probes actually run with, after `envWithoutNodeModulesBin`
strips the `node_modules/.bin` segments. Concurrent callers share the in-flight
promise. If any attempt in the set timed out, the entry is dropped, so the next
dump probes again. That includes a `python3` attempt that timed out before the
`python` fallback answered. A rejected set is dropped too, and the caller still
sees the error. `probeAllTools` picks each system-tool result by name, not by
position. The `node` version, the ffmpeg metadata read, and the Appium metadata
read still run on every call, because Appium depends on `cacheDir` and reads
cost nothing. `probeTool` itself isn't memoized.

### Consequences

* Good, because the debug test files drop from about 23s to about 12s locally.
* Neutral for the CLI, which dumps once per process.
* Bad, because a long-lived process that installs a tool mid-run without
  changing `PATH` reports the version it saw first. Only programmatic callers
  can hit that, and the dump is diagnostic.

### Confirmation

[test/debug-tools-memo.test.js](../test/debug-tools-memo.test.js) drives the
memo with injected probe results, so no live spawn timing is involved. It
asserts reuse for an unchanged `PATH` and a re-probe for a changed one. It also
asserts that timed-out and rejected sets aren't kept, and that a `python3`
timeout is flagged when the fallback answers. A live call checks the print
order and that the Appium entry is rebuilt per call.

## Pros and Cons of the Options

### Memoize the spawned probes, keyed on PATH

* Good, because it caches only the expensive, environment-bound part.
* Bad, because it adds a module-level map.

### Memoize the whole result, keyed on cacheDir

* Good, because it's one line.
* Bad, because it ignores `PATH` changes and freezes the Appium probe across
  installs into the cache.

### Leave it

* Good, because there's no new state.
* Bad, because the suite keeps paying about 10 seconds for repeated answers.
