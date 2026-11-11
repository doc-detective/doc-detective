---
status: accepted
date: 2026-07-08
decision-makers: doc-detective maintainers
---

# Retry a process-surface init crash under concurrent process/PTY startup

## Context and Problem Statement

A `startSurface` step can open several **process or PTY surfaces in parallel** within a single test,
per multi-surface Phase 6, PR #539. The array lanes are gathered with `Promise.allSettled`, so many
`node` and ConPTY children spawn at once. Each surface goes through `startBackgroundProcessSurface`
in [src/core/tests/processSurface.ts](../src/core/tests/processSurface.ts). That spawns the process,
through `spawnBackgroundCommand` or `spawnPtyBackgroundCommand` in
[src/core/utils.ts](../src/core/utils.ts), and then blocks on `waitForReady`. `waitForReady` fails
fast if the process **exits before becoming ready**, throwing
`Process exited before becoming ready (exit code <n>)`.

`concurrentRunners: 2` is now the default, through `config.groups.json` in PR #532. So the `process`
group runs two specs at once, compounding with this spec's own parallel opens. That's many node and
ConPTY children spawning simultaneously on a 2-core Windows runner. The
`fixtures / process (windows-latest)` job then FAILed on the `start-surface-process` fixture. The
failing surface was `p6-tty`, one of several parallel process surfaces:

```text
Error: Background process "p6-tty" failed to become ready: Process exited before becoming ready (exit code -1073741510).
```

`-1073741510` is the signed form of the Windows NTSTATUS **`0xC000013A` STATUS_CONTROL_C_EXIT**.
That's a console-control termination delivered to a just-spawned console or ConPTY child during
startup. Its sibling is **`0xC0000142` (-1073741502) STATUS_DLL_INIT_FAILED**, the loader failing to
initialize a DLL for the child. That's the same class of failure. Both are the classic symptom of
heavy concurrent process and DLL spawning, exhausting a transient Windows loader or console limit.
In both cases one child dies *during initialization*, before it can signal ready.

This is the process-surface analog of driver-start concurrency races already hardened for browsers.
Those are the ChromeDriver "crashed during startup" race (ADR 01039) and the geckodriver "probably
crashed" race (ADR 01042). `driverStart` retries both through `isRetryableSessionError`. There, a
driver child that dies right after `POST /session` under concurrent startup is retried with a fresh
spawn and linear backoff. The contention clears on a subsequent attempt. The process-surface
path had **no such retry**. Any early exit, transient or not, failed the surface immediately.

The spec passes at `concurrentRunners: 1`, and only *intermittently* fails at 2. That confirms
transient concurrent-spawn contention. It isn't a deterministic bug in the parallel process-surface
path, or a hard resource cap.

## Decision Drivers

