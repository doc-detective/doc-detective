---
status: accepted
date: 2026-10-14
decision-makers: hawkeyexl
---

# Make regex find linear and poll instead of sleeping

## Context and Problem Statement

A `/regex/` value for `find` and `click` can't be expressed in XPath. So
[src/core/tests/findStrategies.ts](../src/core/tests/findStrategies.ts) collects
candidate elements with `driver.$$()` and tests each one's `getText()` in Node.
Two paths do this, and both were far slower than they needed to be.

* **Object form**, `find: { elementText: "/re/" }`, goes through
  `findElementByCriteria`. It called `element.isExisting()` on every candidate
  before checking its text. For an element from `$$`, wdio's `isExisting()`
  doesn't check that element. It re-runs the whole candidate query
  (`$$(xpath)`) and reports whether anything matches. On a page of n
  candidates that's n queries returning n elements each, so the cost was O(n²).
* **String shorthand**, `find: "/re/"`, goes through `findElementByShorthand`.
  Each of its regex scans (text, aria-label, id, data-testid) began with
  `driver.pause(timeout)`, a fixed 5-second sleep. Then it scanned once. The
  text scan ran twice, once for the `selector` label and once for
  `elementText`.

We measured both on a 1,000-row page in Chrome, with the match in the last row.
The object form took 334.5 seconds on a loaded machine. Another run on a
quieter machine took 90 seconds. The shorthand took 14.8 seconds. With the match
in the first row, the shorthand still took 6.3 seconds.

Why the pause? The commit that added regex matching (`cdf7dfe9` in
doc-detective-core, "Added elementText regex support") put `pause(timeout)`
before the first scan. It left no comment. There's no `waitForExist` for a
regex. Sleeping the whole timeout and then scanning once was the simplest way
to give late-rendering content a chance. It wasn't guarding against
anything else, and the exact-text and object paths never slept like this.

## Decision Drivers

* Match semantics stay identical. A regex is tested against the driver's
  `getText()`, which is WebDriver "Get Element Text", the rendered text. It
  drops hidden content, collapses whitespace, applies CSS `text-transform`, and
  includes shadow-DOM text the way the driver's atom does. The same elements
  stay candidates, in the same order.
* The timeout keeps its meaning. A miss still waits the full timeout, and
  `timeout: 0` checks once (ADR 01090).
* Large pages are common: generated API references, tables, and changelogs.

## Considered Options

* **Evaluate the candidates in the page with one `driver.execute()`.** Read
  each candidate's text in JavaScript and match there or in Node.
* **Keep the driver's `getText()` per candidate, cut the redundant work, and poll.**
  Check existence only for candidates that otherwise match. Replace the fixed
  sleep with a scan-and-retry loop, and run the text scan once.
* **Keep `getText()` but issue the calls concurrently in chunks.**

## Decision Outcome

Chosen option: **keep the driver's `getText()` per candidate, cut the redundant
work, and poll**. It's the fastest option whose matches are identical.

In-page evaluation can't be identical. JavaScript in the page has
`textContent` and `innerText`, and neither is WebDriver's text. `textContent`
keeps hidden text and raw whitespace, and it ignores `text-transform`.
`innerText` is closer, but its line-break, whitespace, and visibility rules
differ from the Selenium `getVisibleText` atom that chromedriver and
geckodriver use. Safari and Appium web contexts have their own implementations.
The atom isn't available to page scripts, and none of our dependencies ships
it. Vendoring a copy would still drift from each driver's built-in version.
The fixtures pin cases where `textContent` picks a different element or none:
a hidden earlier match, collapsed whitespace, and `text-transform`.

Chunked concurrency doesn't help. We tried running `getText()` 25 at a time.
The 1,000-row scan took 7.5 seconds, against 5.7 seconds one at a time.
chromedriver runs a session's commands one after another, so concurrent requests
just queue.

What changed:

1. `findElementByCriteria` checks `isExisting()` after the other criteria pass,
   not before. Both are reads, so the set of candidates that pass every check is
   the same. The existence check now runs once per match instead of once per
   candidate. A candidate that matches but no longer exists is still skipped,
   and the scan moves on to the next match.
2. The shorthand regex path drops the fixed `pause` and polls instead.
   Each pass runs the text, aria, id, and testid scans in precedence
   order. It returns the first hit. The loop sleeps 100 ms between passes until the
   timeout is spent. Running the scans in order and stopping at the first hit
   returns what running all four and applying precedence returned. A scan that
   throws counts as no match on that pass, as `Promise.allSettled` treated it.
   A hit from a lower-precedence scan re-runs the higher scans before it's
   accepted, and the first of those to hit wins. Content can render while a pass
   is still running. The aria scan's text fallback walks every element. It can
   reach a late element's container after the text scan missed the element
   itself. The old single scan, a full timeout in, never saw that
   race. CI's Firefox late-arrival fixture did, and returned the container.
   The re-check also covers a text scan that failed on one stale `getText()`.
