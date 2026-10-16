---
status: accepted
date: 2026-10-16
decision-makers: hawkeyexl
---

# Poll the shorthand find strategies together, selector first

## Context and Problem Statement

The string shorthand for `find` and `click` (`"find": "Hello"`) tries five
strategies: CSS/XPath selector, element text, accessible name (`aria/`), `id`,
and `data-testid`. `findElementByShorthand` in
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

The exact-match precedence was also inconsistent. It ranked the selector
last: elementText > elementAria > elementId > elementTestId > selector. The
function's own header comment and the regex shorthand path both rank the
selector first.

## Decision Drivers

* A shorthand step whose element is present returns as fast as the object form.
* A selector that matches is the most specific thing an author can write, so
  it should win. This holds even when it costs an extra lookup.
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
  text match, keep polling the selector until the timeout before settling.

## Decision Outcome

Chosen option: **poll all strategies together**, because it is the only option
that is both fast and leaves no work running after the step returns.

Precedence is now selector > elementText > elementAria > elementId >
elementTestId. That's a deliberate change from the old exact-match order.

Each pass issues the five `driver.$(query)` lookups concurrently. wdio resolves
a lookup that matches nothing yet to an element without an `elementId`. That
strategy is polled again on the next pass. A lookup that throws drops its
strategy for the rest of the call, as the old per-strategy `.catch(() => null)`
did. If every strategy has dropped, the call returns at once.

The highest-precedence element found on a pass must pass a zero-timeout
`waitForExist`, as the old code required. That call checks once and doesn't
wait. If that element isn't the selector's, the strategies above it are looked
up once more before it's accepted. The first of those that hits wins. So a
selector match that renders a moment after the pass's lookups still beats a
text match. The re-check is one extra lookup per higher strategy, never a wait.
The loop sleeps 100 ms between passes, like `findElementByCriteria`, and stops
when the timeout is spent.

### Semantic changes

* **A matching selector wins.** When a string is both a CSS selector that
  matches and another element's text, the shorthand now returns the selector
  match. The old exact-match code returned the text match.
* **Bare words can be CSS type selectors.** CSS type selectors are
  case-insensitive in HTML. A one-word string that names an HTML element now
  resolves to that element when the page has one. `"Title"` matches the
  `<title>` element every page has. `"Search"`, `"Menu"`, `"Select"`,
  `"Header"`, `"Footer"`, `"Label"`, `"Button"`, `"Link"`, and `"Table"` match
  their elements when present. Before, the old exact-match code returned the
  element whose text was that word. Authors who mean the text can use
  `{ "elementText": "Title" }`.
* **A later higher-precedence match can lose.** Suppose a lower-precedence
  strategy matches now, and a higher one would only start matching later within
  the timeout. The old code waited for all five strategies to settle and picked
  the higher one. The new code returns the match present after the re-check.
  "The highest-precedence match on the page *now*" is the natural rule for a
  live DOM. Keeping the old answer would mean waiting out the timeout on every
  lower-precedence match.

The find docs now state the order and the selector-first rule.

### Consequences

* Good, because a shorthand hit costs one poll pass. It took 128–201 ms per
  step on a loaded machine and 38–63 ms on a quiet one. Before, it took
  5,088–5,124 ms. A spec of 20 shorthand steps saves about 100 seconds.
* Good, because a selector that matches is honored, which matches the regex
  path and the function's documented intent.
* Good, because a miss still polls for the full timeout, then FAILs with the same
  `No elements matched selector or text.` description and `found: false`.
* Good, because no `waitForExist` keeps polling the driver after the step returns.
* Neutral, because a non-selector hit re-runs the higher lookups once.
* Bad, because a bare word that names an HTML element now targets that element
  instead of the element with that text. See above.
* Bad, because a later-rendering higher-precedence match no longer beats a
  lower-precedence match already present after the re-check.

### Confirmation

* [test/find-shorthand-polling.test.js](../test/find-shorthand-polling.test.js)
  uses a fake driver with wdio's `$` and `waitForExist` contract. It pins a
  prompt return for each strategy alone, and precedence on one pass. It pins
  that a selector beats text, and that text wins when no selector matches.
  It also pins that a selector found on the re-check beats an earlier text hit.
  Finally it pins polling for a late element, the late-match edge, a full-timeout
  miss that re-polls, `timeout: 0` checking once, and dropping rejected lookups.
* [test/core-core.test.js](../test/core-core.test.js) pins the real-browser
  timing. A shorthand hit returns in under 4 seconds, and a miss FAILs only after
  the full 5-second timeout.
* [test/core-artifacts/interactions/find-shorthand.spec.json](../test/core-artifacts/interactions/find-shorthand.spec.json)
  covers shorthand `find` and `click` through each strategy. It also covers
  text-over-id precedence, selector-over-text precedence, and a late-rendering
  element. The page is [find-shorthand.html](../test/server/public/find-shorthand.html).
* One existing test changed for the new order.
  [test/debug-findstrategies-coverage.test.js](../test/debug-findstrategies-coverage.test.js)
  had a test where every strategy matches. It now expects `selector`, not
  `elementText`.

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

* Good, because it never misses a selector that renders later.
* Bad, because every text, aria, id, or testid match would wait out the whole
  timeout for a selector that almost never comes. That's the slow path this
  change removes.
