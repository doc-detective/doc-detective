---
status: accepted
date: 2026-07-05
decision-makers: doc-detective maintainers
---

# Guard the `tty` spawn path: on-disk backend verification with self-heal, plus a worker-thread ConPTY watchdog

## Context and Problem Statement

On GitHub-hosted Windows runners, once a native **app-surface** context (NovaWindows /
`startSurface`, phase A1 — [ADR 01021](01021-native-app-surfaces-windows-a1.md)) had run in a Node
process, the **first later** `pty.spawn` — a `runShell` step with `background.tty: true` (a ConPTY
allocation via `@homebridge/node-pty-prebuilt-multiarch`) — **froze the entire process**
([issue #501](https://github.com/doc-detective/doc-detective/issues/501)). Deterministic 4/4 across
jobs; the log's last line was the step's own debug print, then 66 minutes of silence until the job
timeout.

The root cause was found by local reproduction (see [ADR 01025](01025-non-destructive-runtime-cache-installs.md)
for the underlying install bug and its fix):

1. Early in the process, node-pty is loaded and used successfully (mocha unit tests).
2. Mid-run, the app-surface preflight JIT-installs the NovaWindows driver into the runtime cache.
   That `npm install` **pruned every sibling package**, deleting node-pty's ~330 JS files from disk.
   Only the OS-locked, memory-mapped `conpty.node` native binary survives (Windows will not delete a
   mapped DLL — reproduced identically with a lock-tolerant delete).
3. At the later `tty` step, `loadHeavyDep` succeeds anyway: the stale `Module._pathCache` resolution
   and the ESM module cache serve the in-memory module without touching disk.
4. `pty.spawn` then runs against a package whose spawn-time support files (node-pty's conout worker)
   no longer exist, and blocks **synchronously and forever** inside a native wait — the event loop
   itself is wedged, so no timer, log line, or step result can ever fire. This matches the
   long-standing upstream freeze class at the native connect
   ([microsoft/node-pty#640](https://github.com/microsoft/node-pty/issues/640),
   [#532](https://github.com/microsoft/node-pty/issues/532): `ConnectNamedPipe(hIn/hOut, nullptr)`
   runs inline on the calling thread with no timeout in `src/win/conpty.cc`).

The local reproduction (`load → use → prune-all-but-locked-files → spawn`) froze at exactly the same
point **on an interactive Windows 11 session** — the original "only on service sessions / console
poisoning" hypothesis was wrong. It appeared environment-specific only because dev machines already
had the driver cached (no mid-run install → no prune → no freeze), while fresh CI runners always
installed it mid-run. Synthetic console-poisoning experiments (tree-killing PowerShell trees,
force-killing the conhost behind a live ConPTY, leaking pseudoconsoles) all left later allocations
healthy, further refuting the original hypothesis.

[ADR 01025](01025-non-destructive-runtime-cache-installs.md) removes the root cause (installs no
longer prune siblings). This ADR decides what the `tty` spawn path itself must do so that **no
cache state — past, present, or externally inflicted — can turn a `tty` step into a frozen
process.**

## Decision Drivers

* A wrong cache state must produce a **bounded, observable step outcome**, never an unbounded
  freeze: the freeze is strictly worse than any failure (it silences concurrent runners and burns
  the full job timeout).
* Prefer **self-healing** over skipping: if the backend's files can be restored, the step should
  PASS.
* **Never regress the happy path**: a healthy environment must behave exactly as before.
* The upstream ConPTY hazard class is real and unresolved (freezes at the synchronous native
  connect, reported since 2019); a defense that catches "wedged for reasons we did not foresee" has
  standalone value.
* Testable locally (the freeze itself reproduces in seconds with the prune recipe).

## Considered Options

1. **On-disk backend verification with forced-reinstall self-heal** before every PTY spawn.
2. **Worker-thread ConPTY probe** with a timeout, degrading a wedged allocation to SKIP.
3. Same-thread timeout race around `pty.spawn` — impossible: the block is synchronous, the timer
   can never fire.
4. Child-process probe — a fresh process has its own healthy console and module tree, so it cannot
   see either the stale-module state or an in-process wedge: false "healthy".
5. Re-import after reinstall (tear down and reload the module) — ESM has no cache invalidation; the
   reloaded URL returns the same module. Restoring the files at the same paths (option 1) achieves
   the working state without fighting the loader.

## Decision Outcome

Chosen: **options 1 + 2 together**, as two layers in `spawnPtyBackgroundCommand`
([src/core/utils.ts](../src/core/utils.ts)):

**Layer 1 — `ensurePtyBackendOnDisk`** ([src/core/ptyWatchdog.ts](../src/core/ptyWatchdog.ts)), all
platforms: after `loadHeavyDep` returns, verify the backend's resolved entry **physically exists on
disk** — a loaded module is *not* proof, per the mechanism above. If the files are missing, force a
reinstall (`ensureRuntimeInstalled(..., force: true)`); the files return at the same paths, so the
already-loaded module becomes safe to spawn. Only if the reinstall cannot restore them does the step
degrade to **SKIPPED** via the existing `NODE_PTY_UNAVAILABLE` channel. Verified end-to-end against
the reproduced freeze: pre-fix the recipe froze forever; post-fix the same recipe heals and the
spawn completes in ~2.5 s.

**Layer 2 — `assertConptyAllocatable`**, Windows only: probe ConPTY allocation in a **worker
thread** (a worker shares the process state a child process wouldn't; an off-thread probe is the
only shape that can observe a synchronous main-thread freeze) with a ~15 s budget
(`DOC_DETECTIVE_PTY_PROBE_TIMEOUT_MS` overrides). Outcomes: healthy → proceed; *inconclusive*
(worker errored / cannot host the addon) → proceed (the watchdog never removes capability);
**wedged** (no verdict in budget) → SKIP. This layer no longer carries #501 by itself — layer 1
catches the known mechanism — but it bounds the documented upstream freeze class and any future
unknown wedge.

The app-session teardown additionally sweeps console orphans the server tree-kill missed
(`snapshotAppServerDescendants` / `reapConsoleOrphans` in
[src/core/tests/appSurface.ts](../src/core/tests/appSurface.ts)): hygiene for lingering
`conhost.exe` processes ([microsoft/terminal#4050](https://github.com/microsoft/terminal/issues/4050)),
retained even though console state proved not to be the freeze mechanism.

### Consequences

* Good: the #501 pairing (app surface + `tty` in one process) now completes — healing to PASS on
  the reproduced mechanism, SKIP only when the backend genuinely cannot be provisioned.
  [test/core-artifacts/apps/app-then-tty.spec.json](../test/core-artifacts/apps/app-then-tty.spec.json)
  pins the interleaving in CI permanently.
* Good: any *other* path to a wedged ConPTY still lands as a bounded SKIP instead of a 90-minute
  job death.
* Neutral: healthy Windows `tty` steps pay one `fs.existsSync` plus a sub-second throwaway-ConPTY
  probe.
* Bad / accepted: a healthy environment slower than the probe budget would see a false SKIP; the
  budget is generous (healthy allocation is sub-second) and env-overridable.

### Confirmation

* [test/pty-watchdog.test.js](../test/pty-watchdog.test.js): `ensurePtyBackendOnDisk` (present /
  stale-healed / unresolvable-healed / reinstall-fails → `NODE_PTY_UNAVAILABLE` / never-materializes
  → same), every probe outcome, a real worker round trip, and the `assertConptyAllocatable` gating.
* Teardown-sweep tests in [test/app-surface.test.js](../test/app-surface.test.js).
* Mechanism-level dogfood (scripted, documented in #501): load → use → prune-except-locked →
  `spawnPtyBackgroundCommand` heals and completes; the same recipe without the fix freezes forever.

## Pros and Cons of the Options

### Option 1 — on-disk verification + self-heal (chosen)

* Good: directly targets the proven mechanism; converts it to PASS, not SKIP.
* Good: platform-independent; also protects POSIX PTY spawns from pruned support files.
* Bad: a forced reinstall mid-step adds seconds of latency in the (rare) pruned state.

### Option 2 — worker-thread probe (chosen, as defense-in-depth)

* Good: the only construction that can observe a synchronous main-thread freeze in time to skip it.
* Good: safe-by-default (inconclusive never removes capability).
* Bad: cannot catch the stale-module case on its own (the probe's fresh import fails → inconclusive
  → proceed) — which is why layer 1 exists and runs first.

### Option 3 — same-thread race

* Fatal: the timer shares the blocked event loop; it can never fire.

### Option 4 — child-process probe

* Fatal: fresh process state → false "healthy" for both the stale-module case and in-process wedges.

### Option 5 — re-import after reinstall

* Fatal in practice: ESM offers no module-cache invalidation; the "fresh" import is the same stale
  module object. Restoring files under the loaded module (option 1) is the workable equivalent.
