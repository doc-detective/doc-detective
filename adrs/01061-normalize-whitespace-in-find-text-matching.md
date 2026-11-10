---
status: accepted
date: 2026-07-14
decision-makers: [doc-detective maintainers]
---

# Reliable element-text matching in `find` (whole-element text and whitespace normalization)

## Context and Problem Statement

The `find` action locates elements by their visible text. So does `goTo`'s
`waitUntil.find` sub-condition, which delegates to the same finder. Two
independent defects made text matching fail against real, framework-rendered
pages. The most visible was a Scalar and OpenAPI reference page whose `h1` reads
`Garden companion API`:

1. **First-text-node matching (the primary bug).** The finder collects text
   candidates with XPath `//*[normalize-space(text())]` and the string shorthand
   matches with `//*[normalize-space(text())="…"]`. In an XPath predicate `text()`
   resolves to the element's **first** text node only. React, Vue, and Svelte
   routinely fragment an element's text into several adjacent text nodes. They
   frequently leave an **empty leading node**. The Scalar heading's nodes are
   literally `["", "Garden companion API", ""]`. So `normalize-space(text())` is
   `""`, and the heading is **excluded from the candidate set entirely**. *No*
   `elementText` match, plain or regex, is ever possible. It just polls until
   timeout. A
   selector-only find on the same element at the same instant succeeds, because it
   never inspects text. Verified in-DOM: the heading is absent from
   `//*[normalize-space(text())]` but present in `//*[normalize-space(.)="…"]`.

2. **Driver-dependent whitespace (a secondary bug).** For a plain-string match the
   comparison is a strict equality on `element.getText()`. `getText()` is a
   driver-level call, and chromedriver trims/collapses whitespace while
   **geckodriver returns surrounding whitespace and newlines**. So even once an
   element *is* a candidate, `"Garden companion API\n" === "Garden companion API"`
   fails on Firefox, timing the find out for a purely cosmetic reason.

The three `find` text paths were also **inconsistent**: the string shorthand used
XPath `normalize-space` (trim + collapse), while the object forms did a raw
`getText() === expected` with no normalization.

## Decision Drivers

- **Works on framework-rendered pages.** Text fragmented across nodes must still
  match. This is the common case, not an edge case.
- **Cross-engine parity.** The same spec matches the same element on Chrome and
  Firefox. The driver's whitespace handling must not decide the outcome.
- **Least surprise.** Authors write the visible text they see.
- **Internal consistency.** The three `find` text paths apply the same rule.
- **No false positives.** A broad container must not match a substring, and
  genuinely different text must still fail.
- **Efficiency and churn-safety.** Reactive pages re-render continuously. The
  finder should narrow to the target, rather than scan every text-bearing element
  each poll.
- **Preserve the regex escape hatch.** `/pattern/`, a substring test, stays
  available and unchanged.

## Considered Options

1. **Whole-element text plus whitespace normalization.** Match on the element's
   full normalized text, through `normalize-space(.)` and `getText()`. Embed a
   plain string as an exact whole-text XPath predicate, so the target is found
   directly. Normalize whitespace on both operands of the JS comparison, and keep
   regex as-is.
2. **Fix whitespace only.** Trim and normalize the `getText()` comparison, but keep
   the `text()`-based candidate XPath. It leaves the primary fragmented-text bug
   unfixed.
3. **Substring, or "contains", text semantics.** Match any element whose text
   *contains* the string, so `selector: "body"` with `elementText` works. Rejected
   as the default. It changes matching broadly, since a container and its child
   both match, shifting existing specs and click or type targets.
4. **Do nothing, and tell authors to use selectors or `/regex/`.** That pushes a
   real product defect onto every author of a framework-rendered site.

## Decision Outcome

Chosen option: **Option 1**, applied as two coordinated changes:

- **Whole-element text.** Text matching uses the element's *entire* normalized text,
  not its first text node. Candidate collection and the string-shorthand exact match
  switch from `normalize-space(text())` to `normalize-space(.)`. For a **plain
  string** the finder narrows directly with `normalize-space(.)=<literal>` (few
  candidates, churn-safe); a **regex** collects text-bearing elements
  (`//*[normalize-space(.)]`) and filters in JS. Author text is embedded via an
  XPath-1.0-safe `xpathLiteral()` (single-quote / `concat()` for embedded quotes).
- **Whitespace normalization.** A shared `normalizeText()`, which is
  `String(v).replace(/\s+/g," ").trim()` with `normalize-space` semantics, applies
  to both operands of the plain-string comparison for `elementText`, `elementAria`,
  and the `selector` plus text combination.

**Text semantics are whole-element *exact*, not contains.** `elementText` matches an
element whose full normalized text equals the string. A broad `selector: "body"` with
`elementText` therefore still won't match a heading, since the body's text is the
whole page. Target a tighter element, or use `/regex/` for substring matching. This
keeps the documented AND-logic, and minimizes churn for existing specs.

The scope is deliberately narrow. **Regex** text matching still tests the raw
`getText()`, so patterns with intentional `\n` or `\s` keep working. **Ids,
test-ids, classes, and attribute values are untouched**, because whitespace is
meaningful or absent there. Native app text matching, meaning `findAppElement` and
Appium semantic locators, is out of scope.

### Consequences

- Good: `find`/`goTo waitUntil.find` locate on-screen text on React/Vue/Svelte pages
  and agree across Chrome and Firefox. The Garden-companion page passes out of the
  box with a plain `find: "Garden companion API"`.
- Good: one matching rule across the three `find` text paths.
- Neutral: `find` no longer distinguishes text differing only by whitespace, and a
  broad container selector won't match a substring. Both are intended, and `/regex/`
  is the escape hatch.
- Negative (accepted): this changes finder matching semantics, so it is a behavior
  change (documented here, surfaced in the PR, and covered by tests + a fixture).

### Confirmation

- Hermetic unit tests in `test/find-text-whitespace-normalization.test.js` drive the
  finder with a fake driver. It reproduces (a) geckodriver-style padded and
  internally-spaced `getText()`, and (b) a fragmented element answered only by the
  whole-element XPath. They assert matches for `elementText`, `elementAria`, and
  `selector` plus text, and for the string shorthand. They also assert that
  genuinely different text still fails, and that regex and XPath-literal quoting
  behave.
- An end-to-end feature fixture,
  `test/core-artifacts/interactions/find_textMatching.spec.json`, runs through the
  real runner. It uses headless Firefox from the group config, against a served page
  whose elements carry leading, trailing, and internal whitespace. That page *also*
  has a script-fragmented heading, `["", "Garden companion API", ""]`. The fixture
  covers the plain-string, selector-plus-text, shorthand, and regex permutations,
  PASS or SKIPPED only.

## Pros and Cons of the Options

### Option 1: whole-element text plus whitespace normalization (chosen)

- Good: fixes the primary and secondary bugs; consistent across paths; efficient for
  the common plain-string case; regex remains the exact/whitespace-sensitive hatch.
- Neutral: slightly more lenient whitespace handling; broad-selector substring not
  supported by design.

### Option 2: whitespace only

- Good: smaller change.
- Bad: it leaves the fragmented-text bug unfixed. That's the actual reason the page fails.

### Option 3: substring, or "contains", semantics

- Good: `selector: "body" + elementText` would work.
- Bad: broad blast radius; containers and children both match; shifts existing
  specs and interaction targets.

### Option 4: do nothing

- Good: no code change.
- Bad: a real defect on any framework-rendered site; keeps Chrome/Firefox divergent
  and the paths inconsistent.
