---
status: accepted
date: 2026-10-01
decision-makers: hawkeyexl
---

# `getRunner` verifies its navigations left the initial blank document

## Context and Problem Statement

The `getRunner()` describe block in `test/core-core.test.js` failed on roughly
half of the `Test (windows-latest, node 24, shard 1)` runs. It reproduced on
`main` itself, so it gated unrelated pull requests. Two different tests in the
block failed the same way:

```text
getRunner() function > should handle multiple sequential runners
  AssertionError: first runner should work

getRunner() function > should accept custom config options
  AssertionError: should work with custom config
```

Both assertions have the same shape. Call `getRunner()`, which returns a truthy
runner, then `await runner.url("http://localhost:8092/index.html")`, then assert
on `await runner.getTitle()`. The assertion failed because the title was empty.

The empty title is the signature of Chromium's initial blank document. A fresh
session starts parked on `data:,`, whose title is the empty string, until its
first navigation. [ADR 01084](01084-retry-unnavigated-context.md) characterized
the mode and [ADR 01088](01088-goto-verifies-it-left-the-blank-document.md)
root-caused it on hosted Windows runners. The session is alive, it is not a
crash page, and it simply never navigated. `driver.url()` still resolves.

**Why no existing mitigation covered this call site.** Three protections had
already shipped, and `runner.url()` is outside all of them:

1. **01088's guard lives inside the `goTo` action.** Callers reaching
   `getRunner`'s returned session drive WebdriverIO directly, exactly as the
   function's own doc comment shows. They never enter `goTo`.
2. **01082's context retry wraps `runContext`.** `getRunner` has no context, no
   step loop, and no retry wrapper. It hands out a session and returns.
3. **Mocha's `this.retries(2)`**, added for this suite in #678, re-runs the test
   body. It cannot help when the condition recurs on the fresh session each
   attempt starts, which is what a roughly even per-attempt coin flip produces.

[docs/design/mid-session-context-retry.md](../docs/design/mid-session-context-retry.md)
listed this symptom under one root cause, session death, alongside a stale
`ECONNREFUSED` observation from the same suite. That grouping was wrong for the
empty-title half. Session death and an unnavigated page are distinct modes with
distinct fixes, and the assertion reported neither. It reported only that a
title was falsy.

So the failing step was not the one that went wrong. The navigation silently
did nothing, reported success, and stranded the failure on the next line.

## Decision Drivers

* A navigation that did not happen must not report success, whichever entry
  point issued it.
* Attribute the failure to the navigation, not to whatever line next needs the
  page.
* Reuse 01088's verification rather than hand-rolling a second retry with
  slightly different rules.
* Do not slow down healthy navigations.
* Fix it for library consumers, not only for this repo's test suite.

## Considered Options

* **A. Guard the session `getRunner` returns, so every `runner.url()` call
  verifies it left the blank document** (chosen).
* **B. Poll for a non-blank URL inside the affected tests.**
* **C. Navigate through `runStep` with a `goTo` step in the tests, inheriting
  01088's guard.**
* **D. Raise the mocha retry count for the suite.**

## Decision Outcome

Chosen: **option A**. `getRunner` now wraps the returned session's `url` command
through WebdriverIO's own `overwriteCommand`. A navigation issued through that
runner re-issues itself once when the browser is still on the blank document,
then throws if it never moved. The thrown message names both the blank document
and the requested target.

The verification itself is 01088's, extracted rather than copied.
`src/core/utils.ts` gains two helpers that `goTo` now calls at the two points
where it previously inlined the same logic:

* `issueNavigation(driver, url)` navigates, probes `isPageUnnavigated`, and
  re-issues once if the browser never left the blank document. It returns
  whether the retry fired.
* `probeStuckOnBlankDocument(driver, retried)` reads the URL once and returns it
  when the browser is still parked there, otherwise `null`.

`goTo` keeps its exact behavior, including the load-bearing ordering 01088
settled: the re-issue happens before the wait conditions, and the stuck verdict
after them. Only the inlined bodies moved.

Two carve-outs keep the wrapper honest. A target that is itself the blank
document passes straight through, because asking for `data:,` would otherwise
read as stuck forever. A missing or non-string target also passes through, so
WebdriverIO keeps owning its own argument validation.

A runner without `overwriteCommand` is left alone rather than failing, which
keeps unit-test stubs working. The real session always has the method.

### Consequences

* Good, because a `getRunner` navigation that does not take now throws naming
  the navigation, instead of surfacing as an empty title or a missing element.
* Good, because the retry heals the transient case. The second navigation takes.
* Good, because library consumers get the guarantee, not just this repo. The
  documented way to use `getRunner` is the way that was unprotected.
* Good, because `goTo` and `getRunner` cannot drift on what the check means.
  They call the same two helpers.
* Neutral, because a healthy navigation pays one extra `getUrl()` round trip,
  the same cost 01088 accepted inside `goTo`.
* Neutral, because the probe fires on about a fifth of fresh-session navigations,
  measured below, so the extra `url()` is common rather than rare. Re-navigating
  to the same target is idempotent for a page under test, and 01088 already
  accepted that cost.
