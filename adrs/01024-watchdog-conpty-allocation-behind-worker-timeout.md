---
status: accepted
date: 2026-07-04
decision-makers: doc-detective maintainers
---

# Bound ConPTY allocation behind a worker-thread watchdog on Windows

## Context and Problem Statement

On a GitHub-hosted Windows runner, once a native **app-surface** context (NovaWindows /
`startSurface`, phase A1 — [ADR 01021](01021-native-app-surfaces-windows-a1.md), PR #491) has run in
a Node process, the **first later** `pty.spawn` — a `runShell` step with `background.tty: true`, i.e.
a ConPTY allocation via `@homebridge/node-pty-prebuilt-multiarch` — **freezes the entire process**.
Both concurrent runners go silent at once and the job dies at its timeout. It reproduced 4/4 on
hosted runners, ~11 minutes after the app fixture *passed*, at the `type-process-tty-stdio-match`
step ([issue #501](https://github.com/doc-detective/doc-detective/issues/501)). It is **not**
reproducible on an interactive local Windows session.

The current mitigation ([#500](../.github/workflows/fixtures.yml), ADR 01022) runs the `apps` group
in its own CI job so the two features never share a process. That unblocks CI but leaves the
interaction real for **any user** who mixes app surfaces and `tty` background processes in one run
on a comparable (service-session) Windows environment: the whole run hangs until an external
timeout.

The decisive technical fact: the freeze is a **synchronous native block inside `pty.spawn`** — it
wedges the libuv event loop itself (which is why *both* runners go silent simultaneously). Therefore
a same-thread `Promise.race([spawn, setTimeout])` **cannot** rescue it: the timer callback never
fires while the loop is blocked. Any watchdog must run **off the main thread**.

Root cause is environmental — the service session's console subsystem is left unable to allocate a
new pseudo-terminal, likely by NovaWindows' PowerShell/conhost backend (the job cleanup logs list
orphaned `conhost` and `node` processes; node-pty's `conpty_console_list_agent` logs `AttachConsole
failed`). It cannot be confirmed or fixed without a hosted runner, and the upstream driver is
third-party.

## Decision Drivers

* Convert an **unbounded process freeze into a bounded, observable step outcome** — valuable
  regardless of the exact upstream cause.
* **Never regress the happy path.** A Windows environment where `tty` works today must keep working,
  even if the watchdog machinery can't run there.
* Keep the existing **graceful-degradation model** for `tty`: node-pty is already an optional heavy
  dep whose absence yields a SKIP; a wedged ConPTY on a specific environment is closer to
  "unavailable here" than to user error.
* Be **testable locally** despite the bug only reproducing on hosted runners.
* Reduce the console-subsystem residue that triggers the wedge in the first place, where we can do
  so **safely** (only touching processes we can attribute to ourselves).

## Considered Options

1. **Same-thread timeout race** around `pty.spawn`. Rejected: impossible — a synchronous native
   block prevents the timer from firing.
2. **Child-process probe** of ConPTY allocation before the real spawn. Rejected: a child process has
   its *own* console subsystem, so it would allocate successfully even when *this* process is
   poisoned — a false "healthy" that still lets the real spawn freeze.
3. **Worker-thread probe** of ConPTY allocation before the real spawn. A worker thread shares this
   process's console subsystem, so it reproduces the exact poison; a probe that itself wedges is
   detectable via a main-thread timeout. **Chosen.**
4. **Full PTY-in-worker** — run the entire node-pty lifecycle in a worker and proxy
   `onData`/`onExit`/`write`/`kill`. Rejected for this phase: large, risky rewrite of the working
   PTY path for no extra safety over a probe.
5. **Teardown-only console hygiene** (kill NovaWindows' console orphans at app-session teardown).
   Kept as a **complementary** measure, not a standalone fix: it targets the root cause but is
   unverifiable locally and may not catch orphans that detached before we could attribute them.

## Decision Outcome

Chosen: **option 3 + option 5 together.**

**Watchdog (the guarantee).** Before the real `pty.spawn`, on `win32` only, probe ConPTY allocation
in a worker thread ([`src/core/ptyProbeWorker.ts`](../src/core/ptyProbeWorker.ts) driven by
[`src/core/ptyWatchdog.ts`](../src/core/ptyWatchdog.ts)). The worker allocates a throwaway ConPTY
(`cmd /d /s /c exit`) and reports back. The main thread classifies the result against a fixed ~15s
budget (`DOC_DETECTIVE_PTY_PROBE_TIMEOUT_MS` overrides it):

- **healthy** (probe exited fast) → proceed to the real spawn;
- **inconclusive** (worker errored / couldn't host the native addon / can't be created) → **also
  proceed** to the real spawn — the watchdog never *removes* capability;
- **wedged** (no verdict within budget — the #501 signature) → throw a `NODE_PTY_UNAVAILABLE`-tagged
  error, which `runShell` already maps to **SKIPPED**.

Only a genuine timeout degrades to SKIP; every other outcome falls through to today's behavior, so
the happy path cannot regress. A worker wedged in a native call may not terminate promptly — we fire
`terminate()` and move on; a leaked worker thread is reaped at process exit, which is strictly better
than a frozen run.

**Teardown hygiene (defense-in-depth).** In `teardownAppSession`
([`src/core/tests/appSurface.ts`](../src/core/tests/appSurface.ts)), on Windows, snapshot the app
Appium server's descendant pids *before* the tree-kill, then force-reap any of *that set* still
alive afterward (descendants that detached from the tree and survived). It only ever touches
processes descended from our own server — never an image-name sweep across the machine.

### Consequences

* Good: a `tty` step on a poisoned Windows environment now lands **SKIPPED** with a clear,
  #501-referencing reason instead of hanging the run. The `apps` + `process` fixture groups can be
  re-paired in one process to validate the fix end-to-end on a hosted runner.
* Good: happy-path Windows `tty` steps are unchanged in outcome (they pay a one-time throwaway-ConPTY
  probe of well under a second).
* Neutral: a new worker file ships in `dist/core`; POSIX is entirely unaffected (the gate returns
  immediately off `win32`).
* Bad / accepted: the watchdog treats *any* >15s ConPTY allocation as wedged. A genuinely healthy
  environment that takes longer than the budget would see a false SKIP; the budget is generous
  (healthy allocation is sub-second) and env-overridable.

### Confirmation

* Unit tests: [`test/pty-watchdog.test.js`](../test/pty-watchdog.test.js) covers every probe outcome
  (healthy / inconclusive / error / exit / wedged / worker-uncreatable), a real end-to-end worker
  round-trip, and the `assertConptyAllocatable` SKIP gate (throws `NODE_PTY_UNAVAILABLE` only on
  wedged, only on `win32`, only with a resolved backend path).
* Teardown-hygiene tests in [`test/app-surface.test.js`](../test/app-surface.test.js): descendant
  walk, failed-query tolerance, reap-only-live, Windows gating, and the snapshot-before-kill /
  reap-after ordering through `teardownAppSession`.
* End-to-end: the previously-freezing [`type-to-process-tty.spec.json`](../test/core-artifacts/process/type-to-process-tty.spec.json)
  fixture now degrades to SKIPPED (via `onSkip: stop test`) rather than freezing when ConPTY won't
  allocate — verifiable by re-pairing the `apps` + `process` groups on a hosted Windows runner.

## Pros and Cons of the Options

### Option 3 — worker-thread probe (chosen)

* Good: shares the process console, so it reproduces the poison and detects the wedge.
* Good: safe-by-default — inconclusive/uncreatable never removes capability.
* Good: locally unit-testable via an injected worker + injected probe.
* Bad: a worker stuck in native code may not `terminate()` promptly (accepted — main thread proceeds;
  OS reaps at exit).

### Option 2 — child-process probe

* Bad: separate console subsystem → false "healthy" → real spawn still freezes. Fatal.

### Option 4 — full PTY-in-worker

* Good: would also bound the *running* PTY, not just allocation.
* Bad: large rewrite of a working path; cross-thread proxying of the PTY stream/lifecycle; no extra
  safety over a probe for the observed failure (which is at *allocation*).

### Option 5 — teardown hygiene alone

* Good: targets the root cause; cheap; safe when scoped to attributable descendants.
* Bad: unverifiable locally; can't catch orphans that detached before attribution — insufficient as
  the sole fix, hence paired with the watchdog.
