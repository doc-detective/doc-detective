---
status: accepted
date: 2026-06-24
decision-makers: doc-detective maintainers
---

# PTY-backed background processes (full TUIs, Phase 2)

## Context and Problem Statement

Phase 1 (ADR 01003) lets a `type` step send keystrokes to a `background` process over its **stdin
pipe**. That is enough for line-oriented REPLs (`node -i`, a database shell), but not for full-screen
interactive TUIs. Ink/React apps and tools like the `claude` CLI check `process.stdout.isTTY` and
refuse to render — or to accept keystrokes — when their stdio is a pipe rather than a terminal.
Driving them from a doc test requires a **pseudo-terminal (PTY)**.

We want to unlock the original multi-surface goal — driving a real TUI end-to-end (start → type with
arrow keys / `$CTRL$` over a real terminal → wait for output → close) — without breaking the Phase 1
pipe path, and without forcing every install to carry a heavy native dependency.

## Decision Drivers

* Reuse the **unchanged** `type`→process surface API. The control-byte map (`$ENTER$`→`\r`,
  arrows→ANSI, `$CTRL$`+c→`\x03`) already emits the bytes a terminal expects, so the input path needs
  no changes — a PTY is a spawn-time concern only.
* Keep the new capability **opt-in** so existing background specs keep their exact pipe behavior.
* Keep `node-pty` (a native dep with platform-specific prebuilt binaries / ConPTY on Windows) **out
  of the critical install path** — lazily loaded, like the other heavy deps.
* **Graceful degradation:** when `node-pty` can't be loaded, the step must SKIP — never FAIL — so
  fixtures stay PASS/SKIPPED and lean installs aren't broken.
* The PTY handle must be a **drop-in** `BackgroundProcess` so readiness (`waitUntil`) and teardown
  work unchanged.

## Considered Options

* **A. Opt-in `background.tty` boolean that spawns through lazily-loaded `node-pty`; SKIP on absence;
  `type` path unchanged** (chosen).
* **B. Always spawn background processes under a PTY** (drop the pipe path).
* **C. A separate step / surface kind dedicated to TUIs.**

## Decision Outcome

Chosen option: **A**. A single opt-in boolean adds PTY support with zero churn to the Phase 1 surface
API and zero cost to specs that don't ask for it. Option **B** would make `node-pty` a hard
dependency of *all* background processes (breaking lean installs and changing the merged-vs-split
stream contract for existing specs). Option **C** duplicates the `type`/`background`/`closeSurface`
machinery for no benefit — the only difference is the spawn mechanism.

Mechanism:

1. **Schema: `background.tty` boolean (default `false`)** added to the `background` object in both
   `runShell_v3` and `runCode_v3`. `additionalProperties:false` already guards the object, so adding
   the property is the whole schema change. The description documents the `node-pty` requirement, the
   SKIP-on-absence behavior, and that **stdout/stderr are merged into one stream** in PTY mode.
2. **`spawnPtyBackgroundCommand`** (`src/core/utils.ts`), an async `BackgroundProcess`-compatible PTY
   handle. It loads `node-pty` via the existing `loadHeavyDep("node-pty", { ctx: { cacheDir } })`
   pattern; on failure it **rejects** (the caller maps that to SKIP). It spawns through the platform
   shell for parity with the pipe path's `{ shell: true }` — `cmd.exe /c <cmd+args>` on Windows,
   `/bin/sh -c <cmd+args>` on POSIX — appending the (quoted) `args` to the command string so the
   `args` field still works. PTY = **one merged stream**: `onData` feeds the single `stdout` ring
   buffer (`BACKGROUND_BUFFER_LIMIT`-capped), `getStderr()` returns `""`, `getCombined()` returns
   stdout — which keeps `waitForStdio` (`getStdout()||getStderr()`) and `waitForReady` working
   unchanged. `write` guards against post-exit writes; `exited` resolves via `onExit`; `pid` is the
   PTY pid; `isPty:true`; `kill()` wraps `pty.kill()` (errors swallowed).
