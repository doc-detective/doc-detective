---
status: accepted
date: 2026-11-26
decision-makers: hawkeyexl
---

# Built-in Gherkin file type

## Context and Problem Statement

Teams that write Gherkin (`.feature`) files use them as readable specifications, and some already
have a Cucumber suite. Doc Detective couldn't read them. A custom fileType with hand-written regexes
gave one test per file, with no Scenario boundaries, no Background, and no Outline expansion.

How does a `.feature` file become Doc Detective input, with each Scenario running as a test through
the real runner, with no config?

## Decision Drivers

- No config: `.feature` files under `--input` just work, like `rst` ([ADR 01211](01211-built-in-restructuredtext-file-type.md)).
- `doc-detective-common` runs in the CLI, the VS Code extension, and Online. A dependency lands in
  all three, and `collectStatements` is synchronous.
- Reuse the inline-statement state machine in `parseContent` rather than adding a second notion of
  test boundaries.
- Inline statements (`# test`, `# step`, `# test ignore start|end`) work as in every other format.
- One step vocabulary, defined once and exported, so a future step-definition package uses the same
  phrases (Plans rule 1).

## Considered Options

- **A. A hand-written parser that emits selector nodes, with synthetic test-boundary comments.**
- **B. `@cucumber/gherkin` for the AST, mapped to nodes.**
- **C. A custom fileType of regexes over the raw text.**
- **D. A hand-written parser that returns tests directly, bypassing `collectStatements`.**

## Decision Outcome

Chosen option: **A**, `parseGherkin()` in `src/common/src/detect/gherkin.ts`.

### The file type

- New built-in `gherkin` (versioned key `gherkin_1_0`): `extensions: ["feature"]`,
  `inlineStatements: { in: ["comment"] }`, and `markup: gherkinMarkup`.
- `gherkin` joins the default `fileTypes` list and the `fileTypes` and `extends` enums in
  `config_v3`. `.feature` maps to the parser in `FORMAT_BY_EXTENSION`.
- `gherkinMarkup` is exported from `fileTypes.ts`. Each entry matches `element` nodes with tag
  `step`, and its `regex` is anchored to the step text without the keyword.
- Keywords are English only: `Feature`, `Rule`, `Background`, `Scenario` and `Example`,
  `Scenario Outline` and `Scenario Template`, `Examples` and `Scenarios`, and the step keywords
  `Given`, `When`, `Then`, `And`, `But`, and `*`. The parser marks the limit with a `ponytail:`
  comment. A `# language:` header isn't read.

### A scenario implies its test boundaries

For every Scenario, and for every Examples row of an Outline, the parser emits a `comment` node with
the content `test <JSON>`, then the steps, then a `comment` node with `test end`. The existing
inline-statement handling in `parseContent` then opens and closes the test. Nothing in
`parseContent` knows about Gherkin.

The JSON holds:

- `testId`: an `@id:<x>` tag, else the scenario name. An Outline row adds ` [row N]`, where N counts
  from 1 across all of the Outline's Examples rows.
- `description`: the scenario name, with Outline placeholders substituted.
- `runOn`, `autoRecord`, and `if`, from tags and emulation steps (below).

A user `# test {...}` comment above a Scenario, or above its tags, merges into that JSON, and the
user's keys win. It isn't emitted on its own. Only a JSON object merges; any other `# test`
comment stays an ordinary comment. A user `# test end` is dropped, since the scenario ends the test.

### Two generic `Node` fields

Two optional fields on `Node` in `selectors.ts` let one source line run in more than one test,
without adding test boundaries to `collectStatements`:

- `sortIndex?: number`: where the node's statements sort, when that isn't its source offset.
  `collectStatements` uses it for container statements and for markup matches from that node.
  Statements keep their real spans and line numbers, so a failing step points at the real line.
- `unmatched?: string`: a warning. When step detection is on and no markup definition produced a
  step from the node, `collectStatements` warns with it, once per message.

For each test, the parser lays out an ordered list: the test-start comment, the Background steps
and comments, the scenario's steps and comments, and the test-end comment. Item `i` of `N` gets
`sortIndex = anchor + (i + 1) / (N + 2)`, where the anchor is the Scenario line's start offset, or
the Examples row's start offset for an Outline. Every test's statements then sort inside
`[anchor, anchor + 1)`, which no other node occupies. That's how a Background replays inside every
scenario, and an Outline replays once per row.

Because replayed nodes share a span, the statement de-duplication key in `collectStatements` now
includes `sortIndex`.

### Steps

Each step line becomes an `element` node with `tag: "step"`. Its `content` is the step text without
the keyword, and its attributes are `keyword`, plus `docString` and `mediaType` when a doc string
follows. A step that no definition maps warns:

``Couldn't map step `When I frobnicate` in `/abs/login.feature:12` to an action. Add a `step` statement or a `markup` entry.``

The parser doesn't warn when the test sets `detectSteps: false`.

The parser rewrites a few steps before markup sees them, because a template can't compute:

- `I wait <n> seconds` becomes `I wait <n × 1000> milliseconds`. `wait` takes milliseconds.
- `I press "<key>"` uppercases the key and turns spaces and hyphens into `_`, so `"Page Down"`
  becomes `$PAGE_DOWN$`, the `type` action's special-key syntax.
- `the response status should be <n>` (or `is <n>`) right after an `I send a ... request` step
  appends ` and the response status should be <n>` to that step, and emits no node of its own. The
  request definitions then fill `statusCodes`. An attribute can't carry it: a missing attribute
  resolves to `""`, which isn't a valid `statusCodes`, while a regex group that didn't take part
  drops the field.
