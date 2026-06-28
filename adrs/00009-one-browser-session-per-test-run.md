---
status: accepted
date: 2022-05-06
decision-makers: doc-detective maintainers
---

# One browser session per test run

## Context and Problem Statement

The runner originally constructed the browser driver inside the per-action loop, which meant a fresh browser session could be built repeatedly within a single test. The commit `0247859b` (2022-05-06) hoisted the `Builder` out of the per-action loop so the session is created once per test run. What should the lifecycle of a browser session be relative to the actions of a test?

## Decision Drivers

* A browser session is expensive to start; rebuilding it per action is wasteful.
* Actions within a test must share page state (navigation, cookies, DOM).
* A single session per run is the natural unit for a sequence of steps.

## Considered Options

* **One browser session per test run** (chosen).
* **A fresh browser session per action.**
* **One shared session across the entire process (all tests).**

## Decision Outcome

Chosen option: **one session per test run**, because the actions of a test are a single interactive sequence that must share page state, and rebuilding the driver per action would discard that state and waste startup cost.

Behavior decided:

1. The browser `Builder` is constructed once, above the action loop, so all actions in a test run share one session.

### Consequences

* Good: actions share navigation/cookie/DOM state as authors expect.
* Good: avoids repeated, costly driver startup within a test.
* Neutral: later work refines *when* a session is created at all (GUI-only gating, driver-required gating) and how sessions map to contexts, but the per-run lifecycle established here is the baseline.

### Confirmation

Observable in the runner: the `Builder` is positioned above the action loop rather than inside it.

## Pros and Cons of the Options

### One session per test run
* Good: shared state; efficient.
* Bad: a leaked session must be torn down carefully per run.

### Session per action
* Good: maximal isolation between steps.
* Bad: loses shared page state; very slow.

### One session for the whole process
* Good: fewest startups.
* Bad: cross-test state bleed; harder isolation.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `0247859b`. Inventory ref: BACKFILL-INVENTORY.md Seq 10. Related: ADR 00033 (GUI-only session gating), ADR 00062 (per-test driver gating).
