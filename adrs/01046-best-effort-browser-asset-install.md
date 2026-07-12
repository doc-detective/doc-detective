---
status: accepted
date: 2026-07-10
decision-makers: doc-detective maintainers
---

# Make browser/driver install best-effort, matching BEST_EFFORT_NPM_DEPS

## Context and Problem Statement

`installBrowsers` (`src/runtime/installer.ts`, driving `doc-detective install browsers` / `install
all`) installs each requested browser asset (`chrome`, `firefox`, `chromedriver`, `geckodriver`) in
a loop and lets any `ensureBrowserInstalled` failure propagate straight out, aborting the whole
batch. `installRuntime`, right above it, already treats native npm deps with no prebuild guarantee
across the platform matrix (`BEST_EFFORT_NPM_DEPS`, e.g. the PTY backend) as failure-tolerant: a
failed asset is recorded `"skipped"` and the rest of the batch still completes.

This asymmetry surfaced as a real build failure: Google's Chrome for Testing publishes no native
`linux-arm64` build for Chrome or chromedriver. `@puppeteer/browsers` maps
`BrowserPlatform.LINUX_ARM` to the **x64** (`linux64`) asset for both
(`node_modules/@puppeteer/browsers/lib/browser-data/{chrome,chromedriver}.js`). On a real arm64
Linux host with no x86_64 emulation registered (e.g. GitHub's native `ubuntu-24.04-arm` runner, used
by the `docdetective/docdetective` multi-arch Docker build), the downloaded x64 chromedriver binary
cannot execute: `execFile` gets `ENOEXEC` from the kernel, Node's child_process falls back to
re-invoking it via `/bin/sh -c <path>`, and `/bin/sh` fails trying to parse the binary's raw bytes as
shell syntax (`Syntax error: Unterminated quoted string`). `verifyDriverBinary`
(`src/runtime/browsers.ts`) correctly detects this as non-functional and throws — and because
`installBrowsers` has no tolerance, that throw kills the entire `linux.Dockerfile` `RUN
doc-detective install all --yes` layer, so the arm64 image never builds (see PR #579's follow-up
investigation: `build-linux (arm64)` failed on every release after the docker-build.yml CI-gating fix
landed).

This is a platform-availability problem structurally identical to the PTY backend case
`BEST_EFFORT_NPM_DEPS` already solves — an upstream vendor doesn't ship a binary for one platform,
and that must degrade a feature rather than abort the batch. How should `installBrowsers` handle a
per-asset install failure?

## Decision Drivers

* Consistency: browser installs should follow the same failure-tolerance precedent already
  established for npm heavy deps (`BEST_EFFORT_NPM_DEPS`).
* The runtime already has a safety net for a missing/broken browser: ADR 01008 validates drivers by
  execution and falls back across browsers at runtime (`browserFallback` policy). A hard install
  failure duplicates a guarantee the runtime already provides, at a much higher cost (it kills the
  whole batch, including unrelated assets).
* No change to `install all`'s exit-code contract — it has never failed the process on a per-asset
  problem (npm side already swallows PTY failures); browsers should match.
* Testability: must be provable without a real emulation gap (inject a fake `browsersModule` whose
  `install` throws for one asset).

## Considered Options

* **A. Best-effort for every browser asset in `installBrowsers`** (chosen) — catch a per-asset
  `ensureBrowserInstalled` failure, log a warning, record `"skipped"`, continue the loop.
* **B. Docker-build-only workaround** — wrap just the Dockerfile's `RUN ... install all` in
  `|| true` or similar, without touching `installBrowsers`'s general contract.
* **C. Introduce a `BEST_EFFORT_BROWSER_ASSETS` allowlist** mirroring `BEST_EFFORT_NPM_DEPS`, so only
  specific assets (e.g. `chromedriver`) are tolerant and the rest still hard-fail.

## Decision Outcome

Chosen option: **A**. B only fixes the Docker build and leaves every other `install all` /
`install browsers` caller (a user running it directly on unsupported hardware) with a hard crash
instead of a graceful skip — worse, it would mask a *real* transient failure (corrupt download,
network error) the same way it masks the platform gap, with no report of what happened. C adds a
second allowlist to maintain in lockstep with reality (today it's chromedriver on arm64; tomorrow it
could be a different asset/platform pair) for no behavioral benefit, since every browser asset is
equally "no reliable prebuild across the full platform matrix" and the runtime-side fallback (ADR
01008) already treats every browser as potentially missing.

Implementation: `installBrowsers`'s per-asset loop wraps `ensureBrowserInstalled` in try/catch. On
failure: log a `warn`-level message with the asset name and the original error, push an
`InstallReport` with `action: "skipped"` and a `notes` entry, and `continue` to the next asset — the
same shape `installRuntime` already returns for a failed `BEST_EFFORT_NPM_DEPS` entry.

### Consequences

* Good: the arm64 Docker image build (and any user's `install all` on an unsupported platform/arch)
  completes instead of aborting; the platform gap is visible in the printed report
  (`[browser] chromedriver — skipped`) instead of a fatal stack trace.
* Good: no exit-code change — `install all` / `install browsers` have never failed the process on a
  per-asset problem; this closes the one remaining asymmetry with the npm side.
* Neutral: a genuinely transient failure (flaky download, disk full) is now also swallowed rather
  than surfaced as a hard error. Accepted: `install all` already treats `BEST_EFFORT_NPM_DEPS`
  failures this way, the warning-level log line still surfaces the failure, and `install status` /
  a re-run remain the way to confirm and retry.
* Neutral: at runtime, a browser skipped at install time behaves exactly like a broken/missing
  driver already does — ADR 01008's cross-engine fallback and diagnostic skip reporting apply
  unchanged.

### Confirmation

Red→green unit test in `test/runtime-installer.test.js` (`installBrowsers` describe block): a fake
`browsersModule.install` that throws for `chromedriver` but succeeds for `firefox`; asserts the batch
resolves (not rejects), `chromedriver`'s report is `action: "skipped"`, and `firefox` still installs
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
* Bad: extra allowlist to keep in sync with upstream platform support that isn't declared anywhere
  in this codebase; no asset here actually has a "must always work" guarantee across the full
  platform/arch matrix doc-detective supports.

## More Information

Root-cause chain and cross-arch verification: `@puppeteer/browsers`
(`node_modules/@puppeteer/browsers/lib/browser-data/chromedriver.js` /`chrome.js`) maps
`BrowserPlatform.LINUX_ARM` to the `linux64` (x64) download for both Chrome and chromedriver — there
is no native `linux-arm64` Chrome for Testing build upstream. See [src/runtime/AGENTS.md](../src/runtime/AGENTS.md)
for the surrounding JIT-install architecture and [ADR 01008](01008-resilient-any-browser-driver-fallback.md)
for the runtime-side fallback this decision relies on.
