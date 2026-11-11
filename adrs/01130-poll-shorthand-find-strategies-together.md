---
status: accepted
date: 2026-10-16
decision-makers: hawkeyexl
---

# Poll the shorthand find strategies together instead of waiting out each one

## Context and Problem Statement

The string shorthand for `find` and `click` (`"find": "Hello"`) tries five
strategies: CSS/XPath selector, element text, accessible name (`aria/`), `id`,
and `data-testid`. Precedence between them is elementText > elementAria >
elementId > elementTestId > selector.
`findElementByShorthand` in
[src/core/tests/findStrategies.ts](../src/core/tests/findStrategies.ts) ran each
strategy as `driver.$(query)` followed by `waitForExist({ timeout })`, joined
the five with `Promise.allSettled`, and only then applied precedence.

A string almost never matches more than one strategy. So every shorthand step
waited the full timeout (5 seconds by default) for the strategies that would
never match. It waited even when the element was on the page from the start.
We measured it on a real page in Chrome. `find: "Shorthand text target"` took
5,088–5,124 ms per step. The object form `find: { elementText: … }` took
75–82 ms on the same element. The shorthand is what `detectSteps` markup generates and
what the docs teach first, so most users pay this on most steps.

The function's header comment claimed the selector came first, which the
exact-match code never did. That raised the question of whether the order
itself should change.

## Decision Drivers

* A shorthand step whose element is present returns as fast as the object form.
* Existing specs, including the ones `detectSteps` generates, keep finding the
  same element.
* The timeout keeps its meaning: a miss still polls for the full timeout, and
  `timeout: 0` still means "check once, now" (ADR 01090).
* No background webdriver traffic after the step returns.

## Considered Options

* **Poll all strategies together.** One loop. Each pass looks up all five
  strategies once without waiting. The first pass that finds anything returns
  the highest-precedence match, after one re-check of the strategies above it.
* **Race the existing waits.** Keep the five `waitForExist` calls and return when
  the first one resolves.
* **Wait for higher-precedence strategies after a lower one matches.** On a
  selector match, keep polling the text, aria, id, and testid strategies until
  the timeout before settling on the selector.
* **Rank the selector first.** Use selector > elementText > elementAria >
  elementId > elementTestId, on the grounds that a matching selector is the
  most specific signal.

## Decision Outcome

Chosen option: **poll all strategies together**, keeping the existing order:
elementText > elementAria > elementId > elementTestId > selector. Polling is the
only option that is both fast and leaves no work running after the step
returns.

Each pass issues the five `driver.$(query)` lookups concurrently. wdio resolves
a lookup that matches nothing yet to an element without an `elementId`. That
strategy is polled again on the next pass. A lookup that throws drops its
strategy for the rest of the call, as the old per-strategy `.catch(() => null)`
did. If every strategy has dropped, the call returns at once.

The highest-precedence element found on a pass must pass a zero-timeout
`waitForExist`, as the old code required. That call checks once and doesn't
wait. If that element isn't the text match, the strategies above it are looked
up once more before it's accepted. The first of those that hits wins. So a
text match that renders a moment after the pass's lookups still beats a
selector match. It did the same when every strategy waited out the timeout. The
re-check is one extra lookup per higher strategy, never a wait. The loop sleeps
100 ms between passes, like `findElementByCriteria`, and stops when the timeout
is spent.

### Why the selector stays last

The user considered ranking the selector first, and rejected it. CSS type
selectors are case-insensitive in HTML. So a bare word that names an HTML
element is also a selector for that element. `"Title"` matches the `<title>`
in every page's `<head>`. `"Button"`, `"Header"`, `"Table"`, `"Menu"`,
`"Search"`, and `"Link"` match their elements whenever a page has them. Those
are ordinary UI labels, and `detectSteps` turns bold UI text into exactly such
shorthand steps. With the selector first, those specs would silently retarget a
different element, often an invisible one. Authors who mean a selector can say
so with `{ "selector": "…" }`. Authors who mean text can use
`{ "elementText": "…" }`. The header comment now states the real order.

### The one semantic edge that changes

Suppose a lower-precedence strategy matches first, and a higher-precedence one
only starts matching after the re-check, later within the timeout. The old code
waited for all five strategies to settle, so it picked the later, higher one.
The new code returns the match present after the re-check. "The
highest-precedence match on the page *now*" is the natural rule for a live DOM.
Keeping the old answer would mean waiting out the timeout on every
lower-precedence match. That's the slow path this change removes.

### Consequences

* Good, because a shorthand hit costs one poll pass. It took 128–201 ms per
  step on a loaded machine and 35–54 ms on a quiet one. Before, it took
  5,088–5,124 ms. A spec of 20 shorthand steps saves about 100 seconds.
* Good, because the order is unchanged, so existing specs keep their targets.
* Good, because a miss still polls for the full timeout, then FAILs with the same
  `No elements matched selector or text.` description and `found: false`.
* Good, because no `waitForExist` keeps polling the driver after the step returns.
* Neutral, because a non-text hit re-runs the higher lookups once. A selector
  hit took about 100 ms on the fixture page.
* Bad, because of the edge above. A higher-precedence match that renders after
  the re-check no longer beats a lower-precedence match already present.

### Confirmation

* [test/find-shorthand-polling.test.js](../test/find-shorthand-polling.test.js)
  uses a fake driver with wdio's `$` and `waitForExist` contract. It pins a
  prompt return for each strategy alone, and precedence on one pass. It pins
  that text beats a selector, and that the selector wins when nothing else
  matches. It also pins that a text match found on the re-check beats an
  earlier selector hit. Finally it pins polling for a late element, the edge
  above, a full-timeout miss that re-polls, `timeout: 0` checking once, and
  dropping rejected lookups.
* [test/core-core.test.js](../test/core-core.test.js) pins the real-browser
  timing. A shorthand hit returns in under 4 seconds, and a miss FAILs only after
  the full 5-second timeout.
* [test/core-artifacts/interactions/find-shorthand.spec.json](../test/core-artifacts/interactions/find-shorthand.spec.json)
  covers shorthand `find` and `click` through each strategy. It covers
  text-over-id and text-over-selector precedence, a bare `"Title"` that finds
  the text rather than `<title>`, and a late-rendering element. The page is
  [find-shorthand.html](../test/server/public/find-shorthand.html).
* The existing shorthand tests in
  [test/debug-findstrategies-coverage.test.js](../test/debug-findstrategies-coverage.test.js)
  pass unchanged.

## Pros and Cons of the Options

### Poll all strategies together

* Good, because it returns on the first pass that finds anything.
* Good, because it leaves nothing running after it returns.
* Bad, because of the late higher-precedence edge.

### Race the existing waits

* Good, because the diff is small.
* Bad, because wdio's `waitForExist` can't be cancelled. The losing waits keep
  polling the driver for up to the timeout after the step returns, interleaving
  with the next steps' commands.
* Bad, because the race winner isn't necessarily the highest-precedence match on
  the page. A separate snapshot of the higher strategies is still needed.

### Wait for higher-precedence strategies after a lower one matches

* Good, because it keeps the old answer in every case.
* Bad, because it keeps the old cost whenever the match isn't by text, and
  selector-only matches like `"find": "#username"` are common.

### Rank the selector first

* Good, because a selector is the most specific thing an author can write.
* Bad, because bare words that name HTML elements would retarget existing and
  generated specs, often to an invisible element such as `<title>`.
* Bad, because it changes behavior for specs that work today.
