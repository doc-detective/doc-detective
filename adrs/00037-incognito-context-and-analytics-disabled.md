---
status: accepted
date: 2022-10-24
decision-makers: doc-detective maintainers
---

# Incognito browser context by default and analytics globally disabled

## Context and Problem Statement

Reusing a single persistent browser profile across tests let state — cookies, cache, storage — leak
between tests, making runs order-dependent and non-reproducible. At the same time the runner still
carried an analytics-send path that phoned home during runs. Should each test get an isolated
browser context, and should the analytics path remain active?

## Decision Drivers

* Tests must be isolated from each other's browser state for reproducibility.
* Each test should start from a clean session by default.
* Sending analytics during test runs is undesirable for a CLI tool users run in CI and locally.

## Considered Options

* **A. Open pages in an incognito context per default; disable the analytics send path** (chosen).
* **B. Keep a shared persistent profile; keep analytics.**
* **C. Add explicit per-test profile-reset steps users must author.**

## Decision Outcome

Chosen option: **A**, because an incognito context gives clean, isolated state for free, and
disabling analytics removes unexpected network traffic from a developer tool.

Behavior decided: browser pages are opened in an incognito context by default
(`createIncognitoBrowserContext`), so each session starts without inherited cookies/cache/storage.
The analytics send path is globally disabled (`sendAnalytics` commented out), so runs do not emit
telemetry.

### Consequences

* Good: reproducible, isolated runs; no cross-test state leakage by default.
* Good: no surprise network calls from the runner.
* Neutral: the whole analytics/telemetry path is later removed outright in the config-v2 rewrite;
  this is the point where it stopped firing.
* Bad: tests that *wanted* shared session state must opt into it explicitly (later cookie
  save/load actions fill this gap).

### Confirmation

Shipped behavior: `createIncognitoBrowserContext` for page creation and the commented-out
`sendAnalytics` call.

## Pros and Cons of the Options

### A. Incognito-by-default + analytics off
* Good: clean isolation; no telemetry; minimal change.
* Bad: shared-state tests need explicit opt-in.

### B. Persistent profile + analytics
* Good: nothing to change.
* Bad: state leakage; non-reproducible; unwanted telemetry.

### C. Manual per-test resets
* Good: explicit.
* Bad: boilerplate in every test; easy to forget.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `900347f7`, `745d0b4b`,
`0eb8c6b1`. Inventory ref: BACKFILL-INVENTORY.md Seq 51. Related: GUI-only session gating (`00033`),
the analytics removal in the config-v2 rewrite (`00051`), and cookie save/load actions (`00123`).
