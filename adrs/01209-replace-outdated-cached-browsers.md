---
status: accepted
date: 2026-11-15
decision-makers: doc-detective maintainers
---

# Replace outdated cached browsers

## Context and Problem Statement

Doc Detective installs Chrome, ChromeDriver, Firefox, and Geckodriver into `<cacheDir>/browsers` and
records each in `installed.json`. Once installed, a Chrome-family or Firefox build was never replaced
without `install browsers --force`. When the channel moved on, the CLI warned and kept the old build.
A test run checked nothing at all for a browser that was already available. Geckodriver did
download a new release once its daily check came due, but left every earlier
`geckodriver-<version>` binary on disk.

The Doc Detective GitHub Action caches the cache root across workflow runs. Because the CLI never
refreshed it, the action had to rotate its cache key weekly, which forces a full uncached reinstall
every week. The action wants one long-lived cache that refreshes itself, saving a new entry only
when an `installedVersion` in `installed.json` changes. Should the CLI keep cached browsers current?

## Decision Drivers

- Tests should run against the browser builds users have, which keep moving.
- A cache that is saved and restored repeatedly must not grow without bound.
- A run must never fail, or stall, because a version check or download failed.
- Checks must not hit the network on every run.
- `installedVersion` changes only when the installed build changes, because the action hashes it.
- Offline and pinned setups need a way out.

## Considered Options

- **A. Replace an outdated build wherever `ensureBrowserInstalled` runs, and have the run's
  preflight check cached browsers once a day.**
- **B. Replace only from `install` commands.** A test run keeps warning.
- **C. Keep warn-only, and leave refreshing to callers (`--force`).**

## Decision Outcome

Chosen option: **A**.

- `ensureBrowserInstalled` is the single place every path goes through (`install all`,
  `install browsers`, postinstall, and the run's lazy install). When it learns the channel's
  latest build differs from the installed one, it installs the new build, validates the driver as
  before, records it, and removes the previous build's directory (Chrome family through
  `@puppeteer/browsers` `uninstall`; Geckodriver by deleting the other `geckodriver-<version>`
  binaries at the cache root).
- The channel check is throttled by the existing 24-hour `latestCheckedAt` TTL. Within the TTL no
  network call is made. A failed check or failed download logs a warning, records
  `latestCheckedAt` so the next attempt waits a day, and keeps using the installed build. Only a
  missing browser with no fallback still raises.
- A test run's preflight now also calls `ensureBrowserInstalled` for each needed browser that is
  already available from the cache, but only when its check is due (`browserRefreshDue`). When a
  build changed, the available-apps cache is cleared so the run re-probes the new paths.
- `installedVersion` and `installedAt` change only when a new build lands. `latestKnownVersion`
  and `latestCheckedAt` may change on any check.
- `DOC_DETECTIVE_SKIP_BROWSER_UPDATE=1` turns off the replacement (the outdated build is kept with
  a warning, as before). It doesn't stop a first install, and `--force` still reinstalls. It is
  separate from `DOC_DETECTIVE_SKIP_AUTO_UPDATE`, which CI and cache-warming jobs set to pin the CLI
  version while still wanting fresh browsers.

### Consequences

- Good: caches stay current with no key rotation; the action's cache saves only on real changes.
- Good: the cache holds one build per browser.
- Bad: the first run after a channel release downloads the new build (~150 MB for Chrome).
- Bad: an image with a baked, read-only or pinned cache (such as the Docker image) should set
  `DOC_DETECTIVE_SKIP_BROWSER_UPDATE=1`, or each container started more than a day after the image
  was built downloads new builds.
- Neutral: Chrome and ChromeDriver update independently; both follow the `stable` channel, so they
  normally land together. If one download fails, the other may be a build ahead until the next
  check.

### Confirmation

Unit tests in `test/runtime-browsers.test.js` cover replacement, pruning, throttling, failure
fallback, the opt-out, and `browserRefreshDue`.

## Pros and Cons of the Options

### A. Replace everywhere, check daily at run time

- Good: one code path; self-refreshing caches.
- Bad: a run can spend time downloading after a channel release.

### B. Replace only from install commands

- Good: runs never download.
- Bad: the action and most users never run `install` after the first time, so caches still go stale.

### C. Keep warn-only

- Good: no change.
- Bad: the action must keep rotating its cache key and re-downloading everything weekly.
