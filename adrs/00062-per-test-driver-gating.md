---
status: accepted
date: 2023-04-09
decision-makers: doc-detective maintainers
---

# Per-test driver gating and identity defaults

## Context and Problem Statement

Starting a browser/Appium driver is the most expensive part of a run, yet many tests (a `runShell`,
an `httpRequest`, a `checkLink`) never touch a browser at all. Launching a driver for those tests
wastes time and can fail on machines with no browser installed. Separately, tests and steps need
stable identities (a generated id when none is declared) and a default set of contexts to run in
when the author specifies none. How do we decide *when* a driver is required, and how do tests get
their default identity and contexts?

## Decision Drivers

* Don't start a browser/Appium driver unless a test actually needs one.
* Driver-free tests (shell, HTTP, link checks) must run anywhere without a browser.
* Every test/step needs a stable id for reporting even when the author omits one.
* A test with no declared contexts still needs a reasonable default to run against.

## Considered Options

* **A. `isDriverRequired` gate (contexts present OR a step uses a driverAction) + uuid id defaults + `getDefaultContexts()` fallback** (chosen).
* **B. Always start a driver; let driver-free tests ignore it.**
* **C. Require authors to declare driver-need explicitly per test.**

## Decision Outcome

Chosen option: **A**, because driver-need is derivable from the test's own shape, and deriving it
keeps the contract zero-config. A driver is started only when `isDriverRequired` is true — the test
declares contexts, or at least one step uses a driver action (`driverActions`); architecture is read
via `os.arch()` so the right driver is chosen. For identity, each step is assigned a generated uuid
when it has no declared `id`. For contexts, `getDefaultContexts()` derives defaults from
`runTests.contexts` filtered by platform/driver support, falling back to `["chrome","firefox"]` when
nothing else applies.

### Consequences

* Good: driver-free tests run with no browser present; faster runs.
* Good: stable ids for reporting without author effort.
* Good: tests with no contexts still execute against a sensible default pair.
* Neutral: the `["chrome","firefox"]` fallback is later revisited (Firefox-first fallback ordering,
  default-context redesign).

### Confirmation

Shipped in core `11da5c8d`, `85f768bf` (`isDriverRequired`, `os.arch()` gating) and core `2f84a47`,
`652457f` (uuid id defaults, `getDefaultContexts()`). Exercised by driver-free fixtures (shell/HTTP)
running on machines without a browser and by context-defaulting tests.

## Pros and Cons of the Options

### A. Derived `isDriverRequired` + identity/context defaults
* Good: zero-config; cheapest correct path; stable identities.
* Bad: gating logic must enumerate which actions are driver actions.

### B. Always start a driver
* Good: trivial.
* Bad: wastes time; fails where no browser exists.

### C. Explicit per-test declaration
* Good: unambiguous.
* Bad: authoring burden; easy to get wrong.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `11da5c8d`, `85f768bf`
(driver gating), `2f84a47`, `652457f` (identity/contexts). Inventory ref: BACKFILL-INVENTORY.md
Seq 92, 79. Related: `00044` (context platform gating), `00033` (GUI-only browser session gating),
`00079` (browser fallback ordering), `00109` (default-context fallback).