3. **`BackgroundProcess` interface widened** (`src/core/utils.ts`): `child?` is now optional (a PTY
   has no `ChildProcess`), and two optional members are added — `kill?(): Promise<void> | void` and
   `isPty?: boolean`.
4. **`runShell` branches on `background.tty`** (`src/core/tests/runShell.ts`). When set, it
   `await`s `spawnPtyBackgroundCommand(...)` inside a try/catch; a load failure sets
   `status:"SKIPPED"` with a description that names `node-pty` and returns — graceful skip, not a
   FAIL. Otherwise it uses the pipe-backed `spawnBackgroundCommand` exactly as before. `runCode`
   needs no change: it forwards the whole `background` object (incl. `tty`) to `runShell`.
5. **PTY-aware teardown.** Three teardown sites prefer `bg.kill()` when present, else the existing
   tree-kill on `bg.pid`: `closeSurface` (`src/core/tests/closeSurface.ts`), `killAllRegistered`
   (`src/core/tests.ts`), and `runShell`'s readiness-failure cleanup. A PTY owns its own termination
   via `pty.kill()` and has no shell-tree pid to tree-kill, so the `kill()` abstraction is the
   uniform teardown contract.
6. **`type` / `closeSurface` / `surface` are untouched.** The control-byte translation already emits
   terminal-correct bytes, so the same keystrokes drive a pipe REPL or a PTY TUI.

## Consequences

* **Good** — doc tests can drive full-screen TUIs (the original goal) with the same `type`→process
  API as line REPLs; only the opener opts in via `tty:true`.
* **Good** — pipe behavior is byte-for-byte unchanged for specs that don't set `tty`; lean installs
  without `node-pty` still run those.
* **Good** — absence is a SKIP, not a FAIL, so fixtures stay PASS/SKIPPED and CI on a runner without
  a prebuilt `node-pty` binary degrades cleanly.
* **Trade-off (merged stream)** — a PTY exposes a single stream, so in `tty` mode `stderr` is folded
  into `stdout` (`getStderr()` is empty). Readiness `stdio` matching is unaffected (it already ORs
  the two streams), but specs that distinguish stderr from stdout can't do so under a PTY.
* **Trade-off (native dep / platform)** — `node-pty` is a native module; its availability depends on
  a prebuilt binary for the runner's platform/arch (Windows uses ConPTY). When it isn't available the
  feature SKIPs rather than works. Some Windows ConPTY edge cases (e.g. spawning a quoted interactive
  exe directly) are avoided by always spawning through the shell.
* **Neutral** — `tty:true` with no `node-pty` does not warn loudly; the SKIP description carries the
  reason and names the dependency.

## Confirmation

* Schema (`src/common/test/validate.test.js`): `background` accepts `tty:true`, `tty:false`, and
  `tty` + `waitUntil`, and rejects a non-boolean `tty` — for both `runShell` and `runCode`.
* Unit (`test/background-process.test.js`), skip-guarded on `node-pty` availability:
  a PTY makes the child see a TTY (`process.stdout.isTTY` → `true`, `isPty:true`, empty `getStderr()`,
  `getCombined()===getStdout()`); a `write` + `waitForOutputMatch` round-trip over `node -i`
  (`2+2\r` → `4`); `kill()` terminates the PTY (`exited` resolves).
* End-to-end: `test/core-artifacts/type-to-process-tty.spec.json` starts `node -i` under
  `tty:true`, types `2 + 2`+`$ENTER$` to the surface, waits until the terminal shows `4`, and closes
  it — resolving **PASS** where `node-pty` is present and **SKIPPED** otherwise (the runShell SKIP
  propagates), so the combined `test/core-core.test.js` `concurrentRunners=2` pass stays green either
  way. A focused `it` in `test/core-core.test.js` asserts the absence path: with `node-pty`
  unresolvable, a `tty:true` background start yields a step `SKIPPED` whose description mentions
  `node-pty`.
