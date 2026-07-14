---
status: accepted
date: 2026-07-14
decision-makers: [doc-detective maintainers]
---

# Robust element-text matching in `find` (whole-element text + whitespace normalization)

## Context and Problem Statement

The `find` action (and `goTo`'s `waitUntil.find` sub-condition, which delegates to
the same finder) locates elements by their visible text. Two independent defects
made text matching fail against real, framework-rendered pages — most visibly a
Scalar/OpenAPI reference page whose `h1` reads `Garden companion API`:

1. **First-text-node matching (the primary bug).** The finder collects text
   candidates with XPath `//*[normalize-space(text())]` and the string shorthand
   matches with `//*[normalize-space(text())="…"]`. In an XPath predicate `text()`
   resolves to the element's **first** text node only. React/Vue/Svelte routinely
   fragment an element's text into several adjacent text nodes, frequently with an
   **empty leading node** — the Scalar heading's nodes are literally
   `["", "Garden companion API", ""]`. So `normalize-space(text())` is `""`, the
   heading is **excluded from the candidate set entirely**, and *no* `elementText`
   match (plain or regex) is ever possible — it just polls until timeout. A
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

- **Works on framework-rendered pages** — text fragmented across nodes must still
  match; this is the common case, not an edge case.
- **Cross-engine parity** — the same spec matches the same element on Chrome and
  Firefox; the driver's whitespace handling must not decide the outcome.
- **Least surprise** — authors write the visible text they see.
- **Internal consistency** — the three `find` text paths apply the same rule.
- **No false positives** — a broad container must not match a substring; genuinely
  different text must still fail.
- **Efficiency / churn-safety** — reactive pages re-render continuously; the finder
  should narrow to the target rather than scan every text-bearing element each poll.
- **Preserve the regex escape hatch** — `/pattern/` (a substring test) stays
  available and unchanged.

## Considered Options

1. **Whole-element text + whitespace normalization** — match on the element's full
   normalized text (`normalize-space(.)` / `getText()`), embedding a plain string as
   an exact whole-text XPath predicate so the target is found directly; normalize
   whitespace on both operands of the JS comparison; keep regex as-is.
2. **Fix whitespace only** — trim/normalize the `getText()` comparison but keep the
   `text()`-based candidate XPath. Leaves the primary (fragmented-text) bug unfixed.
3. **Substring/"contains" text semantics** — match any element whose text *contains*
   the string, so `selector: "body" + elementText` works. Rejected as the default:
   it changes matching broadly (a container and its child both match), shifting
   existing specs and click/type targets.
4. **Do nothing; tell authors to use selectors / `/regex/`** — pushes a real product
   defect onto every author of a framework-rendered site.

## Decision Outcome

Chosen option: **Option 1**, applied as two coordinated changes:

- **Whole-element text.** Text matching uses the element's *entire* normalized text,
  not its first text node. Candidate collection and the string-shorthand exact match
  switch from `normalize-space(text())` to `normalize-space(.)`. For a **plain
  string** the finder narrows directly with `normalize-space(.)=<literal>` (few
  candidates, churn-safe); a **regex** collects text-bearing elements
  (`//*[normalize-space(.)]`) and filters in JS. Author text is embedded via an
  XPath-1.0-safe `xpathLiteral()` (single-quote / `concat()` for embedded quotes).
- **Whitespace normalization.** A shared `normalizeText()`
  (`String(v).replace(/\s+/g," ").trim()` — `normalize-space` semantics) is applied
  to both operands of the plain-string comparison for `elementText`, `elementAria`,
  and the `selector` + text combination.

**Text semantics are whole-element *exact* (not contains).** `elementText` matches an
element whose full normalized text equals the string. A broad `selector: "body"` +
`elementText` therefore still won't match a heading (the body's text is the whole
page) — target a tighter element or use `/regex/` for substring matching. This keeps
the documented AND-logic and minimizes churn for existing specs.

Scope, deliberately narrow: **regex** text matching still tests the raw `getText()`
(patterns with intentional `\n`/`\s` keep working); **ids, test-ids, classes, and
attribute values are untouched** (whitespace is meaningful or absent there); native
app text matching (`findAppElement`, Appium semantic locators) is out of scope.

### Consequences

- Good: `find`/`goTo waitUntil.find` locate on-screen text on React/Vue/Svelte pages
  and agree across Chrome and Firefox. The Garden-companion page passes out of the
  box with a plain `find: "Garden companion API"`.
- Good: one matching rule across the three `find` text paths.
- Neutral: `find` no longer distinguishes text differing only by whitespace, and a
  broad container selector won't match a substring — both intended; `/regex/` is the
  escape hatch.
- Negative (accepted): this changes finder matching semantics, so it is a behavior
  change (documented here, surfaced in the PR, and covered by tests + a fixture).

### Confirmation

- Hermetic unit tests (`test/find-text-whitespace-normalization.test.js`) drive the
  finder with a fake driver reproducing (a) geckodriver-style padded/internally-
  spaced `getText()` and (b) a fragmented element answered only by the whole-element
  XPath, asserting matches for `elementText`/`elementAria`/`selector`+text and the
  string shorthand, that genuinely different text still fails, and that regex and
  XPath-literal quoting behave.
- An end-to-end feature fixture
  (`test/core-artifacts/interactions/find_textMatching.spec.json`) runs through the
  real runner (Firefox headless via the group config) against a served page whose
  elements carry leading/trailing/internal whitespace *and* a script-fragmented
  heading (`["", "Garden companion API", ""]`), covering the plain-string,
  selector+text, shorthand, and regex permutations (PASS/SKIPPED only).

## Pros and Cons of the Options

### Option 1 — whole-element text + whitespace normalization (chosen)

- Good: fixes the primary and secondary bugs; consistent across paths; efficient for
  the common plain-string case; regex remains the exact/whitespace-sensitive hatch.
- Neutral: slightly more lenient whitespace handling; broad-selector substring not
  supported by design.

### Option 2 — whitespace only

- Good: smaller change.
- Bad: leaves the fragmented-text bug — the actual reason the page fails — unfixed.

### Option 3 — substring/"contains" semantics

- Good: `selector: "body" + elementText` would work.
- Bad: broad blast radius; containers and children both match; shifts existing
  specs and interaction targets.

### Option 4 — do nothing

- Good: no code change.
- Bad: a real defect on any framework-rendered site; keeps Chrome/Firefox divergent
  and the paths inconsistent.
