---
status: accepted
date: 2026-07-10
decision-makers: doc-detective maintainers
---

# Cache-side heavy-dep resolver returns null (not throws) on an unusable cacheDir

## Context and Problem Statement

`resolveHeavyDepPath(name, ctx)` locates a heavy dependency's entry file without importing it,
preferring the shim's `node_modules` and falling back to `<cacheDir>/runtime` via
`tryResolveFromCache`. Its documented contract is: *"Returns null if neither location resolves the
name."* But `tryResolveFromCache` reaches the cache through `getRuntimeDir → getCacheDir`, and
`getCacheDir` runs `assertSafeRuntimePath` (which throws on a shell-metacharacter in
`DOC_DETECTIVE_CACHE_DIR` / `config.cacheDir`) and `fs.mkdirSync`. So when the shim copy is absent
**and** the cache dir is unusable, the "resolver" threw instead of returning null.

Callers that are pure locators — the `doc-detective debug` probes (`probeAppium`, the Appium and
Browsers collectors) — expect null so they can degrade (`<not installed>`, `detectionFailed`) and
keep producing a report. Instead an invalid cacheDir crashed the whole `debug` dump. This was
masked whenever the heavy deps were installed in the shim `node_modules` (shim resolution
short-circuits before the cache), so it only surfaced in degraded installs — notably Windows
checkouts where the appium optionalDependencies were pruned — and showed up as a block of
uncaught-throw failures in `test/debug-remaining-coverage.test.js`.

How should a read-only resolver behave when the cache dir cannot even be constructed?

## Decision Drivers

* A locator must honor its documented "returns null when unresolvable" contract.
* Diagnostics (`doc-detective debug`) must never crash on bad user input — surfacing the problem is
  the whole point of the command.
* The security gate on `cacheDir` (reject shell metacharacters before any `shell:true` spawn) must
  not be weakened.
* The fix must behave identically whether or not the shim copy happens to be installed.

## Considered Options

* **A. Swallow the throw in `tryResolveFromCache` and return null** (chosen).
* **B. Wrap each debug probe (`probeAppium`, Appium/Browsers collectors) in its own try/catch.**
* **C. Relax `assertSafeRuntimePath` so `getCacheDir` no longer throws on a bad path.**

## Decision Outcome

Chosen option: **A**. `tryResolveFromCache` now wraps its body in try/catch and returns null on any
failure to construct/probe the runtime dir. This restores the resolver's documented contract at the
single point where the cache lookup happens, so every caller (`resolveHeavyDepPath`,
`resolveHeavyDepPathInCache`, `resolveHeavyDepSource`, `loadHeavyDep`'s resolution phase, and the
`ensureRuntimeInstalled` skip-filter) inherits graceful "not in cache" behavior without repeating a
guard.

This does **not** weaken security. The only path that actually shells out —
`ensureRuntimeInstalled` — independently re-runs `assertSafeRuntimePath(runtimeDir, …)` immediately
before spawning `npm`, so an unsafe cacheDir still fails loudly at install time. Swallowing in the
read-only locator only stops a bad cacheDir from crashing code that was never going to spawn
anything. B was rejected as N scattered guards that would drift; the resolver is the correct chokepoint.
C was rejected outright — it removes the metacharacter defense the spawn depends on.

### Consequences

* Good: `doc-detective debug` degrades gracefully on an invalid `cacheDir` (reports the error in the
  Install/Cache sections, marks browser detection `detectionFailed`) instead of aborting the dump.
* Good: locators uniformly honor "null means unresolvable"; no per-caller guards.
* Neutral: `collectCacheStatus` / `collectInstallStatus` still surface the `shell-metacharacter`
  message via their own `.error` field — they call `getCacheDir`/`getInstalledRecordPath` directly,
  not through `tryResolveFromCache`, so their fail-with-error behavior is unchanged.
* Bad: a genuinely unreadable cache (permissions) is now reported as "dep not in cache" rather than
  raising — acceptable, since the install path re-attempts and reports the real error.
* Guard: `loadHeavyDep`'s `autoInstall: false` branch re-derives the runtime dir before it reports
  "not installed". Without that, a swallowed unusable-cacheDir error would surface as
  "…is not installed. Run `doc-detective install runtime`" — misdirecting, since that command fails
  the same way. The precise cause (`shell-metacharacter`, `EACCES`, …) is reported instead.

### Confirmation

Red→green unit tests in `test/runtime-loader.test.js` (`an unusable cacheDir`): the `resolveHeavyDep*`
family returns null for both a `ctx.cacheDir` and a `DOC_DETECTIVE_CACHE_DIR` override; a
shim-resolvable dep still resolves without consulting the bad cache; `loadHeavyDep`'s
`autoInstall: false` path reports the real cause; and a **security regression guard** asserts
`ensureRuntimeInstalled` still throws on an unsafe cacheDir and **never spawns npm**.

`test/debug-remaining-coverage.test.js` passes end-to-end (74/74). The regression is only observable
when the heavy deps are absent from the shim `node_modules`, since shim resolution otherwise
short-circuits before the cache. Controlled before/after, with `appium`, `appium-chromium-driver`,
and `appium-geckodriver` temporarily removed from `node_modules` to force the cache fallback:
without the change, 12 tests fail with uncaught `shell-metacharacter` / stubbed-`fs` throws; with
it, all 74 pass. The `runtime-loader`, `runtime-cache-dir`, `runtime-installer`, `runtime-heavy-deps`,
`postinstall-runtime`, and `debug` suites remain green.

## Pros and Cons of the Options

### A. Return null in `tryResolveFromCache`
* Good: one chokepoint; restores documented contract; security gate intact at the spawn site.
* Bad: hides a permissions-level cache error from pure locators (surfaced later at install time).

### B. Guard each debug probe
* Good: keeps the resolver strict.
* Bad: duplicated guards across `probeAppium` and two collectors; easy to miss the next caller.

### C. Relax `assertSafeRuntimePath`
* Good: trivially stops the throw.
* Bad: removes the shell-metacharacter defense that the Windows `shell:true` npm spawn relies on.

## More Information

The resolver lives in `src/runtime/loader.ts` (`tryResolveFromCache`); the security gate and cache
construction in `src/runtime/cacheDir.ts` (`assertSafeRuntimePath`, `getCacheDir`); the spawn-site
re-validation in `ensureRuntimeInstalled`. Debug consumers: `src/debug/tools.ts` (`probeAppium`),
`src/debug/appium.ts`, and `collectBrowsers` in `src/debug/index.ts`.
