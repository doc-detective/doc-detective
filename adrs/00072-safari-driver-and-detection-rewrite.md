---
status: accepted
date: 2024-01-22
decision-makers: doc-detective maintainers
---

# Add Safari driver support and rewrite browser detection on @puppeteer/browsers

## Context and Problem Statement

Doc Detective drove Chrome and Firefox through Appium/WebdriverIO, but had no macOS Safari path, and
its browser-binary detection relied on `@eyeo/get-browser-binary`. Two questions came together: how
do we add Safari as a first-class engine on macOS, and what library should locate installed browser
binaries now that the runner is committed to Appium drivers? The lingering OBS recording code was
also dead weight from the abandoned OBS experiment. What is the supported browser set and detection
mechanism going forward?

## Decision Drivers

* macOS users need a native Safari engine, not a Chromium stand-in.
* Browser-binary detection must be reliable and maintained across platforms.
* The browser enum should be a closed, supported set — not "whatever is on PATH".
* Dead OBS recording code should be removed now that FFmpeg is the recording engine (`00069`).

## Considered Options

* **A. Add a Safari driver (CFBundle detect + `automationName: Safari`), switch detection to
  `@puppeteer/browsers`, narrow the browser enum to chrome/firefox/safari with `driverPath`, and
  retire OBS code** (chosen).
* **B. Keep `@eyeo/get-browser-binary` and add Safari detection ad hoc.**
* **C. Skip Safari; leave macOS users on Chrome.**

## Decision Outcome

Chosen option: **A**. The contract decided:

1. **Safari engine** (`core`, commits `25e1c6`, `fd7535`, `e5a8f16`, `1a914a`): detect Safari via its
   macOS CFBundle; drive it with `automationName: Safari`.
2. **Detection rewrite** (`core`, same series): replace `@eyeo/get-browser-binary` with
   `@puppeteer/browsers` for locating installed browser binaries.
3. **Schema** (`common`, commits `1f1850f`, `69360255`, `a44fd49`): browser enum narrowed to
   `chrome`/`firefox`/`safari`; add `driverPath`.
4. **OBS retirement**: the dormant OBS recording code is removed.

## Pros and Cons of the Options

### A. Safari driver + @puppeteer/browsers detection (chosen)
* Good: native Safari on macOS; maintained detection library; closed supported enum.
* Bad: a third browser to test across platforms; Safari is macOS-only (must be context-gated).

### B. Keep get-browser-binary, bolt on Safari
* Good: smaller diff.
* Bad: stays on a less-maintained detection path; inconsistent Safari handling.

### C. No Safari
* Good: nothing to build.
* Bad: macOS docs can't be tested in the platform's default browser.

### Consequences

* Good: macOS Safari is a supported engine; detection is on a maintained library.
* Good: removing OBS code shrinks the recording surface.
* Bad: Safari runs are macOS-only and must be gated by context/platform.
* Neutral: `driverPath` lets advanced users point at a specific driver binary.

### Confirmation

Safari handling and `@puppeteer/browsers` detection in `doc-detective-core` (`25e1c6`…`1a914a`);
browser enum + `driverPath` in `doc-detective-common` (`1f1850f`, `69360255`, `a44fd49`).

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `25e1c6`, `fd7535`,
`e5a8f16`, `1a914a`; doc-detective-common `1f1850f`, `69360255`, `a44fd49`. Inventory ref:
BACKFILL-INVENTORY.md Seq 105. Related: `00042` (Appium/WebdriverIO pivot), `00069` (FFmpeg
recording engine), `00073` (Edge engine + chrome-only recording).