- The `fixtures / process` job runs under `concurrentRunners: 2` (PR #532); this crash fails PR CI on a
  legitimate, supported feature (parallel process/PTY `startSurface`).
- The fix should mirror the driver-start concurrency fixes, ADR 01039 and ADR 01042. A transient
  concurrent-startup crash is **retried with a fresh spawn and bounded backoff**, rather than failed
  hard. That's the same philosophy applied to the process surface.
- The `concurrentRunners: 1` path and every non-crash start must stay behavior-preserving. A surface
  that becomes ready on the first attempt never touches the retry path.
- The retry must be **gated to the transient win32 init signatures**. A genuinely-broken command must
  still fail fast after the bound, whether from a bad exit code, a missing binary, or a readiness
  timeout. Non-Windows platforms must never retry, since there the same decimals are ordinary signal
  or exit codes rather than NTSTATUS.
- The classifier must stay a small pure helper, unit-testable without spawning real processes (repo
  convention, matching `isRetryableSessionError`).

## Considered Options

1. **A bounded retry around the process-surface spawn and `waitForReady`, gated to the transient
   win32 init exit codes.** It's a fresh spawn per attempt with linear backoff, mirroring
   `driverStart`. Classification lives in a new pure helper `isTransientProcessInitError`, next to
   `isRetryableSessionError`.
2. Add a bounded concurrent-spawn guard/semaphore that serializes or limits how many process/PTY
   surfaces start at once.
3. Cap the `process` fixture group at `concurrentRunners: 1`.
4. Widen the readiness timeout / add a fixed pre-spawn delay.

## Decision Outcome

Chosen option: **1**. `startBackgroundProcessSurface` wraps its spawn and `waitForReady` in a bounded
loop, of one initial attempt plus two retries. When `waitForReady` rejects, a new pure helper
`isTransientProcessInitError(message, platform)` in [src/core/utils.ts](../src/core/utils.ts) decides
whether to retry. It parses the exit code out of the early-exit rejection. It returns `true` only on
`win32`, and only for the transient NTSTATUS set: `0xC0000142` STATUS_DLL_INIT_FAILED and
`0xC000013A` STATUS_CONTROL_C_EXIT. On a match, the crashed handle is torn down, killed and
deregistered. A **fresh** process is then spawned after a `500ms * attempt` backoff, the same backoff
shape as `driverStart`. Any other failure is **not** retried, and fails exactly as before after one
attempt. That covers a normal non-zero exit, a readiness *timeout* on a stuck process, and a
non-win32 platform.

Option 1 was chosen over the concurrency guard, option 2, because a retry is strictly less invasive.
It recovers the transient crash without forfeiting the parallel-startup concurrency the feature
exists to provide. It also reuses the established driver-start philosophy, rather than introducing a
new serialization primitive. The evidence points squarely at transient contention a bounded retry
absorbs. It passes at 1, is intermittent at 2, and shows an NTSTATUS *init* crash. That's category
(a), rather than a hard resource ceiling (b) or a deterministic logic bug (c).

To make the retry deterministically testable without racing real Windows processes, the launcher
takes an optional `deps` seam. It carries spawn and readiness helpers, plus platform and sleep, and
defaults to the real implementations. So the production path is unchanged.

### Consequences

- Good: a process or PTY child that crashes during concurrent init on Windows no longer fails the
  surface. It is retried with a fresh spawn and backoff. The observed `process (windows-latest)`
  `p6-tty` failure becomes a PASS at `concurrentRunners: 2`.
- Good: it mirrors the ADR 01039 and ADR 01042 driver-start retry philosophy. That's the same
  bounded-loop and linear-backoff shape, with a sibling pure classifier next to
  `isRetryableSessionError`.
- Neutral: take a command that crashes with a transient-looking win32 init code on *every* attempt.
  It now costs a few extra bounded, backed-off attempts before it surfaces the same failure. That's
  the same trade `driverStart` already makes for every transient driver crash.
- Neutral: `concurrentRunners: 1`, every non-win32 platform, and any surface that becomes ready first
  try are byte-for-byte unchanged. They never enter the retry branch.
- Neutral: no schema change. The retry is internal reliability. The `background` and `startSurface`
  process descriptors are unchanged, and there is no new config or CLI knob.

### Confirmation

- Classifier unit tests add `isTransientProcessInitError` cases in
  [test/core-utils-coverage.test.js](../test/core-utils-coverage.test.js). The exact CI exit code,
  `-1073741510`, and its DLL-init sibling, `-1073741502`, are transient on `win32`. The same codes
  off win32, ordinary exit codes `0` and `1`, and a readiness-timeout message are all non-transient.
- Launcher unit tests in [test/background-process.test.js](../test/background-process.test.js) add
  `startBackgroundProcessSurface: transient init retry` cases. A transient win32 init early-exit on
  attempt 1, followed by a ready process on attempt 2, PASSes with exactly two spawns. It registers
  the surviving process. A non-transient exit and a non-win32 platform each fail after
  a single spawn. An all-transient sequence gives up after the bound, at 2–4 spawns, rather than
  looping unbounded.
- End-to-end: the `fixtures / process (windows-latest)` job under `concurrentRunners: 2`, in PR #532.
  The `start-surface-process` parallel spec, `p6-tty` and friends, completes instead of FAILing on a
  transient init crash.

## Pros and Cons of the Options

### Option 1: bounded retry gated to the transient win32 init codes (chosen)

- Good: it's a direct analog of the driver-start concurrency retries, ADR 01039 and 01042. It
  recovers the transient crash while preserving parallel-startup concurrency.
- Good: the classifier `isTransientProcessInitError` is pure and unit-testable, beside
  `isRetryableSessionError`. The launcher loop stays boring, with a fresh spawn per attempt.
- Good: it's gated to win32, the two NTSTATUS init codes, and the early-exit shape. So single-runner,
  non-Windows, non-crash, and readiness-timeout paths are unchanged.
- Bad: a permanently broken command matching a transient code pays a few extra backed-off attempts.
  That's the same trade already accepted for driver starts.

### Option 2: a bounded concurrent-spawn guard/semaphore

- Good: caps the peak spawn pressure that triggers the loader/console exhaustion at its source.
- Bad: it introduces a new serialization primitive, and throttles the parallel-startup concurrency
  the feature is meant to provide. It does that to work around a race a bounded retry absorbs
  outright. It's more invasive than a retry, for no additional coverage of the common case.

### Option 3: cap the `process` group at `concurrentRunners: 1`

- Good: no code change.
- Bad: permanently forfeits the parallel process-surface execution the fixtures exist to validate, to
  dodge a transient startup crash with a bounded-retry root cause.

### Option 4: widen the readiness timeout / add a fixed pre-spawn delay

- Good: trivial.
- Bad: the child *exits* during init, and never becomes ready, so a longer timeout can't help. A
  fixed delay slows every start unconditionally, and only reduces the contention window rather than
  eliminating it.
