---
status: accepted
date: 2022-04-22
decision-makers: doc-detective maintainers
---

# Initial browser-driving engine and platform-keyed browser fallback

## Context and Problem Statement

The genesis of the tool (then `doc-unit-test`, GPL-3.0) needed a way to drive a real browser so documented UI steps could be executed and verified. The first commit (`9c52a7c3`, 2022-04-22) shipped a `selenium-webdriver ^4.1.1` CLI scaffold (`Builder.forBrowser('chrome')`, `By`/`Key`/`until`). Within a week a recording-engine experiment added Puppeteer (`5bef4db5`, 2022-04-28), which then became the runner engine over the following weeks. Browsers are not always at a predictable path across operating systems, so the launcher also needed a fallback strategy when the default launch failed. How should the tool drive a browser and recover when no browser is found at the expected location?

## Decision Drivers

* Need to execute documented UI steps against a real browser.
* Recording a session (for media artifacts) needs a programmatic browser API.
* Cross-platform: Linux, macOS, and Windows have different browser install paths.
* A launch failure must degrade gracefully rather than crash with an opaque error.

## Considered Options

* **Selenium WebDriver, then pivot to Puppeteer with a platform-keyed path fallback** (chosen).
* **Selenium WebDriver only** (no recording engine, no fallback).
* **Puppeteer only from the start.**

## Decision Outcome

Chosen option: **Selenium first, then Puppeteer with platform-keyed fallback**, because the recording experiment required Puppeteer's programmatic API and it proved a better fit for the runner, while the fallback table made launches robust across machines.

Behavior decided:

1. The runner drives a browser programmatically; the engine settled on **Puppeteer** (added alongside `puppeteer-screen-recorder` for recording) after the initial `selenium-webdriver` scaffold.
2. On a Puppeteer launch failure, the launcher tries **platform-specific default browser paths** (chromium/chrome/firefox for `linux`/`darwin`/`win32`) before surfacing an error (`2f25959a`, 2022-09-26).

### Consequences

* Good: a single programmatic engine drives both execution and recording.
* Good: launches survive non-standard browser install locations across the three major OSes.
* Bad: bundling a browser-control engine adds a heavy runtime dependency.
* Neutral: this engine choice is later superseded by the Appium/WebdriverIO pivot (see ADR 00042).

### Confirmation

Observable in the shipped `package.json` dependency set (`selenium-webdriver`, then `puppeteer`/`puppeteer-screen-recorder`) and the platform-keyed fallback branch in the launcher before the error path.

## Pros and Cons of the Options

### Selenium → Puppeteer with platform fallback
* Good: recording-capable engine; robust cross-platform launch.
* Bad: two engine migrations early in the project's life.

### Selenium only
* Good: simplest single dependency.
* Bad: no programmatic recording API; brittle launch with no fallback.

### Puppeteer only from the start
* Good: avoids the Selenium detour.
* Bad: not how history actually unfolded; Selenium seeded the original CLI shape.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `9c52a7c3`, `5bef4db5`, `2f25959a`. Inventory ref: BACKFILL-INVENTORY.md Seq 1, 6, 38. Superseded by ADR 00042 (Puppeteer→Appium/WebdriverIO pivot).