3. The text scan runs once and keeps the `selector` label. The second run
   behind `elementText` repeated the same scan, so it never won.

### Follow-up (#757)

Two costs the change above left in place, with matches still identical:

4. The existence check asks about the matched element's own ID, with the
   raw `getElementTagName` protocol command, instead of `isExisting()`. One
   round trip per match, and a stale element still fails it and is skipped.
   An `all: true` scan with n matches was still O(n²) before this. Drivers
   without the command, or elements without an ID, fall back to
   `isExisting()`.
5. The aria scan queries `//*[@aria-label or not(text()[normalize-space()])]`
   instead of `//*`. It only runs after the text scan missed on the same
   pass, and that scan already tested `getText()` on every element with its
   own text. Those elements can only match by `aria-label`, so the query
   drops the ones without one. The first hit in document order is the same.

### The one semantic edge that changes

The shorthand regex path used to look at the page once, a full timeout after
the step started. It now looks immediately and then every 100 ms. A page can
change during those 5 seconds. If it does, the path can return an element that
matches early instead of one that only matches later. One example is a placeholder
that matches the regex before the real content replaces it. Another is the
outgoing page of a navigation that hasn't committed yet. The exact-text shorthand and the object
form already worked this way. They return as soon as a match exists. The old
sleep was an accidental settle delay on this one path, and a 5-second cost on
every regex step. Authors who need the page to settle have `wait` and `goTo`'s
wait conditions.

### Consequences

* Good, because the object form's cost is linear. On the 1,000-row page, a
  match in the last row went from 334.5 seconds to 5.4 seconds. A match in the
  first row went from 1.2 to 0.7 seconds.
* Good, because a shorthand regex hit no longer costs the timeout. On the same
  page, a match in the last row went from 14.8 to 5.7 seconds. A match in the
  first row went from 6.3 to 0.4 seconds. On the small fixture page, shorthand
  regex steps took 100–514 ms, down from 5.1–5.3 seconds.
* Neutral, because an aria, id, or testid hit re-runs the higher scans once.
  An id hit pays for one more aria scan, which calls `getText()` on every
  element without its own text and without a matching `aria-label`.
* Good, because matching is unchanged. The candidate set and order are the
  same, the text is the same `getText()`, and the same `RegExp` runs in Node.
* Neutral, because a regex scan is still one `getText()` round trip per
  candidate, about 5 ms in Chrome. A match deep in a very large page still
  costs seconds. That's the price of identical rendered-text semantics.
* Bad, because of the edge above. A regex shorthand on a changing page can match
  earlier than it used to.

### Confirmation

* [test/find-regex-scan.test.js](../test/find-regex-scan.test.js) pins the
  following with fake drivers. The shorthand path finds a present element
  without any `pause` and polls for a late one. A miss re-scans for the full
  timeout. `timeout: 0` scans once. Precedence holds, and a scan that throws
  counts as no match. A lower-precedence hit re-checks the higher scans, both
  for an element that renders mid-pass and for a `getText()` that throws once. In `findElementByCriteria`, `isExisting` never runs on a
  non-matching candidate, a matching candidate that no longer exists is still
  skipped, and `all: true` confirms each match.
* [test/core-artifacts/interactions/find-regex.spec.json](../test/core-artifacts/interactions/find-regex.spec.json)
  runs against [find-regex.html](../test/server/public/find-regex.html) in a
  real browser. In both shorthand and object form, it pins a hidden earlier match
  (skipped), collapsed whitespace, `text-transform: uppercase`, and fragmented
  text nodes. It also covers the shorthand aria-label, id, and data-testid
  strategies and a late-rendering match. Every step passed before and after the
  change.
* The existing regex tests in
  [test/debug-findstrategies-coverage.test.js](../test/debug-findstrategies-coverage.test.js)
  pass unchanged.

## Pros and Cons of the Options

### Evaluate the candidates in the page with one `driver.execute()`

* Good, because it's one round trip per scan, so it's the fastest option.
* Bad, because in-page text isn't WebDriver's text. Matches would change for
  hidden elements, whitespace, `text-transform`, and shadow DOM.
* Bad, because matching the driver exactly would mean vendoring the Selenium
  atom, and that copy would drift from each driver's version.

### Keep the driver's `getText()` per candidate, cut the redundant work, and poll

* Good, because matches stay identical.
* Good, because it removes the quadratic cost and the fixed sleep, which were
  most of the measured time.
* Bad, because the scan stays linear in round trips.

### Keep `getText()` but issue the calls concurrently in chunks

* Good, because matches stay identical.
* Bad, because the driver serializes a session's commands, so it measured no
  faster.
