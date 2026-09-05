---
status: accepted
date: 2026-09-04
decision-makers: doc-detective maintainers
---

# Resolve the version-suffixed geckodriver binary instead of falling back to the cache directory

## Context and Problem Statement

`doc-detective install browsers` skipped geckodriver in the official Linux container image on
**both** `linux/amd64` and `linux/arm64`. The image build log showed the download succeeding and
validation then refusing to run it:

```text
Installing geckodriver into /opt/doc-detective/browsers
INFO geckodriver: Detected Geckodriver v0.37.1 to be latest
Downloaded geckodriver failed validation (Refusing to execute '/opt/doc-detective/browsers': not a recognized driver binary path.); re-downloading once.
geckodriver failed to install and was skipped: geckodriver is present but non-functional after a re-download (...)
```

The published image confirms the download in fact worked. The binary is on disk, executable, and
reports its version. Meanwhile `installed.json` carries no `geckodriver` entry at all:

```console
$ docker run --rm --entrypoint bash docdetective/docdetective:latest-linux -c 'ls /opt/doc-detective/browsers/'
chrome  chromedriver  firefox  geckodriver-0.37.1
```

Two independent defects combined to produce this:

1. **The cache probe looked for the wrong filename.** `geckodriverBinaryInCache` searched for
   exactly `geckodriver` / `geckodriver.exe` at the cache root and one level deep. Since v6 the
   `geckodriver` npm package extracts into a `fs.mkdtemp(<cacheDir>/geckodriver-)` staging directory
   and then renames the binary to **`geckodriver-<version>`** (`.exe` on Windows) at the cache root,
   so future lookups resolve a specific version. The probe never matched that name. The same package
   version also dropped the `.path` export the resolver's first branch relied on, so *both* sources
   came up empty.

2. **The unresolved case laundered a directory into a binary path.** `resolveBinaryPath` ended with
   `?? cacheDir`, so "couldn't find it" became "the cache directory is the executable".
   `verifyDriverBinary`'s allowlist then correctly refused to execute a directory. That produced a
   diagnostic that pointed at the cache dir and read like a corrupt download, which sent maintainers
   looking in the wrong place.

Even with the probe fixed, the allowlist regex
(`/[\\/](?:geckodriver|chromedriver|safaridriver)(?:\.exe)?$/i`) would still have refused
`geckodriver-0.37.1`, so the functional gate had to learn the real filename shape too.

The user-visible consequence went beyond a noisy install log: `installed.json` carried no
geckodriver entry, so the asset reported as failed and the availability probe had no binary to run
its functional check against.

Investigating the fix in the image surfaced a **second, independent defect that this ADR does not
fix**. `appium-geckodriver` resolves its binary from either the `appium:geckodriverExecutable`
capability (gated behind the `gecko:custom_geckodriver_executable` insecure feature) or `PATH`,
and Doc Detective sets neither for Firefox, unlike Chrome, which passes `appium:executable`. So even
with geckodriver correctly installed, a Firefox context in the container still fails to start with
`geckodriver binary cannot be found in PATH` and falls back to another browser. This has been masked
everywhere it is normally exercised: GitHub-hosted runners ship a system geckodriver on `PATH`, which
is what the Firefox-defaulted fixture suite has been using all along. The container is the
environment where the managed install is the only geckodriver.

Together these invalidated the documented arm64 workaround for the missing `linux/arm64` ChromeDriver
build ("use Firefox instead", see [ADR 01096](01096-never-execute-a-foreign-architecture-driver-binary.md) for the ChromeDriver side). Fixing the install is a
prerequisite for that workaround but not sufficient for it, so the docs are corrected here and the
`PATH` wiring is left to a follow-up.

## Decision Drivers

* The container image must be able to drive Firefox on both architectures. It is the only browser
  available on `linux/arm64`, where ChromeDriver has no native upstream build.
* The install path and the availability probe (Layer 2 in `core/config`) must resolve the *same*
  binary, or the functional gate silently stops running.
* `verifyDriverBinary` hands its argument to a child process, so widening the allowlist must not
  weaken it into accepting arbitrary executables.
* An unresolvable binary should degrade honestly to the runtime fallback (Layer 4), not fabricate a
  path that fails validation later with a misleading message.
* The upstream filename is an implementation detail of a third-party package; the fix should not
  hard-depend on any single naming convention.

## Considered Options

* **A. Recognize the version-suffixed name, drop the cache-directory fallback, and prefer
  `download()`'s return value.**
* **B. Pin `GECKODRIVER_VERSION` and compute the expected filename ourselves.**
* **C. Rename the downloaded binary to the bare `geckodriver` name after each download.**
* **D. Relax the allowlist to accept any file under the browsers cache dir.**

## Decision Outcome

Chosen option: **A**, because it fixes the actual mismatch at each of the three layers that
contributed to it, keeps the exec allowlist tight, and stays correct if the package changes its
layout again.

Concretely, in [src/runtime/browsers.ts](../src/runtime/browsers.ts):

* `geckodriverBinaryInCache` now recognizes `geckodriver-<version>(.exe)` in addition to the bare
  name, at the cache root and one level deep. Directory entries are skipped, so a
  `geckodriver-<random>` staging directory left by a crashed extraction is never mistaken for the
  binary. The version pattern is dotted-numeric, which is what distinguishes a real binary name from
  a `mkdtemp` suffix.
