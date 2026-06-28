---
status: accepted
date: 2023-02-09
decision-makers: doc-detective maintainers
---

# Pivot the browser engine from Puppeteer to Appium + WebdriverIO

## Context and Problem Statement

The genesis engine drove browsers through Selenium and a Puppeteer recording experiment
(see `00001`), which limited Doc Detective to a narrow set of Chromium-flavored targets and made
multi-browser support awkward. As `doc-detective-core` took shape, we needed a driver layer that
could automate Chrome **and** Firefox through one client and leave room for more engines later.
Should the new core keep Puppeteer, or adopt the Appium/WebdriverIO stack?

## Decision Drivers

* Drive multiple browsers (Chrome, Firefox, and later Safari/Edge) through one client API.
* A standard WebDriver automation surface rather than a Chromium-specific protocol.
* A predictable, tear-downable driver lifecycle the runner fully owns.
* Room to grow toward mobile/app automation that Appium natively supports.

## Considered Options

* **A. Appium server + WebdriverIO (`wdio.remote`) client** (chosen).
* **B. Keep Puppeteer.**
* **C. Raw Selenium WebDriver only.**

## Decision Outcome

Chosen option: **A**, because Appium speaks WebDriver to every supported browser and WebdriverIO
gives a single ergonomic client, replacing the Chromium-bound Puppeteer path. The runner owns the
full driver lifecycle: start an **in-process Appium** server, poll its `/sessions` endpoint until
ready, open a session via `wdio.remote`, run the test's steps against that session, then
`deleteSession` to tear it down. This becomes the core's standard "how do we drive a browser"
contract and the foundation every later engine decision builds on (child-process Appium in `00056`,
per-context options in `00061`, driver gating in `00062`, browser-fallback order in `00079`).

### Consequences

* Good: one client drives Chrome and Firefox; clear lifecycle the runner controls end to end.
* Good: opens the door to Safari/Edge and Appium-native app automation later.
* Bad: an Appium server must be running — added startup latency and a process to manage.
* Neutral: Puppeteer-specific recording capabilities are dropped here; recording is rebuilt on a
  separate track (see the recording-engine ADRs).

### Confirmation

The driver lifecycle (in-process Appium → poll `/sessions` → `wdio.remote` → `deleteSession`)
is implemented in `doc-detective-core`'s runner; observable as live Chrome/Firefox sessions during
a run.

## Pros and Cons of the Options

### A. Appium + WebdriverIO
* Good: multi-browser via WebDriver; single client; extensible to apps.
* Bad: extra server process and startup cost.

### B. Keep Puppeteer
* Good: no new server; fast Chromium automation.
* Bad: Chromium-bound; weak multi-browser story.

### C. Raw Selenium only
* Good: standard WebDriver.
* Bad: heavier client ergonomics; no Appium app-automation runway.

## More Information

Recorded retrospectively (ADR backfill). Origin: core commits `9968861f`, `f8a5b3f7`, `bac9ef13`
(Appium/WebdriverIO adoption + driver lifecycle). Inventory ref: BACKFILL-INVENTORY.md Seq 62.
Supersedes the engine in `00001`; refined by `00056`, `00061`, `00062`, `00079`.
