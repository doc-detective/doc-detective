---
status: accepted
date: 2022-04-27
decision-makers: doc-detective maintainers
---

# Remote Selenium server configuration field

## Context and Problem Statement

In the Selenium-driven era the runner launched a browser locally, but some users run tests against a remote Selenium grid or a containerized browser rather than a browser on the local machine. The commit `f4d28e35` (2022-04-27) added a `seleniumServer` config field (defaulting to an empty string) holding a remote Selenium driver URL. How should the tool let users target a remote browser driver instead of a local one?

## Decision Drivers

* CI and grid setups expose a remote WebDriver endpoint rather than a local browser.
* The default must remain "drive locally" so existing users are unaffected.
* The remote endpoint should be a single, declarative config value.

## Considered Options

* **A `seleniumServer` URL config field** (chosen).
* **Auto-detect a running Selenium grid.**
* **Local-only driving (no remote support).**

## Decision Outcome

Chosen option: **a `seleniumServer` URL config field**, because a single declarative URL is the simplest way to redirect the WebDriver connection, and an empty default preserves local behavior.

Behavior decided:

1. `seleniumServer` is a config field holding the remote Selenium driver URL.
2. Its default is the empty string, which keeps the runner driving a local browser.

### Consequences

* Good: enables grid/remote-browser execution with one config value.
* Good: empty default is fully backward compatible.
* Neutral: tied to the Selenium engine; rendered obsolete by the later Puppeteer and then Appium/WebdriverIO pivots (ADR 00001, ADR 00042).

### Confirmation

Observable in `bin/config.json` as `seleniumServer: ""`.

## Pros and Cons of the Options

### `seleniumServer` URL field
* Good: simple, declarative, backward compatible.
* Bad: engine-specific; does not survive the engine pivots.

### Auto-detect a grid
* Good: zero config when a grid is present.
* Bad: brittle and surprising; harder to make deterministic.

### Local-only
* Good: nothing to configure.
* Bad: no CI/grid story.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `f4d28e35`. Inventory ref: BACKFILL-INVENTORY.md Seq 5. Related: ADR 00001 (engine), ADR 00042 (Appium/WebdriverIO pivot, which supersedes this Selenium-era field).
