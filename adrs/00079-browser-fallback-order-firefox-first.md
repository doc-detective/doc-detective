---
status: accepted
date: 2024-04-16
decision-makers: doc-detective maintainers
---

# Firefox-first browser fallback with driver-availability gating

## Context and Problem Statement

When a test did not pin a specific browser, the runner chose a default from a fallback list that was
chromium-first. But "is this browser usable?" depended only on the binary being present, not on
whether the matching Appium driver was actually installed — so the runner would pick a browser it
could not drive and fail at session start. Recording (`00073`) was also only reliable on headed
Chrome, yet nothing gated it. What should the default fallback order be, and what must be true for a
browser to be selectable?

## Decision Drivers

* The default browser should favor an engine that is broadly available and driveable.
* A browser is only usable if its Appium driver is installed, not merely if the binary exists.
* Recording must be gated to the one configuration where it works (headed Chrome).
* Browser capability names must match what Appium expects (e.g. Edge → `MicrosoftEdge`).

## Considered Options

* **A. Firefox-first fallback `["firefox","chrome","safari","edge"]`, gate availability on the
  installed Appium driver, invoke Appium via `npx appium`, and gate recording to headed Chrome**
  (chosen).
* **B. Keep chromium-first and gate only on the binary.**
* **C. Probe every browser at startup and pick the fastest to launch.**

## Decision Outcome

Chosen option: **A**, across two inventory rows:

1. **Fallback order** (`core`, commits `054ee6ae`, `4b7434`): default fallback becomes
   `["firefox","chrome","safari","edge"]` (was chromium-first); only the first **available** app is
   selected.
2. **Availability gating** (`core`, commits `b43787`, `190fbd`, `ae6990`, `b9e346`, `46430f`): a
   browser is available only if its Appium **driver is installed**; Appium is invoked via
   `npx appium`; `browserName` caps are corrected (e.g. `edge` → `MicrosoftEdge`); recording is gated
   to **headed Chrome**; the obsolete macOS `platformName` remap is removed.

## Pros and Cons of the Options

### A. Firefox-first + driver-availability gating (chosen)
* Good: never selects an undriveable browser; recording only runs where it works; correct caps.
* Bad: default-browser choice changed (chromium-first users may see Firefox selected).

### B. Chromium-first, binary-only gating
* Good: no change for existing users.
* Bad: picks browsers with no driver → session-start failures.

### C. Startup probe of all browsers
* Good: always picks a launchable browser.
* Bad: costly probing every run; complexity for little gain.

### Consequences

* Good: the runner only selects browsers it can actually drive; fewer start-up failures.
* Good: recording reliably gated to its supported configuration.
* Bad: the default-browser change is observable for users who didn't pin a browser.
* Neutral: the fallback order is later revisited in the v3 default-context fallback logic.

### Confirmation

Firefox-first fallback in `doc-detective-core` (`054ee6ae`, `4b7434`); driver-availability gating,
`npx appium` invocation, cap fixes, and headed-chrome recording gate in (`b43787`, `190fbd`,
`ae6990`, `b9e346`, `46430f`).

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `054ee6ae`, `4b7434`,
`b43787`, `190fbd`, `ae6990`, `b9e346`, `46430f`. Inventory ref: BACKFILL-INVENTORY.md Seq 116, 117.
Related: `00001` (initial engine + browser fallback), `00073` (Edge + chrome-only recording),
`00109` (default-context fallback).
