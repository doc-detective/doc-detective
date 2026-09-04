---
status: accepted
date: 2026-07-05
decision-makers: doc-detective maintainers
---

# Guard the `tty` spawn path: on-disk backend verification with self-heal, plus a worker-thread ConPTY watchdog

## Context and Problem Statement

On GitHub-hosted Windows runners, a native **app-surface** context could run in a Node process. That
means NovaWindows and `startSurface`, phase A1, per
[ADR 01021](01021-native-app-surfaces-windows-a1.md). After that, the **first later** `pty.spawn`
**froze the entire process**. That spawn is a `runShell` step with `background.tty: true`, a ConPTY
allocation through `@homebridge/node-pty-prebuilt-multiarch`. See
[issue #501](https://github.com/doc-detective/doc-detective/issues/501). It was deterministic, 4 of 4
across jobs. The log's last line was the step's own debug print, then 66 minutes of silence until
the job timeout.

The root cause was found by local reproduction (see [ADR 01025](01025-non-destructive-runtime-cache-installs.md)
for the underlying install bug and its fix):

1. Early in the process, node-pty is loaded and used successfully (mocha unit tests).
2. Mid-run, the app-surface preflight JIT-installs the NovaWindows driver into the runtime cache.
   That `npm install` **pruned every sibling package**, deleting node-pty's ~330 JS files from disk.
   Only the OS-locked, memory-mapped `conpty.node` native binary survives, since Windows will not
   delete a mapped DLL. That reproduced identically with a lock-tolerant delete.
3. At the later `tty` step, `loadHeavyDep` succeeds anyway: the stale `Module._pathCache` resolution
   and the ESM module cache serve the in-memory module without touching disk.
4. `pty.spawn` then runs against a package whose spawn-time support files no longer exist. Those are
   node-pty's conout worker. It blocks **synchronously and forever** inside a native wait. The event
   loop itself is wedged, so no timer, log line, or step result can ever fire. This matches the
   long-standing upstream freeze class at the native connect. See
   [microsoft/node-pty#640](https://github.com/microsoft/node-pty/issues/640) and
   [#532](https://github.com/microsoft/node-pty/issues/532). `ConnectNamedPipe(hIn/hOut, nullptr)`
   runs inline on the calling thread with no timeout in `src/win/conpty.cc`.

The local reproduction was `load → use → prune-all-but-locked-files → spawn`. It froze at exactly
the same point **on an interactive Windows 11 session**. So the original "only on service sessions,
or console poisoning" hypothesis was wrong. It appeared environment-specific only because dev
machines already had the driver cached, so no mid-run install meant no prune and no freeze. Fresh CI
runners always installed it mid-run. Synthetic console-poisoning experiments all left later
allocations healthy, further refuting the original hypothesis. Those tree-killed PowerShell trees,
force-killed the conhost behind a live ConPTY, and leaked pseudoconsoles.

[ADR 01025](01025-non-destructive-runtime-cache-installs.md) removes the root cause, since installs
no longer prune siblings. This ADR decides what the `tty` spawn path itself must do, so that **no
cache state can turn a `tty` step into a frozen process.** That covers past, present, and
externally inflicted state.

## Decision Drivers

* A wrong cache state must produce a **bounded, observable step outcome**, never an unbounded
  freeze. The freeze is strictly worse than any failure. It silences concurrent runners, and burns
  the full job timeout.
* Prefer **self-healing** over skipping: if the backend's files can be restored, the step should
  PASS.
* **Never regress the happy path**: a healthy environment must behave exactly as before.
* The upstream ConPTY hazard class is real and unresolved. It freezes at the synchronous native
  connect, and has been reported since 2019. A defense that catches "wedged for reasons we did not
  foresee" has standalone value.
* Testable locally (the freeze itself reproduces in seconds with the prune recipe).

## Considered Options

1. **On-disk backend verification with forced-reinstall self-heal** before every PTY spawn.
2. **Worker-thread ConPTY probe** with a timeout, degrading a wedged allocation to SKIP.
3. A same-thread timeout race around `pty.spawn`. That's impossible. The block is synchronous, so
   the timer can never fire.
4. A child-process probe. A fresh process has its own healthy console and module tree. So it cannot
   see either the stale-module state or an in-process wedge, and reports a false "healthy".
5. Re-import after reinstall, tearing down and reloading the module. ESM has no cache invalidation,
   and the reloaded URL returns the same module. Restoring the files at the same paths, option 1,
   achieves the working state without fighting the loader.

## Decision Outcome

Chosen: **options 1 + 2 together**, as two layers in `spawnPtyBackgroundCommand`
([src/core/utils.ts](../src/core/utils.ts)):

**Layer 1 is `ensurePtyBackendOnDisk`**, in [src/core/ptyWatchdog.ts](../src/core/ptyWatchdog.ts),
on all platforms. After `loadHeavyDep` returns, it verifies the backend's resolved entry
**physically exists on disk**. A loaded module is *not* proof, per the mechanism above. If the files
are missing, it forces a reinstall with `ensureRuntimeInstalled(..., force: true)`. The files return
at the same paths, so the already-loaded module becomes safe to spawn. Only if the reinstall cannot
restore them does the step degrade to **SKIPPED**, through the existing `NODE_PTY_UNAVAILABLE`
channel. It's verified end-to-end against the reproduced freeze. Pre-fix, the recipe froze forever.
Post-fix, the same recipe heals and the spawn completes in ~2.5 s.

**Layer 2 is `assertConptyAllocatable`**, Windows only. It probes ConPTY allocation in a **worker
thread**, with a ~15 s budget that `DOC_DETECTIVE_PTY_PROBE_TIMEOUT_MS` overrides. A worker shares
the process state a child process wouldn't. An off-thread probe is the only shape that can observe
a synchronous main-thread freeze. There are three outcomes. Healthy proceeds. *Inconclusive*
also proceeds, since the watchdog never removes capability, and covers a worker that errored or
cannot host the addon. **Wedged**, meaning no verdict in budget, SKIPs. This layer no longer carries
#501 by itself, since layer 1 catches the known mechanism. But it bounds the documented upstream
freeze class, and any future unknown wedge.

The app-session teardown additionally sweeps console orphans the server tree-kill missed. That's
`snapshotAppServerDescendants` and `reapConsoleOrphans` in
[src/core/tests/appSurface.ts](../src/core/tests/appSurface.ts). It's hygiene for lingering
`conhost.exe` processes, per
[microsoft/terminal#4050](https://github.com/microsoft/terminal/issues/4050). It's retained even
though console state proved not to be the freeze mechanism.

### Consequences

* Good: the #501 pairing, an app surface plus `tty` in one process, now completes. It heals to PASS
  on the reproduced mechanism, and SKIPs only when the backend genuinely cannot be provisioned.
  [test/core-artifacts/apps/app-then-tty.spec.json](../test/core-artifacts/apps/app-then-tty.spec.json)
  pins the interleaving in CI permanently.
* Good: any *other* path to a wedged ConPTY still lands as a bounded SKIP instead of a 90-minute
  job death.
* Neutral: healthy Windows `tty` steps pay one `fs.existsSync` plus a sub-second throwaway-ConPTY
  probe.
* Bad, and accepted: a healthy environment slower than the probe budget would see a false SKIP. The
  budget is generous, since healthy allocation is sub-second, and it's env-overridable.

### Confirmation

* [test/pty-watchdog.test.js](../test/pty-watchdog.test.js) covers `ensurePtyBackendOnDisk`. The
  cases are present, stale-healed, unresolvable-healed, reinstall-fails →
  `NODE_PTY_UNAVAILABLE`, and never-materializes → the same. It also covers every probe outcome, a
  real worker round trip, and the `assertConptyAllocatable` gating.
* Teardown-sweep tests in [test/app-surface.test.js](../test/app-surface.test.js).
* Mechanism-level dogfood (scripted, documented in #501): load → use → prune-except-locked →
  `spawnPtyBackgroundCommand` heals and completes; the same recipe without the fix freezes forever.

## Pros and Cons of the Options

### Option 1: on-disk verification plus self-heal (chosen)

* Good: directly targets the proven mechanism; converts it to PASS, not SKIP.
* Good: platform-independent; also protects POSIX PTY spawns from pruned support files.
* Bad: a forced reinstall mid-step adds seconds of latency in the (rare) pruned state.

### Option 2: worker-thread probe (chosen, as defense-in-depth)

* Good: the only construction that can observe a synchronous main-thread freeze in time to skip it.
* Good: safe-by-default (inconclusive never removes capability).
* Bad: it cannot catch the stale-module case on its own. The probe's fresh import fails, so the
  verdict is inconclusive and it proceeds. That's why layer 1 exists, and runs first.

### Option 3: same-thread race

* Fatal: the timer shares the blocked event loop; it can never fire.

### Option 4: child-process probe

* Fatal: fresh process state → false "healthy" for both the stale-module case and in-process wedges.

### Option 5: re-import after reinstall

* Fatal in practice: ESM offers no module-cache invalidation; the "fresh" import is the same stale
  module object. Restoring files under the loaded module (option 1) is the workable equivalent.