- A data table after `I fill in:` (selector, value) becomes one `I type "<value>" into "<selector>"`
  step per row, and one after `I should see:` becomes one `I should see "<x>"` per row. Each row
  keeps its own span.

### Vocabulary

| Phrase | Step |
|---|---|
| `I go to "<url>"`, `I open "<url>"` | `goTo` |
| `I click "<x>"` | `click` |
| `I see "<x>"`, `I should see "<x>"` | `find` |
| `I should not see "<text>"` | `runBrowserScript` that returns whether the page text lacks it, with `output: "true"` |
| `I type "<keys>"` | `type` |
| `I type "<keys>" into "<selector>"` | `type` with `keys` and `selector` |
| `I press "<key>"` | `type` with a special key |
| `I hover over "<x>"`, `I scroll to "<x>"` | `find` with `moveTo: true` |
| `I drag "<a>" to "<b>"` | `dragAndDrop` |
| `I swipe up\|down\|left\|right` | `swipe` |
| `the link "<url>" works` | `checkLink` |
| `I take a screenshot "<path>"` | `screenshot` |
| `I take a screenshot of "<x>" as "<path>"` | `screenshot` with `crop` |
| `I start recording "<path>"`, `I stop recording` | `record`, `stopRecord` |
| `I save the session as "<path>"`, `I restore the session "<path>"` | `saveState`, `loadState` |
| `I run "<cmd>"`, `I run the command "<cmd>"`, `I run the script "<path>"` | `runShell` |
| `I run:` with a doc string | `runCode`, language from the media type |
| `I wait <n> seconds`, `I wait <n> milliseconds` | `wait` |
| `the variables in "<path>"` | `loadVariables` |
| `I send a <METHOD> request to "<url>"`, optionally `with:` and a doc string body | `httpRequest` |
| `the API "[<METHOD> ]<url>" returns "<file>"`, or `returns:` and a doc string | `mockRequest` with `bodyPath` or `body` |

`find_v3` has no absence assertion, so `I should not see` checks the page text in the browser. v3
has no `moveTo` or `scroll` action, and `find` with `moveTo: true` scrolls the element into view.

### Tags and emulation

Tags on `Feature`, `Rule`, `Scenario`, and `Examples` are inherited downward.

| Tag | Effect |
|---|---|
| `@chrome` `@firefox` `@safari` `@webkit` | `runOn` browsers |
| `@windows` `@mac` `@linux` `@android` `@ios` | `runOn` platforms |
| `@headless` | `headless: true` on the browsers |
| `@record` | `autoRecord: true` |
| `@skip`, `@wip` | `if: "false"`, so the test is SKIPPED |
| `@id:<x>` | `testId` |

`@edge` isn't mapped: Edge isn't in the `browserName` enum. Other tags are ignored.

These steps are consumed and set context emulation ([ADR 01223](01223-page-emulation-on-context-browsers.md))
instead of running: `a <W>x<H> viewport`, `dark mode`, `light mode`, `the locale is "<x>"`, and
`the timezone is "<x>"`. Emulation lives on a browser object, which needs a `name`. With no browser
tag, the parser names `chrome`, the one browser that supports every emulation field. `@headless`
alone does the same.

`@skip` uses the existing test guard. The test is SKIPPED with the guard's reason,
`Skipped: test guard `if` condition not met.`, not a tag-specific one. A tag-specific reason would
need a new skip mechanism.

### Outlines

`<name>` placeholders in step text, doc strings, and table cells are replaced from each Examples
row. An Outline with no Examples emits no test and warns:

``Couldn't expand `Scenario Outline: X` in `/abs/f.feature:4`: it has no `Examples`.``

### Consequences

- Good: `.feature` files under `--input` run each Scenario as a test, with no config.
- Good: no new dependency, and nothing Gherkin-specific outside the parser and the markup.
- Good: Feature tags and emulation make a file into a browser matrix, such as `@chrome @firefox`
  with `Given dark mode`.
- Bad: English keywords only. Upgrade path: a keyword table per `# language:`.
- Bad: `@skip` shows the guard's generic skip reason.
- Neutral: `sortIndex` and `unmatched` are generic `Node` fields any parser can set.

### Confirmation

- `src/common/test/gherkin.test.js` covers the parser and detection end to end: Background order,
  Outline rows, tags, the merged `# test` comment, `detectSteps: false`, the warnings, tables,
  emulation, and every phrase. `validate.test.js` covers the schema enums.
- `test/core-artifacts/gherkin/` runs every phrase and construct through the real CLI. The fixture
  jobs' config turns step detection off, so `gherkin.spec.json` runs `run-feature.cjs`, which runs
  each `.feature` file with detection on and checks each test's result and the warnings. Run
  directly, the `.feature` files also cover detection off. Every spec resolves to PASS or SKIPPED.

## Pros and Cons of the Options

### A. Hand-written parser with synthetic boundaries

- Good: no dependency, synchronous, and the same `Node[]` contract as the other parsers.
- Good: reuses the inline-statement state machine, so ignore blocks, `# step`, and `detectSteps`
  behave as everywhere else.
- Bad: a subset of Gherkin: English only, and no `# language:` header.

### B. `@cucumber/gherkin`

- Good: the full grammar and every language.
- Bad: a dependency (and its messages package) in all three of common's consumers, for a grammar
  subset of about 300 lines.

### C. Regexes over raw text

- Bad: no Scenario boundaries, Background, or Outline expansion. That's the status quo.

### D. Return tests directly

- Bad: duplicates `parseContent`'s handling of `# test`, `# step`, ignore blocks, and validation,
  and the two would drift.
