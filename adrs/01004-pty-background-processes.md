---
status: accepted
date: 2026-06-24
decision-makers: doc-detective maintainers
---

# PTY-backed background processes (full TUIs, Phase 2)

## Context and Problem Statement

Phase 1 (ADR 01003) lets a `type` step send keystrokes to a `background` process over its **stdin
pipe**. That is enough for line-oriented REPLs, such as `node -i` or a database shell. It isn't
enough for full-screen interactive TUIs. Ink and React apps, and tools like the `claude` CLI, check
`process.stdout.isTTY`. They refuse to render, or to accept keystrokes, when their stdio is a pipe
rather than a terminal. Driving them from a doc test requires a **pseudo-terminal (PTY)**.

We want to unlock the original multi-surface goal: driving a real TUI end-to-end. That's start →
type with arrow keys or `$CTRL$` over a real terminal → wait for output → close. It must not break
the Phase 1 pipe path, or force every install to carry a heavy native dependency.

## Decision Drivers

* Reuse the **unchanged** `type`→process surface API. The control-byte map already emits the bytes
  a terminal expects, mapping `$ENTER$` to `\r`, arrows to ANSI, and `$CTRL$`+c to `\x03`. So the
  input path needs no changes. A PTY is a spawn-time concern only.
* Keep the new capability **opt-in**, so existing background specs keep their exact pipe behavior.
* Keep `node-pty` **out of the lockfile**. It's a native dep with platform-specific prebuilt
  binaries, and ConPTY on Windows. Register and lazily load it like the other heavy deps,
  webdriverio and appium, rather than as a normal `optionalDependencies` entry.
* **Graceful degradation.** When `node-pty` can't be loaded, the step must SKIP, never FAIL. Then
  fixtures stay PASS or SKIPPED, and lean installs aren't broken.
* The PTY handle must be a **drop-in** `BackgroundProcess` so readiness (`waitUntil`) and teardown
  work unchanged.

## Considered Options

* **A. Opt-in `background.tty` boolean that spawns through lazily-loaded `node-pty`; SKIP on absence;
  `type` path unchanged** (chosen).
* **B. Always spawn background processes under a PTY** (drop the pipe path).
* **C. A separate step / surface kind dedicated to TUIs.**

## Decision Outcome

Chosen option: **A**. A single opt-in boolean adds PTY support with zero churn to the Phase 1
surface API. It also costs nothing for specs that don't ask for it. Option **B** would make
`node-pty` a hard
dependency of *all* background processes. That breaks lean installs, and changes the
merged-versus-split stream contract for existing specs. Option **C** duplicates the `type`,
`background`, and `closeSurface` machinery for no benefit. The only difference is the spawn
mechanism.

Mechanism:

1. **Schema: `background.tty` boolean (default `false`)** added to the `background` object in both
   `runShell_v3` and `runCode_v3`. `additionalProperties:false` already guards the object, so adding
   the property is the whole schema change. The description documents the `node-pty` requirement, the
   SKIP-on-absence behavior, and that **stdout/stderr are merged into one stream** in PTY mode.
