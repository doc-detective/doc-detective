---
status: accepted
date: 2026-07-08
decision-makers: doc-detective maintainers
---

# Retry a process-surface init crash under concurrent process/PTY startup

## Context and Problem Statement

A `startSurface` step can open several **process/PTY surfaces in parallel** within a single test
(multi-surface Phase 6, PR #539): the array lanes are gathered with `Promise.allSettled`, so many
`node`/ConPTY children spawn at once. Each surface goes through `startBackgroundProcessSurface` in
[src/core/tests/processSurface.ts](../src/core/tests/processSurface.ts), which spawns the process
(`spawnBackgroundCommand` / `spawnPtyBackgroundCommand` in [src/core/utils.ts](../src/core/utils.ts))
and then blocks on `waitForReady`. `waitForReady` fails fast if the process **exits before becoming
ready**, throwing `Process exited before becoming ready (exit code <n>)`.

At `concurrentRunners: 2` (now the default via `config.groups.json`, PR #532), the `process` group runs
two specs at once, compounding with this spec's own parallel opens — many node/ConPTY children spawning
simultaneously on a 2-core Windows runner. The `fixtures / process (windows-latest)` job then FAILed on
the `start-surface-process` fixture (`p6-tty`, one of several parallel process surfaces):

```text
Error: Background process "p6-tty" failed to become ready: Process exited before becoming ready (exit code -1073741510).
```

`-1073741510` is the signed form of the Windows NTSTATUS **`0xC000013A` STATUS_CONTROL_C_EXIT** — a
console-control termination delivered to a just-spawned console/ConPTY child during startup. Its sibling
**`0xC0000142` (-1073741502) STATUS_DLL_INIT_FAILED** — the loader failing to initialize a DLL for the
child — is the same class of failure and the classic symptom of heavy concurrent process/DLL spawning
exhausting a transient Windows loader/console limit. In both cases one child dies *during
initialization*, before it can signal ready.

This is the process-surface analog of the driver-start concurrency races already hardened for browsers:
the ChromeDriver "crashed during startup" race (ADR 01039) and the geckodriver "probably crashed" race
(ADR 01042), both retried by `driverStart` via `isRetryableSessionError`. There, a driver child that
dies right after `POST /session` under concurrent startup is retried with a fresh spawn and linear
backoff; the contention clears on a subsequent attempt. The process-surface path had **no such retry** —
any early exit, transient or not, failed the surface immediately.

The spec passes at `concurrentRunners: 1` and only *intermittently* fails at 2 — confirming this is
transient concurrent-spawn contention, not a deterministic bug in the parallel process-surface path nor
a hard resource cap.

## Decision Drivers

- The `fixtures / process` job runs under `concurrentRunners: 2` (PR #532); this crash fails PR CI on a
  legitimate, supported feature (parallel process/PTY `startSurface`).
- The fix should mirror the driver-start concurrency fixes (ADR 01039 / ADR 01042): a transient
  concurrent-startup crash is **retried with a fresh spawn and bounded backoff**, not failed hard — the
  same philosophy applied to the process surface.
- The `concurrentRunners: 1` path and every non-crash start must stay behavior-preserving — a surface
  that becomes ready on the first attempt never touches the retry path.
- The retry must be **gated to the transient win32 init signatures** so a genuinely-broken command (bad
  exit code, missing binary, readiness timeout) still fails fast after the bound, and so non-Windows
  platforms — where the same decimals are ordinary signal/exit codes, not NTSTATUS — never retry.
- The classifier must stay a small pure helper, unit-testable without spawning real processes (repo
  convention, matching `isRetryableSessionError`).

## Considered Options

1. **Bounded retry around the process-surface spawn + `waitForReady`, gated to the transient win32 init
   exit codes** — a fresh spawn per attempt with linear backoff, mirroring `driverStart`. Classification
   lives in a new pure helper `isTransientProcessInitError` next to `isRetryableSessionError`.
2. Add a bounded concurrent-spawn guard/semaphore that serializes or limits how many process/PTY
   surfaces start at once.
3. Cap the `process` fixture group at `concurrentRunners: 1`.
4. Widen the readiness timeout / add a fixed pre-spawn delay.

## Decision Outcome

Chosen option: **1**. `startBackgroundProcessSurface` wraps its spawn + `waitForReady` in a bounded loop
(1 initial attempt + 2 retries). When `waitForReady` rejects, a new pure helper
`isTransientProcessInitError(message, platform)` in [src/core/utils.ts](../src/core/utils.ts) decides
whether to retry: it parses the exit code out of the early-exit rejection and returns `true` only on
`win32` and only for the transient NTSTATUS set (`0xC0000142` STATUS_DLL_INIT_FAILED, `0xC000013A`
STATUS_CONTROL_C_EXIT). On a match, the crashed handle is torn down (kill + deregister) and a **fresh**
process is spawned after a `500ms * attempt` backoff — the same backoff shape as `driverStart`. Any
other failure (a normal non-zero exit, a readiness *timeout* on a stuck process, a non-win32 platform)
is **not** retried and fails exactly as before after one attempt.

Option 1 was chosen over the concurrency guard (option 2) because a retry is strictly less invasive: it
recovers the transient crash without forfeiting the parallel-startup concurrency the feature exists to
provide, and it reuses the established driver-start philosophy rather than introducing a new
serialization primitive. The evidence (passes at 1, intermittent at 2, an NTSTATUS *init* crash) points
squarely at transient contention a bounded retry absorbs — category (a), not a hard resource ceiling
(b) or a deterministic logic bug (c).

To make the retry deterministically testable without racing real Windows processes, the launcher takes
an optional `deps` seam (spawn/readiness helpers + platform + sleep) that defaults to the real
implementations, so the production path is unchanged.

### Consequences

- Good: a process/PTY child that crashes during concurrent init on Windows is retried with a fresh spawn
  and backoff instead of failing the surface; the observed `process (windows-latest)` `p6-tty` failure
  becomes a PASS at `concurrentRunners: 2`.
- Good: mirrors the ADR 01039 / ADR 01042 driver-start retry philosophy — same bounded-loop + linear
  backoff shape, a sibling pure classifier next to `isRetryableSessionError`.
- Neutral: a command that crashes with a transient-looking win32 init code on *every* attempt now costs
  a few extra bounded, backed-off attempts before it surfaces the same failure — the same trade
  `driverStart` already makes for every transient driver crash.
- Neutral: `concurrentRunners: 1`, every non-win32 platform, and any surface that becomes ready first
  try are byte-for-byte unchanged — they never enter the retry branch.
- Neutral: no schema change. The retry is internal reliability; `background`/`startSurface` process
  descriptors are unchanged, and there is no new config/CLI knob.

### Confirmation

- Unit (classifier): `isTransientProcessInitError` cases in
  [test/core-utils-coverage.test.js](../test/core-utils-coverage.test.js) — the exact CI exit code
  (`-1073741510`) and its DLL-init sibling (`-1073741502`) are transient on `win32`; the same codes off
  win32, ordinary exit codes (`0`/`1`), and a readiness-timeout message are all non-transient.
- Unit (launcher): `startBackgroundProcessSurface: transient init retry` cases in
  [test/background-process.test.js](../test/background-process.test.js) — a transient win32 init
  early-exit on attempt 1 followed by a ready process on attempt 2 PASSes with exactly two spawns and
  registers the surviving process; a non-transient exit and a non-win32 platform each fail after a
  single spawn; an all-transient sequence gives up after the bound (2–4 spawns) rather than looping
  unbounded.
- End-to-end: the `fixtures / process (windows-latest)` job under `concurrentRunners: 2` (PR #532) — the
  `start-surface-process` parallel spec (`p6-tty` et al.) completes instead of FAILing on a transient
  init crash.

## Pros and Cons of the Options

### Option 1: bounded retry gated to the transient win32 init codes (chosen)

- Good: direct analog of the driver-start concurrency retries (ADR 01039 / 01042); recovers the
  transient crash while preserving parallel-startup concurrency.
- Good: pure, unit-testable classifier (`isTransientProcessInitError`) beside `isRetryableSessionError`;
  the launcher loop stays boring, with a fresh spawn per attempt.
- Good: gated to win32 + the two NTSTATUS init codes + the early-exit shape, so single-runner,
  non-Windows, non-crash, and readiness-timeout paths are unchanged.
- Bad: a permanently broken command matching a transient code pays a few extra backed-off attempts — the
  same trade already accepted for driver starts.

### Option 2: a bounded concurrent-spawn guard/semaphore

- Good: caps the peak spawn pressure that triggers the loader/console exhaustion at its source.
- Bad: introduces a new serialization primitive and throttles the parallel-startup concurrency the
  feature is meant to provide, to work around a race a bounded retry absorbs outright; more invasive
  than a retry for no additional coverage of the common case.

### Option 3: cap the `process` group at `concurrentRunners: 1`

- Good: no code change.
- Bad: permanently forfeits the parallel process-surface execution the fixtures exist to validate, to
  dodge a transient startup crash with a bounded-retry root cause.

### Option 4: widen the readiness timeout / add a fixed pre-spawn delay

- Good: trivial.
- Bad: the child *exits* during init — it never becomes ready — so a longer timeout can't help; a fixed
  delay slows every start unconditionally and only reduces, without eliminating, the contention window.
