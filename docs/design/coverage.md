# Design: Documentation coverage

Status: **proposed** (2026-11-02). This expands item 5.3 of [v5-rollout.md](v5-rollout.md). The numbers come
from a rough script run on this repository's `docs/fern/pages/docs`, not from shipped code. They're static
unless a section says otherwise, so "has a step" means a step exists, not that it passed.

## Summary

- **Coverage answers one question: which documented instructions did a passing test exercise?** The headline
  counts procedure steps, because those are what readers follow.
- **There's no single percentage.** Each kind of content gets its own count, and nothing is weighted.
- **It stays deterministic.** Patterns and a line scanner decide what counts, with no model or scoring. The
  same files and the same results always give the same numbers.
- **It reuses detection and run results.** `runCoverage` was added in 2022
  ([ADR 00035](../../adrs/00035-coverage-analysis-feature.md)) and removed in 2025
  ([ADR 00103](../../adrs/00103-drop-edge-and-remove-coverage-suggest.md)), partly because it had drifted from
  the runner. This version adds no second analysis engine.

## Why the definition matters

The same 71 pages score very differently depending on what's counted:

| Calculation | Result | Problem |
|---|---|---|
| Pages with an authored step | 48 of 71 (68%) | One passing link covers the whole page |
| Markup matches that have a step | Near 100% by construction | Detection turns each match into a step, so one regex supplies both sides of the fraction |
| Numbered items with a step or inside a test | 11 of 84 (13%) | Credits items no step touches, and counts lists that aren't procedures |
| Procedure steps with their own runnable step | 8 of 42 (19%) | The proposed headline |

Markup matches are also noisy. Bold text accounts for 590 of the 727 matches, led by "Cause:" and
"Solution:" at 45 each.

[create-your-first-test.mdx](../fern/pages/docs/get-started/create-your-first-test.mdx) shows the gap on one
page:

| Item | What actually happens | Proposed state |
|---|---|---|
| 1. Navigate to the folder | Its step is inside `test ignore`, so it never runs | Ignored |
| 2. Create the test file | A `runShell` step runs | Covered |
| 3. Paste the code | No step, though it sits inside a test | Untested |
| 4. Save the file | No step, though it sits inside a test | Untested |
| 5. Run the test | Its step is inside `test ignore`, so it never runs | Ignored |

That page scores 100% by page, 80% by test span, and 20% by its own steps. Only the last figure shows that
the tutorial's main step isn't tested.

## Procedure steps

### What counts as a procedure

A numbered list counts when its first item is an instruction. That item starts with a verb, or with a short
opener such as `In a terminal,` and then a verb. The rule judges the whole list because later items in a
procedure often start differently, such as "Ensure" or "Hover".

| Doc set | Numbered lists | Counted as procedures | Items counted |
|---|---|---|---|
| This repository's docs | 23 | 13 | 42 of 84 |
| agent-tools (a second check) | 154 | 43 | 150 of 540 |

How well the rule did, by my own reading of the results:

- **This repository:** it found every procedure. Three of the 42 items aren't really steps, such as "The
  console shows all matching elements."
- **agent-tools:** all 25 sampled counted lists looked like procedures. Of 25 sampled lists it skipped, 6 were
  procedures it missed, because they start with verbs such as "Read" and "Analyze".

So the verb list will miss things on other doc sets. It has to be configurable, and the report has to show how
many numbered lists it didn't count.

The source of a procedure depends on the file type:

| File type | Source | Status |
|---|---|---|
| Markdown | Numbered lists, using the rule above | Measured |
| MDX | `<Steps>` and `<Step>`, plus numbered lists | Not measured. This repository's docs don't use them |
| DITA | `<steps>` and `<step>`, which mark procedures explicitly | Not measured |
| AsciiDoc and HTML | Ordered lists | Not measured |

A file type with no procedure source reports "not measured", never zero or full coverage.

### Which step covers an item

A step belongs to an item when its `location.startIndex` falls inside the item, which runs until the next item
or the end of the list. Authors therefore place a step after the sentence it tests. On a real run, I confirmed
that each step in the report keeps its `location` and `result`, and each test keeps its `contentPath`.