* Neutral, because nothing inside the runner calls `getRunner`. The wrapper
  reaches only the sessions handed to a library consumer, so a `runStep` driver
  still relies on `goTo`'s guard alone.
* Good, because the diagnostics can no longer leak basic-auth credentials.
  `redactUrlForOutput` dropped only the query and fragment, so a
  `https://user:pass@host` target would have printed its password in the warning
  this adds. It now clears userinfo as well, which also tightens 01088's existing
  `goTo` message.
* Bad or limiting, because this still treats a symptom. Why Chromium leaves a
  hosted Windows session on its initial document remains unknown, exactly as
  01084 and 01088 noted.
* Bad or limiting, because Firefox starts on `about:blank`, which the predicate
  deliberately excludes. `getRunner` only ever starts Chrome, so the gap is
  theoretical here.

### Confirmation

Hermetic unit tests in
[`test/core-utils-coverage.test.js`](../test/core-utils-coverage.test.js), written
red before green, cover the extracted helpers and the wrapper:

* A session that stays on the blank document makes `runner.url()` **throw**, and
  the message names the blank document and the redacted target. Query strings
  can carry tokens, and a thrown message lands in logs and CI artifacts.
* A session that leaves the blank document after a re-issue resolves normally,
  with the navigation issued exactly twice.
* A healthy navigation is issued exactly once.
* A deliberate blank-document target, a missing target, and an empty target each
  pass straight through untouched.
* `probeStuckOnBlankDocument` reads nothing when no retry fired, which is what
  keeps the healthy path at one probe.
* An unreadable URL reads as not stuck, matching `isPageUnnavigated`.
* A `https://admin:hunter2@host` target leaves no trace of `hunter2` in either
  the warning or the thrown message. `redactUrlForOutput` has its own cases for
  userinfo, on both the parsed and the fallback path.

The suite-level confirmation is in `test/core-core.test.js`. Every title
assertion in the `getRunner` block now reports the session's URL, so a recurrence
names where the session actually was. A new case asserts the contract directly:
after `runner.url()` resolves, the session is not on the blank document and the
page's real title is there.

The flake rate was measured rather than inferred. A temporary workflow ran the
`getRunner` suite six times on each of eight `windows-latest` jobs. One branch
carried only the diagnostics, the other carried the guard. Both hold the same
tests, and the two runs were launched together so runner-pool conditions match.

| Measurement | Before (run 36906427549) | After (run 36906445445) |
|---|---|---|
| Suite runs failed | 4 of 48 | **0 of 48** |
| Jobs with a failure | 4 of 8 | **0 of 8** |
| Guard re-issues | 0, no guard present | 129 |

Every before-failure named the mode, which is what the diagnostics were added
for. `first runner should work (session at data:,)` appeared twice, alongside the
custom-config and headless title assertions. Against the measured 8.3% before
rate, 48 clean runs is unlikely by chance, at about one in 65.

The re-issue count is an upper bound on the mode, not a count of averted
failures. 48 of the 129 come from the deliberate real-session test, which forces
the stuck state. The remaining 81 fired across 384 real navigations, so about a
fifth of them read `data:,` at the probe. Only a fraction of those would have
reached a title assertion while still blank. That gap explains the 8.3% before
rate against a 20% probe rate.

## Pros and Cons of the Options

### A. Guard the session `getRunner` returns

* Good, because it covers every caller of the public entry point, including
  consumers outside this repository.
* Good, because `overwriteCommand` is WebdriverIO's own mechanism for this, so
  the guard survives the browser object being a proxy.
* Bad, because it changes a public behavior. A navigation that never takes now
  throws where it used to resolve, which is why this ADR exists.

### B. Poll for a non-blank URL in the tests

* Good, because it touches no product code.
* Bad, because it fixes the symptom only where this repository happens to look.
  Every consumer keeps the undiagnosable failure.
* Bad, because polling waits out a condition that a re-issued navigation clears
  immediately, making the suite slower for no added certainty.

### C. Navigate through `runStep` and a `goTo` step

* Good, because it reuses 01088 with no new product code at all.
* Bad, because it rewrites the tests to stop exercising the thing they exist to
  exercise. The suite covers the raw session `getRunner` hands out.
* Bad, because the gap stays open for consumers who follow the documented usage.

### D. Raise the mocha retry count

* Good, because it is a one-line change.
* Bad, because the evidence says retries already fail to help. The suite has had
  two retries since #678 and still failed about half the time.
* Bad, because it hides a product defect behind test configuration, and does
  nothing for consumers.

## Documentation impact

No documentation-site change. `getRunner` has no reference page under
`docs/fern/`, and no step type, action option, config key, CLI flag, engine,
output format, or supported platform changes.

The user-visible surface that does change is the thrown error on a navigation
that never takes, which replaces a silent wrong success. That is already the
documented contract for an action that could not complete.

Two internal records are updated in the same change. `test/AGENTS.md` gains the
confirmed flake signature and its disposition. The root-cause grouping in
[docs/design/mid-session-context-retry.md](../docs/design/mid-session-context-retry.md)
is corrected, because it filed this symptom under session death.
