---
status: accepted
date: 2026-07-09
decision-makers: [hawkeyexl]
---

# Default the runtime cache to `<homedir>/.doc-detective` instead of the OS temp dir

## Context and Problem Statement

Doc Detective lazily installs heavy runtime assets — browsers + drivers, ffmpeg,
the npm driver packages, and (phase A3) the multi-GB Android SDK + a portable JRE —
into a cache directory resolved by `getCacheDir`. The default was
`<os.tmpdir()>/doc-detective`.

`os.tmpdir()` is the wrong home for assets meant to persist across runs:

- **The OS reclaims temp.** Windows Storage Sense and `/tmp`-on-reboot purge temp
  contents. The docs even warned the location "may not persist across reboots."
- **Doc Detective purges it itself.** `cleanTemp` (core/utils.ts) deletes scratch
  from `<os.tmpdir()>/doc-detective` between phases, preserving only a hard-coded
  allow-list (`browsers`, `runtime`, `installed.json`). Because the default cache
  *was* that same directory, anything not on the list was collateral — and
  `android-sdk` / `jre` were **not** on it. A `runTests` run therefore deleted a
  freshly-installed Android SDK, so the next run re-detected "no SDK" and SKIPped.
  This was observed directly: install to the temp cache, run once, and the 4.5 GB
  SDK is gone.

Net effect: expensive downloads didn't survive, and the Android toolchain in
particular was actively destroyed by the tool's own housekeeping.

## Decision Drivers

- Lazy-installed assets must **persist** across runs and reboots — re-downloading
  multiple GB is not an acceptable steady state.
- The cache must not sit in a directory the tool (or OS) sweeps.
- Keep the override story intact (`DOC_DETECTIVE_CACHE_DIR` > `config.cacheDir` >
  default) for CI/containers/shared caches.
- A per-user, writable, stable location on every supported OS.

## Considered Options

1. **`<homedir>/.doc-detective`** — a persistent per-user dotfile directory.
2. **Keep `<os.tmpdir()>/doc-detective`, just add `android-sdk`/`jre` to
   `cleanTemp`'s preserve list** — treats the symptom, not the cause; OS temp
   cleanup still purges the cache across reboots.
3. **OS-idiomatic cache dirs** (XDG `~/.cache/doc-detective` on Linux,
   `~/Library/Caches` on macOS, `%LOCALAPPDATA%` on Windows) — most "correct" per
   platform convention, but three code paths and three docs answers; deferred.

## Decision Outcome

Chosen option: **1 — default to `<homedir>/.doc-detective`**. `defaultCacheRoot`
now returns `path.join(os.homedir(), ".doc-detective")`. The precedence chain is
unchanged: `DOC_DETECTIVE_CACHE_DIR` > `config.cacheDir` > the new default.

As defense-in-depth (option 2 applied *in addition*, for the case where a user
explicitly points `cacheDir` back at the scratch root), `cleanTemp`'s preserve list
gains `android-sdk` and `jre`, so it never deletes a cache asset even when cache and
scratch co-locate. `cleanTemp` still targets `<os.tmpdir()>/doc-detective` — it is
the *scratch* cleaner, now genuinely separate from the default cache.

### Consequences

- Good: browsers/runtime/SDK survive reboots and the tool's own scratch cleanup —
  the Android SDK is no longer destroyed mid-session.
- Good: one persistent, per-user location; overrides still work for CI/containers.
- Neutral/migration: existing users with a populated `<os.tmpdir()>/doc-detective`
  cache get a fresh empty `<homedir>/.doc-detective` and re-download once. Assets
  are lazy, so this is automatic; the old temp copy is harmless and ages out.
- Trade-off: home may be a slow/roaming network mount in some enterprise setups.
  Those users set `DOC_DETECTIVE_CACHE_DIR` to a local disk — the same override
  they'd already use.
- Follow-up: XDG/OS-idiomatic paths (option 3) remain a possible future refinement.

### Confirmation

`test/runtime-cache-dir.test.js` asserts `getCacheDir({})` (and the empty /
whitespace-only `config.cacheDir` fallbacks) resolve to
`path.join(os.homedir(), ".doc-detective")`, and that env/config overrides still win.
`test/misc-edge-branches-coverage.test.js` asserts `cleanTemp` preserves
`android-sdk` and `jre` (alongside `browsers`/`runtime`/`installed.json`) while still
deleting scratch, and the `getBrowsersDir` fallback test stubs `os.homedir` for the
new default. The `config_v3` schema description, the `--cache-dir` CLI help, and the
installation/CLI docs are updated to the new default (source-of-truth alignment).

## Pros and Cons of the Options

### 1. `<homedir>/.doc-detective` (chosen)

- Good, because it's persistent, per-user, writable, and identical to reason about
  on every OS.
- Good, because it decouples the cache from the scratch root the tool sweeps.
- Bad, because it ignores per-OS cache conventions and can be a network mount in
  managed environments (mitigated by the existing override).

### 2. Keep temp, extend `cleanTemp`'s preserve list

- Good, because it's the smallest change and stops the self-inflicted deletion.
- Bad, because the OS still purges temp across reboots — the cache remains
  non-durable, which is the core problem.

### 3. OS-idiomatic cache directories

- Good, because it matches platform conventions users expect.
- Bad, because it triples the code and documentation surface for a marginal gain
  over a single persistent home dir; deferred, not rejected.
