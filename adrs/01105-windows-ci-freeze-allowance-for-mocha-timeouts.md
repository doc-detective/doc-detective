---
status: accepted
date: 2026-10-10
decision-makers: doc-detective maintainers
---

# Give every mocha timeout a 60s freeze allowance on Windows CI

## Context and Problem Statement

A 60-day audit of the `Test` workflow (Aug 10 – Oct 10, 177 runs) found the Windows unit leg,
`test / Test (windows-latest, node 24, shard 1)`, red in 15 of 83 executions. Ten were the
`getRunner()` blank-document flake, fixed by [ADR 01102](01102-getrunner-verifies-it-left-the-blank-document.md).
The other five were mocha timeouts on tests that normally finish in milliseconds:
`runner-entrypoint` (`makeLogShipper`), `reporters-junit-markdown`, `runcode-coverage` (the python
snippet), and `expressions-coverage`.

The job logs' own timestamps show what happened. The wall-clock gap around each failing test was
21s, 32s, 52s and 15s, and one of those tests is fully synchronous string work. The process was not
running, not slow. When the same freeze lands on a test with headroom, it shows up as a one-off
outlier. Across 28 Windows logs, tests with a ~50 ms median each took 7–14s exactly once. The
freezes cluster on specific days (Aug 10, Aug 11, Sep 5, Oct 1). Other runs of the same code in
between show none.

[ADR 01037](01037-raise-mocha-default-timeout.md) already raised the default from 2s to 10s for an
earlier form of this "test-agnostic" timeout. A 52s freeze outruns any per-test limit we'd want to set.

An experiment ran unit shard 1 twenty times on `windows-latest` (branch `exp/windows-stalls`). It
logged event-loop blocks in the mocha process and in an idle sidecar process. It ruled out Windows
Defender: real-time protection is already off on hosted runners, in both arms. On that quiet day it
recorded zero random freezes and zero failures in 20 runs. That fits an episodic, runner-side cause
outside this repo's control.

## Decision Drivers

* A runner freeze must not fail an innocent test. That holds for any timeout: the default, a
  `describe`-level `this.timeout`, or one set inside the test body.
* A genuine hang must still time out.
* Linux, macOS and local runs keep today's limits exactly.
* No per-test edits: the freeze lands on a different test every time.

## Considered Options

* Add a fixed 60s allowance to every enforced timeout on Windows CI.
* Raise the default timeout in `.mocharc.yml` (to 60s).
* Multiply every timeout on Windows CI.
* Retry every test once (`--retries 1`).
* Do nothing: the main cause (ADR 01102) is fixed.

## Decision Outcome

Chosen option: "Add a fixed 60s allowance to every enforced timeout on Windows CI". A freeze adds a
fixed amount of wall-clock time regardless of the test, so the cushion should be fixed too. 60s
covers the longest observed freeze (52s).

`test/freeze-allowance.js` is loaded by `test/hooks.js` (mocha's root `--require`). It patches
mocha's `Runnable#timeout()` getter, which both enforcement points read (the async timer and the
synchronous duration check), to return `declared + allowance`. The declared value is untouched, and
`Test#clone()` (retries) is reset to it so retries don't stack the allowance. A disabled timeout
(`0`) stays disabled.

It applies when `process.platform === "win32"` and `CI === "true"`. `DD_TEST_FREEZE_ALLOWANCE_MS`
overrides the value on any platform (`0` turns it off), so it can be reproduced locally or tuned
without a code change.

### Consequences

* Good, because a runner freeze of up to 60s no longer fails a Windows unit shard.
* Good, because test timeouts keep their meaning everywhere else, and in the source.
* Bad, because a genuine hang on Windows CI takes 60s longer to fail, per test.
* Bad, because it monkey-patches two mocha internals (`Runnable#timeout`, `Test#clone`). A mocha
  major upgrade could change how timeouts are read. The unit tests run real `Runnable#run` calls, so
  a change in enforcement fails them rather than silently disabling the allowance.
* Neutral: hooks (`before`/`after`) get the allowance too, since they are Runnables.

### Confirmation

`test/freeze-allowance.test.js` covers when it applies: platform, CI, and the override. It also
covers how it changes enforcement:

* Async and synchronous overruns within the allowance pass.
* An overrun past `timeout + allowance` still times out.
* A disabled timeout stays disabled, and retries don't stack the allowance.
* The hook installs it on mocha's own `Runnable` for the run.

In CI, the Windows unit legs should stop
failing with `Timeout of <n>ms exceeded` on fast tests. A freeze day now shows instead as a test
taking tens of seconds while passing, which the `(<n>ms)` durations in the job log make visible.

## Pros and Cons of the Options

### Add a fixed 60s allowance on Windows CI

* Good, because it matches the shape of the problem: fixed extra time, any test, one OS.
* Good, because in-body `this.timeout(...)` calls are covered (the python test's case).
* Bad, because it patches mocha internals.

### Raise the default timeout to 60s

* Good, because it's one line in `.mocharc.yml`.
* Bad, because it misses every test with its own `this.timeout(...)`, including the python test
  that failed at 15s.
* Bad, because it slows hang detection on every OS, not just the one that freezes.

### Multiply every timeout on Windows CI

* Bad, because a 5-minute `getRunner()` suite would become 30 minutes while a 10s test gets only
  enough for a 50s freeze. The freeze isn't proportional to the test.

### Retry every test once

* Bad, because it masks real flakes across the whole suite, which the flake playbook rules out.

### Do nothing

* Good, because the remaining failure rate is low (5 in 83 Windows runs over 60 days).
* Bad, because each of those turned a run red for nothing, and two of the recent freeze days hit
  `main`-bound PRs.
