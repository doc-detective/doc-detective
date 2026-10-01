---
status: accepted
date: 2026-07-10
decision-makers: doc-detective maintainers
---

# Make browser/driver install best-effort, matching BEST_EFFORT_NPM_DEPS

## Context and Problem Statement

`installBrowsers` (`src/runtime/installer.ts`, driving `doc-detective install browsers` / `doc-detective install all`)
installs each requested browser asset (`chrome`, `firefox`, `chromedriver`, `geckodriver`) in
a loop and lets any `ensureBrowserInstalled` failure propagate straight out, aborting the whole
batch. `installRuntime`, right above it, already treats some native npm deps as failure-tolerant.
Those are deps with no prebuild guarantee across the platform matrix, listed in
`BEST_EFFORT_NPM_DEPS`, such as the PTY backend. A failed asset is recorded `"skipped"`, and the
rest of the batch still completes.

This asymmetry surfaced as a real build failure: Google's Chrome for Testing publishes no native
`linux-arm64` build for Chrome or chromedriver. `@puppeteer/browsers` maps
`BrowserPlatform.LINUX_ARM` to the **x64** (`linux64`) asset for both
(`node_modules/@puppeteer/browsers/lib/browser-data/{chrome,chromedriver}.js`). Take a real arm64
Linux host with no x86_64 emulation registered, such as GitHub's native `ubuntu-24.04-arm` runner,
used by the `docdetective/docdetective` multi-arch Docker build. There the downloaded x64
chromedriver binary cannot execute. `execFile` gets `ENOEXEC` from the kernel, and Node's
child_process falls back to re-invoking it through `/bin/sh -c <path>`. `/bin/sh` then fails trying
to parse the binary's raw bytes as shell syntax (`Syntax error: Unterminated quoted string`).
`verifyDriverBinary` (`src/runtime/browsers.ts`) correctly detects this as non-functional, and
throws. `installBrowsers` has no tolerance, so that throw kills the entire `linux.Dockerfile`
`RUN doc-detective install all --yes` layer. The arm64 image then never builds. See PR #579's
follow-up investigation: `build-linux (arm64)` failed on every release after the docker-build.yml
CI-gating fix landed.

This is a platform-availability problem structurally identical to the PTY backend case
`BEST_EFFORT_NPM_DEPS` already solves. An upstream vendor doesn't ship a binary for one platform,
and that must degrade a feature rather than abort the batch. How should `installBrowsers` handle a
per-asset install failure?

## Decision Drivers

* Consistency: browser installs should follow the same failure-tolerance precedent already
  established for npm heavy deps (`BEST_EFFORT_NPM_DEPS`).
* The runtime already has a safety net for a missing or broken browser. ADR 01008 validates drivers
  by execution, and falls back across browsers at runtime through the `browserFallback` policy. A
  hard install failure duplicates a guarantee the runtime already provides, at a much higher cost.
  It kills the whole batch, including unrelated assets.
* Parity with the npm side's exit-code contract. `installRuntime` already never fails the process
  over a `BEST_EFFORT_NPM_DEPS` problem, such as the PTY backend. `installBrowsers` should match,
  instead of being the one asset-install path that still hard-fails the whole command.
* Testability: must be provable without a real emulation gap (inject a fake `browsersModule` whose
  `install` throws for one asset).

## Considered Options

* **A. Best-effort for every browser asset in `installBrowsers`** (chosen). Catch a per-asset
  `ensureBrowserInstalled` failure, log a warning, record `"skipped"`, and continue the loop.
* **B. Docker-build-only workaround.** Wrap just the Dockerfile's `RUN ... install all` in
  `|| true` or similar, without touching `installBrowsers`'s general contract.
* **C. Introduce a `BEST_EFFORT_BROWSER_ASSETS` allowlist** mirroring `BEST_EFFORT_NPM_DEPS`, so only
  specific assets (e.g. `chromedriver`) are tolerant and the rest still hard-fail.

## Decision Outcome

