---
status: accepted
date: 2026-10-14
decision-makers: hawkeyexl
---

# Poll Appium readiness every 50ms

## Context and Problem Statement

After spawning an Appium server, the runner waits for it in `appiumIsReady`
([src/core/tests.ts](../src/core/tests.ts)). The function probes `GET /status`
right away, then every 250ms until it answers or the overall timeout passes.
Each probe has its own 10s request timeout.

With a 250ms poll, the run notices a ready server about 125ms late on average.
That happens once per spawned server: browser contexts, app surfaces, and
`getRunner`. The local mocha suite starts about 61 Appium servers. A unit test
pins the 250ms default, `sleeps` equal to `[250, 250]`.

## Decision Drivers

* Keep the immediate first probe, the per-probe timeout, and the overall
  timeout.
* Don't change the existing `appiumIsReady` unit tests.
* A probe against a port that isn't listening yet must stay cheap.

## Considered Options

1. **Add a `pollMs` option, and have the runner's call sites pass
   `APPIUM_READY_POLL_MS` (50ms).** The function's own default stays 250ms.
2. **Change the function default to 50ms.**
3. **Watch Appium's stdout** for its "listener started" line.

## Decision Outcome

Chosen option: **1**.

`appiumIsReady` accepts `deps.pollMs`, defaulting to 250. The three runner call
sites pass `APPIUM_READY_POLL_MS` (50): the per-context browser servers in
`runSpecs`, `startAppiumServer`, and `getRunner`. Probes still run one at
a time, so a slow `/status` can't stack requests. A connection refused on
loopback fails in about a millisecond, so the extra probes during a 2 to 5
second boot cost nothing measurable.

### Consequences

* Good, because detection lag drops from a mean of 138ms (max 251ms) to 25ms
  (max 51ms) per server. That's about 113ms saved for each Appium start, about
  7s across the local suite's roughly 61 starts.
* Good, because it's the same speedup for users on every run that starts
  Appium.
* Neutral, because the overall timeout and per-probe timeout don't change.
* Bad, because the default and the call sites now differ. A new caller that
  omits `pollMs` gets the slower 250ms poll.

### Confirmation

[test/appium-ready.test.js](../test/appium-ready.test.js) asserts that an
injected `pollMs` drives the sleeps and that `APPIUM_READY_POLL_MS` is 50. The
existing tests still pin the immediate probe, the 250ms default, and the
timeout. A local micro-benchmark that brought a `/status` server up at a random
time measured the lag figures above, over 20 trials each.

## Pros and Cons of the Options

### pollMs option, with call sites passing 50ms

* Good, because it leaves the existing tests' contract untouched.
* Bad, because there are two numbers to keep in mind.

### Change the default

* Good, because it's one line.
* Bad, because it breaks the existing "polls on a 250ms interval" test.

### Watch stdout

* Good, because readiness would be push-based, with no polling lag.
* Bad, because it couples to Appium's log wording and output buffering, and
  it still needs `/status` as the source of truth.
