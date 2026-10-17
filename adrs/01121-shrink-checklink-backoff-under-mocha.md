---
status: accepted
date: 2026-10-14
decision-makers: hawkeyexl
---

# Shrink the checkLink retry backoff under mocha

## Context and Problem Statement

`checkLink` retries a 429 or 5xx response up to three times. Without a
`Retry-After` header it sleeps `1000ms * 2^attempt` between attempts, so
1s, 2s, then 4s. That is right for real sites. In the mocha suite it isn't.
Measured locally, `test/checkLink.test.js` took 31.9s wall, and its tests
reported about 28s. Five tests slept on the computed backoff:

* 7s each for three tests that exhaust all three retries. One expects a FAIL
  on an unaccepted 429, one passes on the fourth attempt, and one falls back
  to HEAD.
* 3s for a test that passes after two 503s.
* 1s for a test that passes after one 429.

That's 25s. The `Retry-After` test waits about 2s more. These tests assert
attempt counts and outcomes, not elapsed time.

How can the suite skip that wait without changing the product default or
adding a knob users could find?

## Decision Drivers

* The product default stays 1000ms.
* No new config key, CLI flag, or environment variable. Any of those becomes a
  user-facing knob that CLAUDE.md requires to flow through `config`.
* `Retry-After` keeps precedence over the computed backoff.
* No existing test changes.

## Considered Options

1. **Internal setter.** `checkLink.ts` exports `_setBaseBackoffMsForTests(ms)`.
   The mocha root hook in `test/hooks.js` calls it once.
2. **Environment variable** read by `checkLink.ts`.
3. **Fake timers** (sinon) in the retry tests.

## Decision Outcome

Chosen option: **1, internal setter**.

`src/core/tests/checkLink.ts` keeps the base in a module variable that defaults
to `DEFAULT_BASE_BACKOFF_MS` (1000). `_setBaseBackoffMsForTests(ms)` sets it and
returns the previous value. With no argument it restores 1000. The package
`exports` map exposes only `.` and `./cli`, so users can't deep-import the
setter. `src/runtime/heavyDeps.ts`'s `_resetCacheForTests` already uses this
pattern. `test/hooks.js` sets the base to 10ms for every mocha run, so a
test that exhausts all three retries sleeps 70ms instead of 7s.

### Consequences

* Good, because `test/checkLink.test.js` drops from about 32s to about 4s
  wall time locally.
* Good, because `Retry-After` still wins. "should honor Retry-After header"
  still waits its 1 to 2 seconds and asserts it.
* Neutral, because the CLI and fixture runs in CI never load the hook, so they
  keep the 1000ms base.
* Bad, because in-process mocha tests no longer exercise the real 1s timing.
  A new test asserts that the default is 1000ms and that the configured base
  drives the exponential sleeps.
* Bad, because the opt-in live smoke (`RUN_LIVE_SMOKE=1`) against a real site
  also runs with the 10ms base.

### Confirmation

`test/checkLink.test.js` › "checkLink base backoff test seam" asserts that the
default is 1000ms and that the root hook has shrunk it. It also asserts that a
100ms base yields at least 300ms of total sleep across two retries.

## Pros and Cons of the Options

### Internal setter

* Good, because it's invisible to users and needs no config plumbing.
* Bad, because it's process-wide state the hook must own.

### Environment variable

* Good, because it also reaches child processes.
* Bad, because it's an undocumented user-facing knob that bypasses `config`.

### Fake timers

* Good, because it's local to each test.
* Bad, because it means editing existing tests. Axios's real sockets also mix
  poorly with faked `setTimeout`.
