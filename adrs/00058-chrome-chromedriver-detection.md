---
status: accepted
date: 2023-06-03
decision-makers: doc-detective maintainers
---

# Detect Chrome and install a version-matched chromedriver as its own app

## Context and Problem Statement

Early app detection was Firefox-only; Chrome/Chromium detection existed but was disabled
(`getAvailableApps` returned `{name, path}[]` with Chrome paths suppressed). To run tests in Chrome,
the runner needed to find the installed Chrome binary and pair it with a chromedriver whose version
matches that Chrome — a mismatched chromedriver fails to drive the browser. How should the runner
detect Chrome and obtain the correct chromedriver, and how should that chromedriver be represented to
the driver layer?

## Decision Drivers

* Chrome should be a usable target alongside Firefox, not a disabled stub.
* The chromedriver version must match the detected Chrome version.
* The chromedriver must be discoverable by the Appium/WebdriverIO layer that launches it.
* Detection should slot into the existing `getAvailableApps` contract.

## Considered Options

* **A. Enable Chrome/Chromium detection in `getAvailableApps`; install a version-matched chromedriver, track it as its own app, and pass it via the `appium:executable` capability** (chosen).
* **B. Bundle a single fixed chromedriver version and hope it matches.**
* **C. Require users to install a matching chromedriver themselves.**

## Decision Outcome

Chosen option: **A**, because version-matching the chromedriver to the detected Chrome is the only
reliable way to drive Chrome, and representing the chromedriver as a tracked app lets the driver layer
locate it through the normal capability path. Chrome/Chromium detection is enabled in
`getAvailableApps`; a chromedriver matching the detected Chrome version is installed and tracked as
its own app entry; the driver receives its location via the `appium:executable` capability.

### Consequences

* Good: Chrome becomes a first-class target with a guaranteed-compatible driver.
* Good: version matching avoids the classic Chrome/chromedriver mismatch failures.
* Bad: detection + matched-driver install adds moving parts that track Chrome's release cadence.
* Neutral: chromedriver-as-an-app fits the existing detection contract without a special case.

### Confirmation

Shipped in `core` `2e427314`, `9c93993e`, `b19a6c50`. Confirmed by `getAvailableApps` returning Chrome
and a matched chromedriver, and the `appium:executable` capability pointing the driver at it.

## Pros and Cons of the Options

### A. Detect Chrome + matched chromedriver as its own app
* Good: reliable Chrome automation; version-correct driver; fits the detection contract.
* Bad: ongoing maintenance to track Chrome versions.

### B. Bundle a fixed chromedriver
* Good: simplest to ship.
* Bad: breaks whenever the user's Chrome version drifts from the bundled driver.

### C. User-installed chromedriver
* Good: no install-time work.
* Bad: setup burden; frequent version mismatches.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-core` commits `2e427314`, `9c93993e`,
`b19a6c50`. Inventory ref: BACKFILL-INVENTORY.md Seq 85. The detection mechanism was later rewritten
around `@puppeteer/browsers` (ADR 00072) and additional browsers (Safari, Edge) were added (ADR 00072,
00073).
