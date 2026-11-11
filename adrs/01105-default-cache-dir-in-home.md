---
status: accepted
date: 2026-10-10
decision-makers: hawkeyexl
---

# Default the install cache to `~/.doc-detective`, not the OS temp dir

## Context and Problem Statement

Doc Detective lazily installs heavy assets into a cache directory. These
include the runtime npm tree, browsers and drivers, and Git Bash. They also
include the Android SDK and its JRE, and WebDriverAgent prebuilds. Without `DOC_DETECTIVE_CACHE_DIR` or
`config.cacheDir`, that cache defaulted to `<os.tmpdir()>/doc-detective/`.

Two problems followed:

* `cleanTemp()` sweeps run scratch out of the same
  `<os.tmpdir()>/doc-detective/` root. It preserved only `browsers/`,
  `runtime/`, `tools/`, and `installed.json`. After every run it deleted
  `android-sdk/`, `jre/`, and `ios/`, which are multi-GB and take minutes to
  rebuild. The next Android run found no SDK and skipped, or reinstalled it.
* Many systems clear the OS temp dir on reboot, so the whole cache came back
  empty and every asset downloaded again.

Where should the cache live when the user doesn't choose a location?

## Decision Drivers

* A cache must survive between runs and across reboots.
* The cache must not share a root with directories that get swept.
* Explicit overrides (`DOC_DETECTIVE_CACHE_DIR`, `config.cacheDir`,
  `--cache-dir`) keep their precedence and behavior.

## Considered Options

1. Default to `<os.homedir()>/.doc-detective/`.
2. Keep the temp default and add the missing entries to the `cleanTemp`
   preserve list.
3. Default to the OS cache convention (`$XDG_CACHE_HOME`,
   `%LOCALAPPDATA%`, `~/Library/Caches`).

## Decision Outcome

Chosen option: 1, together with the preserve-list fix from option 2.

The default cache root is `<os.homedir()>/.doc-detective/`. That is outside
the sweep root, so `cleanTemp` can't reach it, and it persists across reboots.
`cleanTemp` also preserves every cache entry (`android-sdk/`, `jre/`, and
`ios/` added). That protects users who set the cache to the temp path
explicitly.

### Consequences

* Good: installed assets persist across runs and reboots by default.
* Good: a single dotdir is easy to find, document, and delete.
* Bad: after upgrading, the first run re-downloads assets into the new
  location. The old `<os.tmpdir()>/doc-detective/` cache is not migrated. Users
  who want it can point `DOC_DETECTIVE_CACHE_DIR` at it.
* Neutral: the repo's CI cache action (`.github/actions/dd-cache`) now
  junctions `~/.doc-detective` instead of the temp path.

### Confirmation

* `test/runtime-cache-dir.test.js` asserts the home-dir default and that empty
  or whitespace-only overrides fall back to it.
* `test/misc-edge-branches-coverage.test.js` asserts `cleanTemp` keeps
  `android-sdk/`, `jre/`, and `ios/` alongside the existing entries.

## Pros and Cons of the Options

### Option 1: `~/.doc-detective/`

* Good: persistent and separate from scratch.
* Good: matches the dotdir pattern of comparable CLIs.
* Bad: a one-time re-download after upgrading.

### Option 2: keep temp, extend the preserve list

* Good: no relocation, no re-download.
* Bad: the cache still vanishes when the OS clears temp.
* Bad: every new cache subdirectory must remember to join the preserve list.
  The Android and iOS entries already forgot.

### Option 3: OS cache convention

* Good: idiomatic per platform.
* Bad: three platform-specific paths to document and support, for little
  user benefit over a single dotdir.
