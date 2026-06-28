---
status: accepted
date: 2026-05-11
decision-makers: doc-detective maintainers
---

# Runtime lazy-install provisioning

## Context and Problem Statement

Doc Detective's heavy dependencies — Appium, webdriverio, the browser drivers, and the browsers
themselves — made `npm i doc-detective` slow, large, and prone to failure on machines that would
never run a browser test. But installing nothing eagerly meant the first real run had to provision
everything just-in-time. How should Doc Detective provision its heavy runtime and browsers: at
install time, on first use, or some staged combination, and how should that provisioning be made
observable and bounded?

## Decision Drivers

* `npm i` must not be dominated by Appium/webdriverio/driver/browser downloads no one may use.
* A real run must still reliably have a browser and driver available when it needs one.
* Provisioning must be observable (logs) and bounded (can't hang an install forever).
* Dry-run install reports must match what a real install would actually fetch.
* Heavy deps belong in a runtime cache, not the published package tree.

## Considered Options

* **A. A runtime cache + lazy-install layer, with an eager-by-default pre-warm that degrades to lazy on timeout, an install log, JIT browser provisioning, and companion-aware install planning** (chosen).
* **B. Eager full install at `npm i` (the prior behavior).**
* **C. Purely lazy: never pre-install; always provision on first run.**

## Decision Outcome

Chosen option: **A**, a staged provisioning chain that defaults to convenient (pre-warmed) but
always falls back to lazy and stays observable and bounded. The chain landed across several commits:

1. **Lazy-install + cache.** Heavy deps and browsers install on demand into a runtime cache
   (`cacheDir`); `src/runtime/{installer,loader,selfUpdate,heavyDeps}.ts` added; `@puppeteer/browsers`
   moved to v3 (node 24); `npm i` stops installing heavy deps (commits `2df7b63c`, `396605c3`,
   `f995df9f`, PR #305).
2. **Eager default with opt-out.** postinstall eagerly pre-installs the heavy runtime + browsers by
   default; opt out with `DOC_DETECTIVE_INSTALL_RUNTIME=0`; npm noise filtered (commit `6811c534`,
   PR #316).
3. **Install log.** The installer tees full npm output to `<cacheDir>/runtime/install.log`; failures
   name the log path (commit `2b620b24`, PR #318).
4. **JIT Chrome.** `getRunner().ensureChromeAvailable()` self-provisions Chrome on first use
   regardless of `DOC_DETECTIVE_AUTOINSTALL`, invalidating the app cache and re-detecting (commit
   `0c843769`).
5. **Companions + accurate planning.** `withPeerCompanions` expansion so dry-run and real install
   reports match actual installs; `parseSemverCore` anchored with `$` for OR/composite ranges
   (commits `23b54636`, `0257797d`, `19e19121`).
6. **Bounded pre-warm.** postinstall enforces a 10-minute wall-clock ceiling that kills the runtime
   pre-warm child non-fatally — it falls back to lazy install and exits 0 (commit `fb99ca7a`).

Net contract: heavy runtime/browsers live in `cacheDir`, are pre-warmed by default (opt-out env),
fall back to lazy/JIT provisioning, are logged, time-bounded, and reported consistently between
dry-run and real installs.

### Consequences

* Good: `npm i` is no longer dominated by heavy downloads; first run still works (lazy/JIT).
* Good: provisioning is observable (`install.log`) and bounded (10-min ceiling, non-fatal).
* Good: dry-run install reports match real installs via companion-aware planning.
* Neutral: behavior depends on `DOC_DETECTIVE_INSTALL_RUNTIME` and `DOC_DETECTIVE_AUTOINSTALL` env.
* Bad: more moving parts (cache, pre-warm, lazy, JIT) to reason about when diagnosing install issues.

### Confirmation

`src/runtime/{installer,loader,selfUpdate,heavyDeps}.ts`, the postinstall pre-warm + timeout, the
`<cacheDir>/runtime/install.log`, and `ensureChromeAvailable()` ship the chain. Shipped across
PRs #305, #316, #318 and commits `0c843769`, `23b54636`/`0257797d`/`19e19121`, `fb99ca7a`.

## Pros and Cons of the Options

### A. Staged cache + lazy/eager/JIT provisioning
* Good: fast installs, reliable runs, observable and bounded; opt-out available.
* Bad: the most complex of the three; several env switches and fallbacks.

### B. Eager full install at `npm i`
* Good: simplest mental model; everything present after install.
* Bad: slow, large installs; fails on machines that never run browsers.

### C. Purely lazy
* Good: minimal install footprint.
* Bad: first run pays the full provisioning cost with no pre-warm convenience.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `2df7b63c`/`396605c3`/
`f995df9f` (PR #305), `6811c534` (PR #316), `2b620b24` (PR #318), `0c843769`,
`23b54636`/`0257797d`/`19e19121`, `fb99ca7a`. Inventory ref: BACKFILL-INVENTORY.md Seq 227, 231,
233, 234, 236, 239. Related: `00159` (coding-agent postinstall detection), `00166` (node 22 engines
floor), `00171` (runtime dependency detection + Appium warm-up).
