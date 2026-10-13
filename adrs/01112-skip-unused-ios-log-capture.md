---
status: accepted
date: 2026-10-11
decision-makers: doc-detective maintainers
---

# Skip the iOS device log capture Doc Detective never reads

## Context and Problem Statement

By default, every XCUITest session starts capturing the simulator's crash and system logs, plus
Safari's console and network logs in a web session. Appium's log for the `apps-ios` fixtures shows
that capture taking 4.6–12.5 s at the start of each session. Doc Detective never reads any of these
logs: nothing in `src/core` calls `getLogs` or reads a syslog.

## Decision Drivers

* iOS session startup time, paid on every session.
* Don't remove anything a user relies on, and leave a way to turn the capture back on.

## Considered Options

* **A. Set `appium:skipLogCapture: true` on both iOS capability builders** (chosen).
* **B. Leave the capture on.**

## Decision Outcome

Chosen option: **A**. iOS app sessions and Safari sessions set `appium:skipLogCapture: true`. App
surfaces merge `driverOptions` after the defaults, so `"appium:skipLogCapture": false` in a
`startSurface` step's `driverOptions` restores the capture for anyone driving Appium's log
endpoints themselves.

### Consequences

* Good: about 5–12 s less per iOS session.
* Neutral: no Doc Detective feature reads these logs, so nothing user-visible changes, and there's
  no documentation change.

### Confirmation

* Unit tests: both builders set the capability, and `driverOptions` can turn it off.
* Three single-leg runs per iOS fixture leg (`fixtures-debug.yml`). Each context's PASS/SKIP result
  matches the baseline, and median startup drops against the previous round.

## Pros and Cons of the Options

### A. Skip the capture

* Good: a one-line saving on every session.
* Bad: logs a user might have reached through Appium directly are off unless re-enabled.

### B. Keep capturing

* Good: no change.
* Bad: pays 5–12 s per session for logs nobody reads.
