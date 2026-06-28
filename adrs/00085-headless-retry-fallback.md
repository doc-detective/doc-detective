---
status: accepted
date: 2024-07-12
decision-makers: doc-detective maintainers
---

# Generic headless retry on driver-start failure, then SKIPPED

## Context and Problem Statement

Tests that require a browser fail to start a driver when there is no display — most commonly in
CI (e.g. GitHub Actions) where a headed browser cannot launch. The earlier handling was
GH-Actions-specific display logic, which is brittle and does not generalize to other headless
environments. How should the runner react when a driver fails to start because of display
availability, without hard-failing tests that could still run headless?

## Decision Drivers

* Headed browsers cannot start without a display (CI, containers, headless servers).
* Display detection should be generic, not tied to one CI provider.
* A driver-start failure that headless could fix should not be reported as a test FAIL.
* Containers need `--no-sandbox` to launch Chromium-family browsers.

## Considered Options

* **A. On driver-start failure, retry once with `headless=true`; if that also fails, mark the test
  SKIPPED; pass `--no-sandbox` for containers** (chosen).
* **B. Keep GitHub-Actions-specific display detection.**
* **C. FAIL the test whenever driver start throws.**

## Decision Outcome

Chosen option: **A**, because a single generic retry covers every display-less environment and
turns an environment limitation into a SKIPPED (not a FAIL). The GH-Actions display handling was
replaced with a generic headless retry: if `driverStart` throws, retry once with `headless=true`;
if it still fails, the test is marked SKIPPED; `--no-sandbox` is applied for containers
(core `29edc94f`, `67152362`, `296927a6`, Seq 126).

### Consequences

* Good: works in any headless environment, not just GitHub Actions.
* Good: an environment that can't run headed degrades to SKIPPED, never a false FAIL.
* Good: containers launch via `--no-sandbox`.
* Bad: a headed-only test silently re-runs headless, which may mask headed-specific behavior.
* Neutral: the retry is one attempt; persistent failures still SKIP.

### Confirmation

Shipped across doc-detective-core commits `29edc94f`, `67152362`, `296927a6`. Confirmed by the
retry-then-SKIPPED path in driver startup and the container `--no-sandbox` flag.

## Pros and Cons of the Options

### A. Generic headless retry → SKIPPED
* Good: provider-agnostic; FAIL-avoiding; container-friendly.
* Bad: headed test may silently fall back to headless.

### B. GH-Actions-specific detection
* Good: targeted to the most common CI.
* Bad: brittle; doesn't generalize.

### C. FAIL on driver-start throw
* Good: simplest.
* Bad: turns environment limits into spurious failures.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective-core commits `29edc94f`,
`67152362`, `296927a6`. Inventory ref: BACKFILL-INVENTORY.md Seq 126. Related: `00067`
(SKIPPED verdict), later `00109` (default-context fallback), `00168` (driver-context resolution).
