# CI install-cache warming

How the Doc Detective install cache (`~/.dd-cache`: browsers, drivers, heavy
runtime npm deps, git-bash) is persisted across CI runs, kept warm, and
repaired when something goes wrong.

## Design

- **Single home for the mechanics.** The junction (default cache location →
  persistent dir), the ISO-week key computation, and the `actions/cache` call
  live in one composite action:
  [.github/actions/dd-cache/action.yml](../../.github/actions/dd-cache/action.yml).
  `test.yml`, `fixtures.yml`, and `cache-warmer.yml` all call it, so
  producer/consumer key drift is structurally impossible. **Never hand-copy
  the key template into a workflow.**
- **The key rotates on ISO week on purpose.** Browser channels float
  (`stable`/`latest`) and a present-but-outdated browser is warn-only — it
  never re-downloads — so an entry restored across weeks would pin old
  browsers forever. Weekly cold refresh is the mechanism that keeps browsers
  current.
- **The warmer removes the weekly cold window.** `Cache Warmer` runs Sunday
  23:47 UTC and computes the key for now+2h (`weekOffsetHours: '2'`), so next
  week's entry exists *before* the key rolls over at Monday 00:00 UTC. The odd
  minute dodges GitHub's delay-prone top-of-hour cron slots.

## Repair recipes

- **A week's entry is bad or incomplete** (e.g. a browser download 503'd
  during the warm — `install all` is best-effort for browsers, so the job
  stays green and saves what it got): cache entries are **immutable**;
  re-dispatching the warmer restores the existing entry as an exact hit and
  saves nothing. Delete the entry first, then dispatch:

  ```bash
  gh cache list --key dd-cache- --json id,key,createdAt
  gh cache delete "<full key>"
  gh workflow run "Cache Warmer"   # from the default branch
  ```

- **Dispatch from the default branch only.** Cache entries are branch-scoped:
  an entry saved by a dispatch from a feature branch is invisible to other
  branches' PRs — the run goes green while warming nothing anyone uses.
- **Cron stopped firing?** GitHub disables schedules after 60 days without
  repo activity, and can delay or drop runs in high-load slots. A missed warm
  is benign — the first PR of the week just pays the cold install.

## Accepted trade-offs

- **Partial saves beat no saves.** Browser installs are best-effort (#611), so
  a flaky download yields a green warm with a missing asset; consumer jobs
  JIT-install what's missing. Do not "harden" the warmer to fail on partial
  installs — a failed job saves nothing at all.
- **App-surface Appium drivers are not warmed — with one exception.**
  `install all` covers `HEAVY_NPM_DEPS` + browsers (+ git-bash on Windows);
  the platform app drivers (mac2/novawindows/uiautomator2) are JIT-installed
  by platform preflights only. That JIT path is deliberately exercised
  (non-destructive installs, ADR 01025). The exception: the warmer's macOS
  leg also runs `install ios --yes`, which installs `appium-xcuitest-driver`
  (through the loader) and prebuilds WebDriverAgent into
  `ios/wda/<Xcode × driver key>/` — the WDA prebuild is keyed on the driver
  version, so warming the driver and the build together is what keeps the
  key honest (docs/design/ios-wda-prebuild.md).
- **Cross-node-line restores are assumed ABI-safe.** The key carries a
  `node<major>` component with a same-week any-node fallback restore-key; the
  heavy native deps are Node-API/prebuilt (chosen for exactly this), so a
  node22 cell topping up from a node24 entry is safe today. Revisit if a
  heavy dep ever compiles per-ABI at install time.
