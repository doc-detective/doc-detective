---
status: accepted
date: 2023-02-28
decision-makers: doc-detective maintainers
---

# Gate test execution on `contexts` (application + platforms)

## Context and Problem Statement

A single test suite often targets different browsers and operating systems, but not every test can
run everywhere — a test that drives Firefox can't run where Firefox isn't installed, and a
macOS-only flow shouldn't fail on Linux. With the Appium/WebdriverIO engine (`00042`) able to drive
several browsers, the core needed a declarative way to say "run this test only in these
environments" and to skip — not fail — elsewhere. How should specs and tests declare where they
apply, and how should the runner decide whether to run?

## Decision Drivers

* Let authors target specific applications and platforms per spec/test.
* Skip (not fail) tests whose declared environment doesn't match the host.
* A "supported" application must be both installed **and** platform-appropriate.
* Compute the host environment once (platform + arch) and reuse it for every gating decision.

## Considered Options

* **A. Declarative `contexts: {application, platforms[]}` with skip-on-no-match** (chosen).
* **B. Fail tests that target an unavailable environment.**
* **C. Implicit detection only, no author-facing targeting.**

## Decision Outcome

Chosen option: **A**, because authors need explicit control and the non-matching case must be a
*skip*, so a cross-platform suite stays green. Each spec/test carries `contexts`, an array of
`{application, platforms[]}` entries. The runner computes the host's platform and architecture,
then for each test checks whether any context matches: an application is supported only if it is
**installed AND its platform matches**. If no context matches, the test is skipped rather than run
or failed. This becomes the engine's environment-gating contract that later evolves into
`context_v2` (`00049`) and `context_v3` browsers (`00098`), and pairs with driver gating (`00062`)
and headless retry (`00085`).

### Consequences

* Good: cross-platform suites stay green — unsupported environments skip cleanly.
* Good: targeting is explicit and authored, not guessed.
* Bad: authors must enumerate contexts; an over-narrow context silently skips a test everywhere.
* Neutral: "installed AND platform matches" couples gating to app-detection accuracy (`00058`).

### Confirmation

Context computation and the skip-on-no-match path live in `doc-detective-core`; observable as
SKIPPED verdicts when a host matches none of a test's declared contexts.

## Pros and Cons of the Options

### A. Declarative contexts, skip on no match
* Good: explicit targeting; green cross-platform suites.
* Bad: requires authors to maintain context lists.

### B. Fail on unavailable environment
* Good: surfaces gaps loudly.
* Bad: a portable suite can't pass everywhere; defeats the purpose of targeting.

### C. Implicit detection only
* Good: zero author effort.
* Bad: no way to express intentional targeting or document-as-tests portability.

## More Information

Recorded retrospectively (ADR backfill). Origin: core commits `9c6ce82d`, `01cc3fd9`, `8f51b195`
(context gating). Inventory ref: BACKFILL-INVENTORY.md Seq 65. Evolves into `00049` (`context_v2`)
and `00098` (`context_v3`); related: `00062`, `00085`.
