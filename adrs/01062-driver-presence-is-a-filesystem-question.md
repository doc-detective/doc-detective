---
status: accepted
date: 2026-07-14
decision-makers: doc-detective maintainers
---

# Driver presence is a filesystem question, not an `appium driver list` question

## Context and Problem Statement

`getAvailableApps` (`src/core/config.ts`) is the runtime gate that decides which browsers a run can
launch. To learn which Appium browser drivers are installed, `probeBrowserEnvironment` spawned
`node <appium> driver list` and regex-parsed its formatted text table:

```
appiumDriverOutput.match(/\n.*chromium.*installed \(npm\).*\n/)  // chrome gate
appiumDriverOutput.match(/\n.*gecko.*installed \(npm\).*\n/)     // firefox gate
appiumDriverOutput.match(/\n.*safari.*installed \(npm\).*\n/)    // safari gate
```

That spawn is **~17 s by its own comment** and runs on every driver-touching run, inside `setConfig`
— a fixed startup tax paid before any test executes. Yet the answer it computes ("is this
appium-\*-driver installed?") is a pure filesystem question: the drivers are npm packages, and the
**same module already resolves package presence directly** for the diagnostic dump
(`getBrowserDiagnostics`'s `npmInstalled` → `resolveHeavyDepPath(name, { cacheDir })`) and for the
JIT installer's already-up-to-date check (`ensureRuntimeInstalled`). Spawning a whole Node process +
Appium's CLI + parsing a human-formatted table to discover what a `require.resolve`-style lookup
answers instantly and offline is the single largest avoidable fixed cost in the startup path
(design doc `docs/design/run-performance.md`, item 2.1).

The tension: presence-on-disk is *cheaper information* than what a spawn learns, but is it
*equivalent enough*? `appium driver list` in principle reflects Appium's own view of a driver home;
a package being resolvable on disk is a necessary condition for that, but not identical.

## Decision Drivers

* Eliminate the ~17 s fixed spawn on every driver-touching run without changing which browsers are
  reported available.
* Preserve the existing two-layer resilience strategy: presence (Layer 1) is necessary-but-not-
  sufficient; the functional `verifyDriverBinary` execution check (Layer 2, ADR 01008) is what
  actually proves a driver can start a session. Only the *presence-discovery mechanism* should
  change — never the functional gate.
* Coverage parity: the presence check must recognize *exactly* the drivers the old table-regex
  recognized (chromium, gecko, safari), mapped to their npm package names, so no browser silently
  drops out of detection.
* Consistency: use the same presence mechanism the rest of the module already uses
  (`resolveHeavyDepPath` via `getBrowserDiagnostics`'s `npmInstalled`).

## Considered Options

* **A. Direct package-presence checks** (chosen) — replace the spawn + table parse with
  `detectInstalledBrowserDrivers(config)`, which resolves each `appium-*-driver` package on disk via
  `resolveHeavyDepPath`. Keep `verifyDriverBinary` (Layer 2) exactly as-is.
* **B. Keep the spawn but cache/parallelize it** — memoize the `driver list` output more
  aggressively, or move it off the critical path.
* **C. Parse Appium's manifest cache** (`extensions.yaml`) instead of spawning — read the file
  Appium itself writes.

## Decision Outcome

Chosen option: **A**. The drivers are npm packages; their presence is a filesystem fact, and the
codebase already answers it that way in `getBrowserDiagnostics` and the installer. `detectInstalled
BrowserDrivers` returns `{ chromium, gecko, safari }` booleans, each mapped to exactly the package
the old regex recognized:

| old table regex | npm package |
|---|---|
| `/chromium.*installed \(npm\)/` | `appium-chromium-driver` |
| `/gecko.*installed \(npm\)/` | `appium-geckodriver` |
| `/safari.*installed \(npm\)/` | `appium-safari-driver` |

`probeBrowserEnvironment` now returns `installedDrivers` (that boolean set) instead of the raw
`appiumDriverOutput` string; `getAvailableApps` reads `installedDrivers.chromium/gecko/safari` in
place of the three `.match(...)` calls. **No child process, no table parse, no ~17 s wait.**

Crucially, the **Layer 2 functional gate is untouched**: every candidate browser still passes
through `verifyAppDrivers` → `verifyDriverBinary`, which executes `<driver> --version` before the
browser is reported available. A partially-downloaded or broken driver that is *present on disk* but
can't run is still excluded exactly as before — presence changed how we *discover* candidates, not
how we *validate* them.

B was rejected: caching a 17 s spawn still pays it once per process and keeps a whole Node+Appium
subprocess and brittle human-table parsing on the critical path for information a package lookup
already has. C was rejected: the manifest cache is an Appium implementation detail that is
deliberately deleted by the driver-install preflight (see `src/runtime/AGENTS.md` — "Appium
extension manifest cache"), so reading it would race the very code that invalidates it; the
package-on-disk check has no such coupling.

### Consequences

* Good: the dominant fixed startup cost (~17 s/run) is removed for every browser/driver-touching
  run, including native-platform runs that also went through this probe.
* Good: presence discovery now uses the identical mechanism as the diagnostic dump and the
  installer, so the three views of "is this driver installed?" can no longer disagree.
* Neutral (accepted trade): "present on disk" and "Appium reports installed (npm)" are not
  *definitionally* identical. In practice the driver being a resolvable npm package is precisely what
  makes `appium driver list` report it, and the ESM-driver resolution fallback
  (`resolveHeavyDepPath`, ADR 01006) already handles the exports-map edge cases. The residual risk —
  a package resolvable on disk that Appium nonetheless refuses to load — is caught downstream: it
  surfaces at session start, where ADR 01008's cross-engine fallback takes over, the same safety net
  that always guarded a driver that passes presence but fails at runtime.
* Neutral: `verifyDriverBinary` (Layer 2) is retained verbatim; the "present ≠ functional"
  distinction the old code relied on is preserved.

### Confirmation

* Red→green hermetic unit tests in `test/config-coverage.test.js`
  (`detectInstalledBrowserDrivers (2.1)`): assert the name→package mapping (chromium →
  `appium-chromium-driver`, gecko → `appium-geckodriver`, safari → `appium-safari-driver`) via an
  injected presence checker, so coverage parity with the old regexes is pinned.
* The existing `getAvailableApps` tests (empty cache dir → `[]`, the macOS Safari branch, the
  pre-resolved-API-config path) continue to pass unchanged, confirming behavior equivalence.
* End-to-end, the `apps`/browser fixtures in `test/core-artifacts/` exercise the discovery path
  through the real runner on every browser CI leg.

## Pros and Cons of the Options

### A. Direct package-presence checks
* Good: removes the ~17 s spawn; reuses the module's existing presence mechanism; preserves Layer 2.
* Bad: presence-on-disk is a slightly weaker signal than a live Appium query (mitigated by the
  retained functional gate + runtime fallback).

### B. Keep but cache/parallelize the spawn
* Good: no change to the information source.
* Bad: still spawns a Node+Appium subprocess and parses a human table for a filesystem fact; still
  pays the cost once per process.

### C. Parse Appium's manifest cache
* Good: reflects Appium's own view without spawning.
* Bad: reads an implementation-detail file the install preflight deliberately deletes — a direct
  race with existing behavior documented in `src/runtime/AGENTS.md`.

## More Information

Design: `docs/design/run-performance.md` (Phase 2, item 2.1, and Decision 1). Related:
[ADR 01008](01008-resilient-any-browser-driver-fallback.md) (the retained runtime driver
fallback / Layer 2 rationale), [ADR 01006](01006-appium-v3-drivers-esm-heavy-dep-resolution.md) (ESM-driver
`resolveHeavyDepPath` fallback), and `src/runtime/AGENTS.md` (JIT-install architecture, the Appium
manifest-cache hazard).
