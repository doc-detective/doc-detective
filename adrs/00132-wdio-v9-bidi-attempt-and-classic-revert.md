---
status: accepted
date: 2025-11-05
decision-makers: doc-detective maintainers
---

# WebdriverIO v9 + BiDi migration attempt, reverted to classic

## Context and Problem Statement

The runner drives browsers through WebdriverIO. A migration to WebdriverIO v9 with the WebDriver
BiDi protocol promised modern element semantics — removing `wdio:enforceWebDriverClassic`, using
`isDisplayed({ withinViewport: true })`, and lowercase cookie `sameSite` values. In practice the
BiDi path proved unstable across the supported drivers. The question: do we ship the BiDi protocol
migration, or keep WebdriverIO v9 while staying on the classic WebDriver protocol?

## Decision Drivers

* Element interaction (visibility, finding, cookies) must behave reliably across chrome/firefox/safari.
* Staying current on the WebdriverIO major (v9) is desirable for support and dependency health.
* Protocol instability (BiDi) must not regress existing passing tests.
* Element finding should tolerate transient not-yet-present states without spurious failures.

## Considered Options

* **A. Adopt WebdriverIO v9 but revert the BiDi protocol changes, keeping classic WebDriver; switch
  `findElement` to a polling strategy** (chosen).
* **B. Ship the full v9 + BiDi migration as authored.**
* **C. Stay on the prior WebdriverIO major to avoid the migration entirely.**

## Decision Outcome

Chosen option: **A**, because the v9 upgrade is worth keeping for dependency health while the BiDi
protocol changes were the source of instability. The BiDi-specific changes (removing
`enforceWebDriverClassic`, `isDisplayed({ withinViewport: true })`, lowercase cookie `sameSite`) were
reverted, keeping WebdriverIO v9 on the classic protocol. Separately, `findElement` was changed to a
polling strategy so elements that are momentarily absent are retried rather than failing immediately
(commits `f61fc6`, `0743ef`, `4669781`, `doc-detective-core`).

### Consequences

* Good: keeps the WebdriverIO v9 dependency without inheriting BiDi instability.
* Good: polling `findElement` reduces flaky element-not-found failures.
* Bad: the codebase carries v9 while deliberately not using its headline BiDi protocol.
* Neutral: BiDi adoption remains a possible future migration once it stabilizes.

### Confirmation

Shipped in `doc-detective-core` commits `f61fc6`, `0743ef`, `4669781`: the BiDi migration commit
followed by its revert (classic retained, v9 kept) plus the polling `findElement`. Existing
element-interaction tests pass on the classic path.

## Pros and Cons of the Options

### A. v9 + classic protocol (revert BiDi) + polling findElement
* Good: current major, stable protocol, fewer flaky finds.
* Bad: doesn't use BiDi despite being on v9.

### B. Full v9 + BiDi
* Good: modern protocol and element semantics.
* Bad: observed instability across drivers; regresses passing tests.

### C. Stay on prior major
* Good: no migration risk.
* Bad: falls behind on support and dependency health.

## More Information

Recorded retrospectively (ADR backfill). Origin: `doc-detective-core` commits `f61fc6`, `0743ef`,
`4669781`. Inventory ref: BACKFILL-INVENTORY.md Seq 192. Related: `00042` (Puppeteer→Appium/
WebdriverIO pivot), `00114` (find-by-text normalize-space + driver timeouts).