2. **The PTY backend is `@homebridge/node-pty-prebuilt-multiarch`, registered as a heavy dep rather
   than a lockfile entry.** We deliberately do NOT depend on upstream `microsoft/node-pty`. It has
   no Windows prebuilt binary, and its source build fails on a bare GitHub runner. Its macOS
   prebuild also ships the `spawn-helper` without the execute bit, per
   [microsoft/node-pty#850](https://github.com/microsoft/node-pty/issues/850). That gives
   `posix_spawnp failed` at spawn time on macOS arm64. The prebuilt-multiarch fork is an
   API-identical parallel fork. It ships working prebuilt binaries for macOS, including arm64, plus
   Windows and Linux, across Node ABIs, with Node 24 since v0.13.1. So the PTY path actually RUNS on
   every CI platform, instead of degrading to SKIP. It is added to `HEAVY_NPM_DEPS` in
   `src/runtime/heavyDeps.ts`, and given a version in a `ddRuntimeDependencies` field in
   `package.json`. npm ignores that custom field, so the lockfile is untouched, and
   `npm i doc-detective` doesn't drag a native module into every install. `getDeclaredVersion` reads
   `ddRuntimeDependencies` first. So `scripts/postinstall.js` and `doc-detective install all`
   install it alongside webdriverio and appium, and the runtime loader installs it on demand. It is
   also listed in `BEST_EFFORT_NPM_DEPS`, so a missing prebuilt for an exotic platform or arch can't
   abort the whole `install all` batch. That's a safety net, rather than the expected path. This is
   the same model as the other heavy deps. Only the declaration field differs, to avoid the lockfile
   churn that adding a brand-new `optionalDependencies` entry caused.
3. **`spawnPtyBackgroundCommand`** lives in `src/core/utils.ts`. It's an async
   `BackgroundProcess`-compatible PTY handle. It loads the PTY backend through
   `loadHeavyDep("@homebridge/node-pty-prebuilt-multiarch", { ctx: { cacheDir } })`, with the
   default `autoInstall`. When `node-pty` can't be resolved or installed, meaning no prebuilt binary
   for the platform or arch, it **rejects**, and the caller maps that to SKIP. It spawns through the
   platform shell, for parity with the pipe path's `{ shell: true }`. That's
   `cmd.exe /d /s /c <cmd+args>` on Windows, and `/bin/sh -c <cmd+args>` on POSIX. It appends the
   quoted `args` to the command string, so the `args` field still works. A PTY is **one merged
   stream**. `onData` feeds the single `stdout` ring buffer, capped by `BACKGROUND_BUFFER_LIMIT`.
   `getStderr()` returns `""`, and `getCombined()` returns stdout. That keeps `waitForStdio`, which
   is `getStdout()||getStderr()`, and `waitForReady` working unchanged. `write` guards against
   post-exit writes. `exited` resolves through `onExit`. `pid` is the PTY pid, and `isPty` is
   `true`. `kill()` wraps `pty.kill()`, swallowing errors.
4. **The `BackgroundProcess` interface widens**, in `src/core/utils.ts`. `child?` is now optional,
   since a PTY has no `ChildProcess`. Two optional members are added:
   `kill?(): Promise<void> | void` and `isPty?: boolean`.
5. **`runShell` branches on `background.tty`**, in `src/core/tests/runShell.ts`. When set, it
   `await`s `spawnPtyBackgroundCommand(...)` inside a try/catch. The catch SKIPs **only** the tagged
   `NODE_PTY_UNAVAILABLE` case, where node-pty is absent or uninstallable. Any other PTY startup
   error, such as a bad cwd or a spawn failure, returns FAIL, so it isn't hidden as
   optional-dependency absence. Otherwise it uses the pipe-backed `spawnBackgroundCommand` exactly
   as before. `runCode` needs no change. It forwards the whole `background` object, including
   `tty`, to `runShell`.
6. **PTY-aware teardown.** Three teardown sites prefer `bg.kill()` when present, else the existing
   tree-kill on `bg.pid`: `closeSurface` (`src/core/tests/closeSurface.ts`), `killAllRegistered`
   (`src/core/tests.ts`), and `runShell`'s readiness-failure cleanup. A PTY owns its own termination
   via `pty.kill()` and has no shell-tree pid to tree-kill, so the `kill()` abstraction is the
   uniform teardown contract.
7. **`type` / `closeSurface` / `surface` are untouched.** The control-byte translation already emits
   terminal-correct bytes, so the same keystrokes drive a pipe REPL or a PTY TUI.

## Consequences

* **Good.** Doc tests can drive full-screen TUIs, the original goal, with the same `type`→process
  API as line REPLs. Only the opener opts in, through `tty:true`.
* **Good.** Pipe behavior is byte-for-byte unchanged for specs that don't set `tty`. Lean installs
  without `node-pty` still run those.
* **Good.** Absence is a SKIP rather than a FAIL. So fixtures stay PASS or SKIPPED, and CI on a
  runner without a prebuilt `node-pty` binary degrades cleanly.
* **Trade-off: a merged stream.** A PTY exposes a single stream, so in `tty` mode `stderr` is folded
  into `stdout`, and `getStderr()` is empty. Readiness `stdio` matching is unaffected, since it
  already ORs the two streams. But specs that distinguish stderr from stdout can't do so under a
  PTY.
* **Trade-off: a native dep, and platform reach.** `node-pty` is a native module. Its availability
  depends on a prebuilt binary for the runner's platform and arch, and Windows uses ConPTY. When it
  isn't available, the feature SKIPs rather than works. Always spawning through the shell avoids
  some Windows ConPTY edge cases, such as spawning a quoted interactive exe directly.
* **Platform capability SKIPs rather than FAILs.** Two failures are BOTH treated as "PTY unavailable
  here", and tagged `NODE_PTY_UNAVAILABLE`, so the step SKIPs. Those are node-pty failing to LOAD,
  with no prebuilt binary, and failing to CREATE a PTY, where `pty.spawn` throws. The latter shows
  up as `posix_spawnp failed` from a prebuilt spawn-helper that doesn't work on some macOS arm64
  runners. A genuinely bad command or cwd still surfaces as a readiness failure, and FAILs. So PTY
  runs where node-pty is fully functional, such as Linux CI, and degrades to SKIP elsewhere.
* **Known limitation: Windows `args` with `tty`.** On Windows, node-pty's ConPTY agent re-quotes the
  shell command line it builds. That collides with the quoting we add for the `args` field. So
  `command` strings work everywhere. But passing arguments through the `args` field together with
  `tty` can mis-quote on Windows. That also affects `runCode`, which routes its script path through
  `args`. The cross-platform path is to put everything in `command`. A node-pty verbatim-args fix,
  and a `runCode` PTY real-runner fixture, are tracked as follow-ups.
* **Neutral.** `tty:true` with no `node-pty` does not warn loudly. The SKIP description carries the
  reason, and names the dependency.

## Confirmation

* Schema tests in `src/common/test/validate.test.js` check that `background` accepts `tty:true`,
  `tty:false`, and `tty` with `waitUntil`. They also check it rejects a non-boolean `tty`. That
  covers both `runShell` and `runCode`.
* Unit (`test/background-process.test.js`), skip-guarded on `node-pty` availability:
  a PTY makes the child see a TTY (`process.stdout.isTTY` → `true`, `isPty:true`, empty `getStderr()`,
  `getCombined()===getStdout()`); a `write` + `waitForOutputMatch` round-trip over `node -i`
  (`2+2\r` → `4`); `kill()` terminates the PTY (`exited` resolves).
* End-to-end, `test/core-artifacts/type-to-process-tty.spec.json` starts `node -i` under
  `tty:true`. It types `2 + 2` plus `$ENTER$` to the surface, waits until the terminal shows `4`,
  and closes it. It resolves **PASS** where `node-pty` is present, and **SKIPPED** otherwise, as the
  runShell SKIP propagates. So the combined `test/core-core.test.js` `concurrentRunners=2` pass
  stays green either way. A focused `it` in `test/core-core.test.js` asserts the absence path: with `node-pty`
  unresolvable, a `tty:true` background start yields a step `SKIPPED` whose description mentions
  `node-pty`.

## Pros and Cons of the Options

### A. Opt-in `background.tty` boolean spawning through a lazily-loaded `node-pty` (chosen)

* Good: zero churn to the Phase 1 surface API. `type`, `waitUntil`, and `closeSurface` are
  unchanged.
* Good: no cost to specs that don't set `tty`. Pipe behavior is byte-for-byte unchanged.
* Good: `node-pty` stays out of the lockfile, registered through `ddRuntimeDependencies` and
  `HEAVY_NPM_DEPS`. So a brand-new native dep doesn't churn the lock, and absence degrades to SKIP.
* Bad: it's a native dep. Availability depends on a prebuilt binary for the runner's platform and
  arch.
* Bad: a PTY merges stdout and stderr into one stream. The Windows `args` with `tty` ConPTY quoting
  limitation applies, so use the `command` string.

### B. Always spawn background processes under a PTY (drop the pipe path)

* Good: one code path for every background process, with no `tty` knob.
* Bad: it makes `node-pty` a hard dependency of *all* background processes, breaking lean installs.
* Bad: it changes the merged-versus-split stream contract for every existing spec, a breaking
  change. It also pays PTY overhead even for non-interactive processes.

### C. A separate step / surface kind dedicated to TUIs

* Good: an explicit, discoverable surface abstraction for TUI processes.
* Bad: it duplicates the `type`, `background`, and `closeSurface` machinery for no benefit. The only
  real difference from a normal background process is the spawn mechanism, which option A captures
  with one boolean.
