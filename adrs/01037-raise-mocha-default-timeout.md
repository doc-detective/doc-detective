---
status: accepted
date: 2026-07-06
decision-makers: doc-detective maintainers
---

# Raise the mocha default per-test timeout to 10s to kill the 2000ms CI flake

## Context and Problem Statement

A 60-day audit of the `Test` workflow surfaced the most recurrent unaddressed **main-branch** flake.
It hit 4 times across 3 days, on macOS and Windows, node 22 and 24. The signature is a mocha
`Error: Timeout of 2000ms exceeded` that lands on a **different, innocent test each time**
(`Run tests successfully`, `Intelligent goTo behavior`, a `hints/context` case, the `findElement`
app-surface branch). The cause sits outside any one test. It's mocha's **default 2000ms per-test
timeout** being too tight for the root suite on slow hosted runners. Real async work
(env-variable injection, `config_v3` schema validation, driver preflight) legitimately takes 3–5s in
adjacent passing lines. Whichever test is unlucky when the runner is loaded trips the timeout, FAILs
the matrix cell, and blocks the run.

The root `.mocharc.yml` sets no `timeout`, so every `test/*.test.js` case runs under the 2000ms
default.

## Decision Drivers

* Eliminate an intermittent, test-agnostic CI failure that costs re-runs and erodes signal.
* Keep catching genuine hangs and deadlocks, so don't disable timeouts wholesale.
* One central change; don't sprinkle `this.timeout()` across dozens of unrelated tests.
* No product-behavior or public-contract change.

## Considered Options

* **A. Set a generous global `timeout: 10000` in `.mocharc.yml`** (chosen).
* **B. Per-test `this.timeout(...)` on the tests observed failing.**
* **C. `--timeout 0` (disable timeouts) for the root suite.**
* **D. Leave at 2000ms and rely on CI re-runs.**

## Decision Outcome

Chosen option: **A**. A single, discoverable knob raises the floor for the whole root suite. The new
value sits comfortably above the observed 3–5s real work, while still failing on a genuinely hung
test at 10s. **B** is whack-a-mole. The flake already hit four different tests, so any per-test list
is incomplete by construction, and the next unlucky test just reintroduces it. **C** removes the safety
net entirely, so a real deadlock would hang the job until the 90-minute job timeout instead of failing
fast. **D** keeps paying the flake tax. Individual slow tests that already set a longer
`this.timeout(...)` are unaffected (per-test value wins over the global default).

Mechanism: add `timeout: 10000` to `.mocharc.yml` (the root suite's config). The `src/common`
suite has its own `.mocharc.yml` and was not implicated, so it is left unchanged.

## Consequences

* **Good:** the S3 2000ms flake can no longer trip on incidental slowness. The root suite has a 10s
  floor uniformly across the matrix.
* **Good:** genuine hangs still fail, at 10s per test, rather than being masked.
* **Neutral:** a truly stuck test now takes up to 10s to fail rather than 2s. That's negligible
  against the suite's overall runtime, and worth the flake elimination.
* **Trade-off:** a real regression that makes a test *slow* (3–10s) would no longer be caught by the
  timeout. That class of perf regression is out of scope here, and better caught by dedicated timing
  assertions if needed.

## Confirmation

* This is CI-reliability config tuning, like the coverage-ratchet tolerance and the
  `concurrentRunners` fixture setting. It's not a product-behavior change, so it carries no feature
  fixtures and no user-facing docs impact. TDD's red→green does not cleanly apply to a probabilistic
  timeout flake, so the confirmation is operational.
* The `Test` workflow runs green on the introducing PR. The S3 signature does not recur across the
  Phase-4 repeated main-branch dispatches. The target: no `Timeout of 2000ms exceeded` in 3
  consecutive all-green dispatches.
* Docs impact: **none user-facing** (test/CI-config only).
