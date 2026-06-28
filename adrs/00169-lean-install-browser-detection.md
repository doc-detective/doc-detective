---
status: accepted
date: 2026-06-11
decision-makers: doc-detective maintainers
---

# Lean-install browser detection

## Context and Problem Statement

With heavy dependencies now lazy-installed, `getAvailableApps()` runs in environments where Appium
drivers and browsers may be absent. The detection probed Appium driver presence by matching only
`stdout`, but some Appium builds emit the driver list on `stderr`, so detection missed installed
drivers. And `@puppeteer/browsers` could attempt to auto-install during a detection probe, turning a
read-only "what's available?" check into an install side effect (or a crash when offline). How should
browser/driver detection behave robustly in a lean install?

## Decision Drivers

* Detection must work whether Appium prints its driver list to stdout or stderr.
* A detection probe must be read-only — it must not trigger a heavy install.
* When nothing is available, detection should degrade to an empty app list, not throw.
* Lean installs are now the norm, so detection can't assume drivers/browsers are present.

## Considered Options

* **A. Match Appium driver-presence regexes against combined stdout+stderr, and load `@puppeteer/browsers` with `autoInstall=false`, degrading to an empty app list** (chosen).
* **B. Keep stdout-only matching and let `@puppeteer/browsers` auto-install during detection.**
* **C. Skip detection entirely in lean installs and assume nothing is available.**

## Decision Outcome

Chosen option: **A**, because detection should observe reality across both output streams and never
mutate the environment it is probing. The Appium driver-presence regexes now match combined
`stdout`+`stderr`, and `getAvailableApps()` loads `@puppeteer/browsers` with `autoInstall=false`,
degrading to an empty app list when nothing is found (commits `bfc37c66`, `ff324722`; `config.ts` /
`getAvailableApps`).

### Consequences

* Good: drivers are detected regardless of which stream Appium uses.
* Good: detection is side-effect free — no accidental installs during a probe.
* Good: an empty environment yields an empty app list instead of an error.
* Neutral: detection in a lean install may legitimately return no apps (then provisioning handles it).

### Confirmation

`config.ts` driver-presence regexes match stdout+stderr; `getAvailableApps()` uses
`autoInstall=false` and degrades to empty. Shipped in `bfc37c66`, `ff324722`.

## Pros and Cons of the Options

### A. Combined streams + autoInstall=false
* Good: accurate, read-only, graceful-empty detection.
* Bad: must keep regexes aligned with Appium's output format.

### B. stdout-only + auto-install
* Good: less code.
* Bad: misses stderr-reported drivers; turns probing into installing.

### C. Skip detection in lean installs
* Good: trivial.
* Bad: loses the ability to use already-installed browsers/drivers.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `bfc37c66`, `ff324722`.
Inventory ref: BACKFILL-INVENTORY.md Seq 238. Related: `00164` (runtime lazy-install provisioning),
`00171` (runtime dependency detection + Appium warm-up).
