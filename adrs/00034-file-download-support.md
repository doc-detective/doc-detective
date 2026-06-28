---
status: accepted
date: 2022-10-10
decision-makers: doc-detective maintainers
---

# File-download support via downloadDirectory

## Context and Problem Statement

Documentation procedures frequently include a "click to download" step, but the browser the runner
drove had no configured download location, so downloads either failed silently or landed in an
unpredictable place the test could not assert against. Where should files downloaded during a test
go, and how does the user point the runner at that directory?

## Decision Drivers

* Downloads triggered by a test must land in a known, configurable directory.
* The directory must be settable from both the config file and the CLI.
* The browser must be told to allow downloads to that location rather than prompting.

## Considered Options

* **A. `downloadDirectory` config + `--downloadDir` flag, wired to the browser's download behavior** (chosen).
* **B. Always download to a fixed/temp directory.**
* **C. No download support — out of scope.**

## Decision Outcome

Chosen option: **A**, because a configurable directory lets a test author both trigger and then
assert on downloaded files, and exposing it on the CLI keeps it consistent with other path config.

Behavior decided: add a `downloadDirectory` key to the config plus a `--downloadDir` CLI flag. The
runner calls the browser's `Page.setDownloadBehavior` with `allow` pointed at the resolved
directory, so downloads proceed automatically to a predictable location.

### Consequences

* Good: download steps work and produce files at a known path for later assertions.
* Good: configurable from file and CLI, consistent with other directory settings.
* Neutral: introduces another resolvable path that later config redesigns fold into the unified
  media/download directory derivation.
* Bad: relies on the then-current browser engine's download-behavior API.

### Confirmation

Shipped behavior: `downloadDirectory` in `config.json` and the `setDownloadDirectory` /
`Page.setDownloadBehavior allow` wiring.

## Pros and Cons of the Options

### A. downloadDirectory + flag
* Good: predictable, assertable, configurable.
* Bad: couples to the engine's download API.

### B. Fixed/temp directory
* Good: zero config.
* Bad: unpredictable; hard to assert against; collisions.

### C. No support
* Good: nothing to build.
* Bad: leaves a common documentation step untestable.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `82ceda6f`. Inventory ref:
BACKFILL-INVENTORY.md Seq 46. Related: media/download directory derivation (`00070`).
