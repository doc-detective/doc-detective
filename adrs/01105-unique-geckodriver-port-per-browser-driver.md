---
status: accepted
date: 2026-10-10
decision-makers: doc-detective maintainers
---

# Assign a unique geckodriver port per Firefox session under concurrency

## Context and Problem Statement

[ADR 01039](01039-unique-chromedriver-port-per-browser-driver.md) gave every Chromium session its
own free chromedriver port. It left Firefox alone, on the premise that `appium-geckodriver`
"auto-selects a free `systemPort` from a range." That premise is wrong under concurrency.

`appium-geckodriver` (3.0.x, `build/lib/gecko.js`) picks the port with
`findAPortNotInUse(5200, 5300)` inside a lock-file guard. The guard covers only the *probe*. It's
released before geckodriver is spawned and binds the port. Two Appium servers that start Firefox
sessions at the same moment both see 5200 as free and both pick it. One geckodriver binds. The other
Appium server's proxy then talks to the first geckodriver, whose session id isn't its own.

CI hit exactly this in the mocha test `Dynamic Appium port > two parallel runTests with 4723 held by
another process` (run 38101153337, `ubuntu-latest, node 24, shard 2`). The two Appium servers had
distinct ports (39735 and 33489), so the dynamic Appium port allocation (backfill ADR 00162,
`findFreePort()`) worked. The failure was one
layer down:

```text
WebDriverError: Got unexpected session id c8bb7360-… when running "url" with method "POST"
```

## Decision Drivers

- Concurrent Firefox contexts (`concurrentRunners` > 1, or two `runTests` calls in one process) must
  not share a geckodriver.
- Reuse the ADR 01039 mechanism rather than adding a second one.
- An explicit `appium:systemPort` from the user's driver options must still win.

## Considered Options

1. Generalize `withChromedriverPort` to `withDriverPort`: a per-engine capability table that sets
   `appium:chromedriverPort` for Chromium and `appium:systemPort` for Gecko, with a fresh
   `findFreePort()` per `driverStart` attempt.
2. Retry `Got unexpected session id` as a retryable session error.
3. Serialize Firefox session creation across runners.

## Decision Outcome

Chosen option: **1**. `findFreePort()` asks the OS for an ephemeral port (`listen(0)`), which is
spread across a large range, rather than taking the lowest free port in a 100-port window. Two
concurrent sessions therefore no longer converge on the same deterministic answer. Allocation is per
attempt, as in ADR 01039, so a retry moves to a new port.

### Consequences

- Good: two concurrent Firefox contexts get distinct geckodriver ports. The proxy can't cross into
  another runner's session.
- Neutral: Firefox sessions now run geckodriver on an ephemeral port instead of 5200–5300. A
  firewall rule scoped to that range no longer applies. It wasn't a documented contract.
- Neutral: Safari and native/mobile caps are unchanged.

### Confirmation

- Unit: `withDriverPort` cases in [test/context-resolution.test.js](../test/context-resolution.test.js)
  assign `appium:systemPort` for Gecko, keep an explicit one, and leave Safari caps untouched.
- Integration: [test/appium-port-conflict.test.js](../test/appium-port-conflict.test.js) runs two
  Firefox `runTests` in parallel.

## Pros and Cons of the Options

### Option 1: per-engine driver-port capability (chosen)

- Good: removes the collision at its source, in the same helper that already fixes Chromium.
- Bad: one extra ephemeral bind and close per Firefox attempt, which is negligible.

### Option 2: retry on `unexpected session id`

- Bad: the retry re-enters the same lowest-free-port race, and the error can surface mid-test, after
  steps have already run, where a session retry isn't possible.

### Option 3: serialize Firefox session creation

- Bad: the lock would have to span geckodriver's bind inside a separate Appium process, and it
  throttles concurrency to work around a one-capability fix.