Chosen option: **A**. B only fixes the Docker build. Every other `install all` or
`install browsers` caller, such as a user running it directly on unsupported hardware, still gets a
hard crash instead of a graceful skip. Worse, it would mask a *real* transient failure the same way
it masks the platform gap, with no report of what happened. That covers a corrupt download or a
network error. C adds a second allowlist to maintain in lockstep with reality. Today it's
chromedriver on arm64; tomorrow it could be a different asset and platform pair. That's no
behavioral benefit. Every browser asset is equally "no reliable prebuild across the full platform
matrix". And the runtime-side fallback (ADR 01008) already treats every browser as potentially
missing.

Implementation: `installBrowsers`'s per-asset loop wraps `ensureBrowserInstalled` in try/catch. On
failure it logs a `warn`-level message with the asset name and the original error. It pushes an
`InstallReport` with `action: "skipped"` and a `notes` entry, then `continue`s to the next asset.
That's the same shape `installRuntime` already returns for a failed `BEST_EFFORT_NPM_DEPS` entry.

### Consequences

* Good: the arm64 Docker image build now completes instead of aborting, as does any user's
  `install all` on an unsupported platform or arch. The platform gap is visible in the printed
  report, as `[browser] chromedriver — skipped`, instead of a fatal stack trace.
* Bad, and accepted. `install all` and `install browsers` previously exited non-zero on ANY browser
  asset failure, since no try/catch existed on this path at all. That includes genuinely transient
  failures, like a flaky download or a full disk, on platforms with no availability problem. Those
  now also degrade to a warn-level log and a `"skipped"` report, instead of a hard exit-1 failure.
  It's accepted for the same reason the npm side already accepts it for `BEST_EFFORT_NPM_DEPS`.
  `install status` and a re-run remain the way to confirm and retry. A best-effort install command
  that fails the whole process for one broken asset is worse. Better one that finishes, and reports
  what didn't make it.
* Good: this closes the one remaining asymmetry with the npm side. `installRuntime` already has
  this best-effort, non-fatal behavior for `BEST_EFFORT_NPM_DEPS`, and `installBrowsers` did not.
* Neutral: at runtime, a browser skipped at install time behaves exactly like a broken or missing
  driver already does. ADR 01008's cross-engine fallback and diagnostic skip reporting apply
  unchanged.

### Confirmation

There's a red→green unit test in `test/runtime-installer.test.js`, in the `installBrowsers` describe
block. A fake `browsersModule.install` throws for `chromedriver` but succeeds for `firefox`. It
asserts the batch resolves rather than rejects, `chromedriver`'s report is `action: "skipped"`, and `firefox` still installs
normally.

## Pros and Cons of the Options

### A. Best-effort for every browser asset
* Good: matches the existing npm-side precedent exactly; smallest change; fixes both the Docker
  build and direct CLI use.
* Bad: a real transient failure on an asset that normally works is now silent-ish (warn log only,
  no process exit code) rather than fatal.

### B. Docker-build-only workaround
* Good: narrowest possible blast radius.
* Bad: leaves the general `installBrowsers` contract broken for every non-Docker caller on an
  unsupported platform/arch; duplicates a fix that belongs in one place.

### C. Allowlist specific best-effort browser assets
* Good: could in theory keep hard-failing on assets expected to always work.
* Bad: it's an extra allowlist to keep in sync with upstream platform support, which isn't declared
  anywhere in this codebase. No asset here actually has a "must always work" guarantee across the
  full platform and arch matrix doc-detective supports.

## More Information

Here's the root-cause chain and cross-arch verification. `@puppeteer/browsers`
(`node_modules/@puppeteer/browsers/lib/browser-data/chromedriver.js` /`chrome.js`) maps
`BrowserPlatform.LINUX_ARM` to the `linux64` (x64) download, for both Chrome and chromedriver. There
is no native `linux-arm64` Chrome for Testing build upstream. See [src/runtime/AGENTS.md](../src/runtime/AGENTS.md)
for the surrounding JIT-install architecture and [ADR 01008](01008-resilient-any-browser-driver-fallback.md)
for the runtime-side fallback this decision relies on.