* Every supported location is scanned **before** anything is selected, and the newest version-suffixed
  binary found anywhere wins; a bare-named binary is the fallback, root before nested. Two ordering
  bugs fall out of doing it this way, both raised in review. Selecting as you scan let a root
  `geckodriver-0.36.0` beat a nested `geckodriver-0.37.1` purely by being looked at first. And
  preferring the bare name (the first draft's rule) let a stale `geckodriver` left by an older layout
  silently outrank a freshly installed one. The current package only ever writes versioned names, so
  a versioned file is both the authoritative managed artifact and the only candidate carrying a
  comparable version, while a bare name is a legacy or hand-placed artifact whose version can't be
  known without executing it.
* `resolveBinaryPath` returns `string | undefined`, so the `?? cacheDir` fallback is gone. Callers
  already treat a missing driver path as "no Layer 2 check, fall through to the runtime fallback"
  (`AppDriverDescriptor.driverPath` and `InstalledBrowserDescriptor.driverPath` are both optional),
  so `undefined` is the shape they were already written for. `EnsureBrowserResult.path` becomes
  optional to match.
* The install path prefers the absolute path **`download()` returns**, the only direct signal in
  geckodriver >= 6 — and falls back to the cache probe. This is what makes the fix independent of
  the naming convention; the probe remains necessary for the fresh-cache branch, which returns
  without downloading.
* `ALLOWED_DRIVER_PATH` admits an optional `-<version>` segment restricted to a dotted-numeric run:
  `geckodriver-0.37.1` and `geckodriver-0.37.1.exe` pass; `geckodriver-evil.sh` does not. The
  segment can contain no path separator, so the matched name is still a single final path segment.
* The post-failure message no longer names the cache directory as a deletable binary when nothing
  was located.

### Consequences

* Good: geckodriver installs and validates in the container image on both architectures, so
  `install browsers` no longer reports a failed asset and `installed.json` records the driver.
* Neutral: this alone does not make Firefox usable in the container. The separate `PATH` wiring
  defect described above still blocks it. [docs/fern/pages/docs/ci/docker-and-headless.mdx](../docs/fern/pages/docs/ci/docker-and-headless.mdx)
  is corrected to stop offering Firefox as the arm64 workaround and to document the verified
  `PATH` workaround instead, rather than leaving a promise the image does not keep.
* Good: the availability probe in `core/config` resolves the binary through the same helper, so the
  functional driver gate actually runs for containerized installs instead of quietly skipping.
* Good: a genuinely unlocatable binary now produces an accurate diagnostic and degrades to the
  runtime fallback rather than failing validation against a directory path.
* Neutral: a geckodriver release with a non-numeric version string would be refused by the
  allowlist. Upstream has only ever shipped `MAJOR.MINOR.PATCH`, and keeping an exec allowlist tight
  is worth more than speculative tolerance; the failure mode is a clean skip, not a crash.
* Bad: `EnsureBrowserResult.path` becoming optional ripples into consumers that assumed a string.
  Only `core/index.ts`'s local `assetResults` type needed widening, and it feeds
  `patchAppCache`, which already accepts an absent `driverPath`.

### Confirmation

* Red→green unit tests in [test/runtime-browsers.test.js](../test/runtime-browsers.test.js) cover
  the version-suffixed name at the root and nested, newest-version selection across mixed root and
  nested layouts, version-suffixed precedence over a bare sibling, the bare-name fallback,
  staging-directory rejection, allowlist acceptance of the versioned filename, continued rejection
  of the bare cache directory and of `geckodriver-evil.sh`, the end-to-end install against the real
  on-disk layout, and the honest `undefined` path when nothing can be located. Before the fix, seven
  of these failed, one reproducing the container error verbatim.
* Verified against the real image on **both** architectures, by layering this branch's compiled
  `dist/` onto `docdetective/docdetective:latest-linux` (same OS, cache dir, and geckodriver package
  version as the published build). Before: `geckodriver — skipped (...Refusing to execute
  '/opt/doc-detective/browsers'...)`. After, on `linux/amd64` and `linux/arm64` alike:
  `[browser] geckodriver — installed @ 0.37.1`, with the entry written to `installed.json`.
* The residual `PATH` defect was confirmed the same way: with this fix plus a `geckodriver` symlink
  on `PATH`, a Firefox spec runs and passes on Firefox (`"browser": {"name": "firefox"}`,
  `"result": "PASS"`) on both architectures instead of falling back to Chrome. That symlink is the
  workaround the docs now carry, run verbatim against the published image.

## Pros and Cons of the Options

### A. Recognize the version-suffixed name, drop the cache-directory fallback, prefer `download()`'s return

* Good: fixes the probe, the fallback, and the allowlist. Each was independently sufficient to
  break the install.
* Good: `download()`'s return value is authoritative and survives future renames upstream.
* Good: keeps the exec allowlist narrow.
* Bad: three coordinated edits rather than one.

### B. Pin `GECKODRIVER_VERSION` and compute the expected filename

* Good: makes the on-disk name fully predictable.
* Bad: abandons "always latest stable from Mozilla", the channel policy the geckodriver install path
  is built around, and adds a version to maintain by hand.
* Bad: still requires the allowlist change, so it does not actually reduce the work.

### C. Rename the downloaded binary to the bare `geckodriver` name

* Good: no allowlist change needed.
* Bad: fights the package. It re-derives the versioned path on the next `download()` and would
  re-download every time, since its cache hit checks the versioned name.
* Bad: defeats the package's own multi-version cache and races concurrent installs.

### D. Relax the allowlist to any file under the browsers cache dir

* Good: smallest diff.
* Bad: the cache dir is user-configurable, so this hands arbitrary attacker-placed files to
  `execFile`. The allowlist exists precisely to prevent that.
