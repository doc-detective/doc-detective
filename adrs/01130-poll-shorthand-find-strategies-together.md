---
status: accepted
date: 2026-10-14
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

## Decision Drivers

* A shorthand step whose element is present returns as fast as the object form.
* The element chosen, PASS/FAIL, outputs, and error text stay the same for
  every page where the old code was deterministic.
* The timeout keeps its meaning: a miss still polls for the full timeout, and
  `timeout: 0` still means "check once, now" (ADR 01090).
* No background webdriver traffic after the step returns.

## Considered Options

* **Poll all strategies together.** One loop. Each pass looks up all five
  strategies once without waiting. The first pass that finds anything returns
  the highest-precedence match present on that pass.
* **Race the existing waits.** Keep the five `waitForExist` calls and return when
  the first one resolves.
* **Wait for higher-precedence strategies after a lower one matches.** On a
  selector match, keep polling the text, aria, id, and testid strategies until
  the timeout before settling on the selector.

## Decision Outcome

Chosen option: **poll all strategies together**, because it is the only option
that is both fast and leaves no work running after the step returns.

Each pass issues the five `driver.$(query)` lookups concurrently, in the same
order as before. wdio resolves a lookup that matches nothing yet to an element
without an `elementId`, and that strategy is polled again on the next pass. A
lookup that throws drops its strategy for the rest of the call, as the old
per-strategy `.catch(() => null)` did. If every strategy has dropped, the call
returns at once. Among the strategies found on a pass, the highest-precedence
element must also pass a zero-timeout `waitForExist`, as the old code required.
That call checks once and doesn't wait. The loop sleeps 100 ms between passes,
like `findElementByCriteria`, and stops when the timeout is spent.

### The one semantic edge that changes

Suppose a lower-precedence strategy matches first, and a higher-precedence one
would only start matching later within the timeout. For example, the selector
matches now, and an element whose text equals the string renders 600 ms later.
The old code waited for all five strategies to settle, so it picked the
later text match. The new code returns the selector match on the first pass.

We accept this. "The highest-precedence match on the page *now*" is the natural
rule for a live DOM. It's the same rule the old code already applied whenever
both matches were present from the start, which is the common case. Keeping
the old answer would mean waiting out the timeout whenever a lower-precedence
strategy matched. That's the slow path this change removes. Authors who need a
specific strategy have the object form (`elementText`, `selector`, and so on),
which is unaffected. The find docs now state the rule.

### Consequences

* Good, because a shorthand hit costs one poll pass: 128–201 ms per step on the
  same page, down from 5,088–5,124 ms. A spec of 20 shorthand steps saves about
  100 seconds.
* Good, because a miss still polls for the full timeout, then FAILs with the same
  `No elements matched selector or text.` description and `found: false`.
* Good, because no `waitForExist` keeps polling the driver after the step returns.
* Neutral, because each pass issues five lookups, where the old waits ran five
  `isExisting` polls at wdio's interval. The driver load is about the same.
* Bad, because of the edge above. A later-rendering higher-precedence match no
  longer beats a lower-precedence match that was already present.

### Confirmation

* [test/find-shorthand-polling.test.js](../test/find-shorthand-polling.test.js)
  uses a fake driver with wdio's `$` and `waitForExist` contract. It pins a
  prompt return for each strategy alone, precedence on one pass, and polling
  for a late element. It also pins the edge above, a full-timeout miss that
  re-polls, `timeout: 0` checking once, and dropping rejected lookups.
* [test/core-core.test.js](../test/core-core.test.js) pins the real-browser
  timing. A shorthand hit returns in under 4 seconds, and a miss FAILs only after
  the full 5-second timeout.
* [test/core-artifacts/interactions/find-shorthand.spec.json](../test/core-artifacts/interactions/find-shorthand.spec.json)
  covers shorthand `find` and `click` through each strategy, text-over-id
  precedence, and a late-rendering element. The page is
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