A test wrapped around an item gives it no credit. Only a step located inside the item counts.

### Item states

Each item gets exactly one state, checked in this order:

| State | Meaning |
|---|---|
| Failed | A step in the item failed in any context |
| Covered | A step passed or warned in every context that ran it |
| Ignored | The item overlaps a `test ignore` region |
| Skipped | Its steps were all skipped, which includes `unsafe` code blocks and steps after an earlier failure |
| Untested | No step belongs to it |

On that same real run, a failed step caused the next step to report `SKIPPED`. So one early failure can leave
later items skipped, and they don't count as covered.

Steps that check nothing don't cover an item. That list includes `wait`, `loadVariables`, `saveCookie`,
`loadCookie`, `record`, `stopRecord`, and `closeSurface`.

A `goTo` or `checkLink` step does cover an item, since "Go to the settings page" is correctly tested by a `goTo`.
The report counts those items separately, because they prove less. The badge rule in item 0.4 of the rollout
plan stays stricter, because it makes a claim about a whole page.

## Other kinds of content

These get separate counts, because their markup is precise:

| Kind | Found in this repository's docs | Covered when | Note |
|---|---|---|---|
| Links | 750, of which 32 are absolute | Its `checkLink` passes | Default markup matches only absolute URLs. The rest are reported as not testable until an `origin` is set |
| Code blocks | 559, of which 104 are bash, Python, or JavaScript | Its step passes | Detected blocks are `unsafe` and skip unless allowed, and a skip doesn't count. Other languages report as not runnable |
| Images | 3 | A `screenshot` step passes for that path | |
| HTTP examples | Not measured | Its `httpRequest` passes | |
| OpenAPI operations | Not measured | A passing `httpRequest` names the operation | Serves API testers, who may have few procedures |

Bold text isn't counted, because most of it isn't UI.

Pages stay in the report as context. A standalone spec has no source location, so it can't credit an item. It
credits its whole page through an explicit `verified-by` entry ([ADR 01140](../../adrs/01140-last-verified-on-marker-writeback.md))
or an exact URL match.

## Output

`doc-detective audit` reports the static view without running anything. Using this repository's numbers:

```text
Procedure steps  8 of 42 have a step (3 only by navigation or a link check)
                 27 untested, 5 ignored, 2 only unsafe code blocks
                 10 numbered lists not counted as procedures
Pages            48 of 71 have an authored step
```

After a run, the same figures use results, so "have a step" becomes "covered". They appear in the terminal and
in the markdown reporter, which feeds the Action's job summary. `report_v3` gains an additive `coverage` object
with totals, per-page counts, and each item's line and state.

## Rollout

Personas are Wren (W1) and Priya (P1). Each step ships with an ADR, red-to-green tests, and fixtures under
`test/core-artifacts/`.

1. **Pure calculation.** A `computeCoverage({ content, fileType, steps })` function in `src/common`, with golden
   tests built from fixture pages, including the example above.
2. **Static view.** `doc-detective audit`, using Markdown procedures and the other kinds above.
3. **Run results.** The `report_v3` object, the terminal and markdown output, and the docs page.
4. **More procedure sources.** DITA first, since it's exact, then MDX, AsciiDoc, and HTML.
5. **Verification.** Let `last-verified` report a page's coverage, for the verified answers bet.

## Not in the first version

- **A coverage gate.** The denominator moves as docs change, and the verb list is approximate. If the numbers
  prove stable, add a ratchet that fails on a drop, not a fixed threshold.
- **Judging prose.** Whether an instruction is clear or correct needs a nondeterministic reader, so it's out of
  scope (see [Not in v5](v5-rollout.md#not-in-v5)).
- **A combined score.** Weights would be opinions, and a single number invites gaming.

## Open questions

1. **Verb list configuration.** Proposed: a default list in each file type's config that users can extend, in the
   same place as `markup`.
2. **`goTo` and `checkLink` in the headline.** Proposed: they count, and the report shows them separately.
3. **Item credit for standalone specs.** Proposed: none at first, because any link back to an item would have to
   be authored and maintained by hand.
