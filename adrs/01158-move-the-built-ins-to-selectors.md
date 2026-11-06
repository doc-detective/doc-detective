---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Move the built-in fileTypes to selectors

## Context and Problem Statement

The built-in `markdown`, `asciidoc`, `html`, and `dita` fileTypes detect tests with regular expressions over raw text.
That reads code samples as tests. A docs page that shows how to write a Doc Detective test runs the sample, including
`badge: true` tests that write badges into the sample. The patterns have plain bugs too. The `runCode` pattern for
` ```js ` also matches ` ```json `, so every JSON sample becomes an unsafe JavaScript step. The DITA rules match an
external `<xref>` twice for `goTo` and twice for `checkLink`.

The built-ins also detect different things. AsciiDoc and HTML detect no steps, and DITA has no screenshot, request, or
code rules. [ADR 01155](01155-detect-tests-with-selectors.md) and [ADR 01157](01157-parse-html-dita-and-asciidoc-for-selectors.md)
added selectors and parsers for every format. 5.0 is the release that can change what a default config detects.

What should the built-ins detect, and how?

## Decision Drivers

- Code samples must not run.
- Every built-in should detect the same intents, so moving between formats doesn't lose coverage.
- Keep what the regex built-ins detect today, apart from named, deliberate differences.
- One shared definition list, so the formats can't drift.

## Considered Options

- **A. Move every built-in to selectors, with one shared list for Markdown, AsciiDoc, and HTML, and DITA's rules plus
  the shared ones.**
- **B. Move only Markdown, and leave the other formats on regex.**
- **C. Keep the regex built-ins, and fix their bugs.**

## Decision Outcome

Chosen option: **A**.

Every built-in reads inline statements from comments only, through `inlineStatements.in`. AsciiDoc's container also
takes the statement from parentheses, as in `// (step {...})`. DITA reads `<?doc-detective ?>` instructions as
comments, and `<data name="doc-detective" value="...">` elements as a second container.

Markdown, AsciiDoc, and HTML share one list: `goToUrl`, `checkHyperlink`, `clickOnscreenText`, `findOnscreenText`,
`screenshotImage`, `typeText`, `httpRequestFormat`, and `runCode`. DITA keeps its element rules, `clickUiControl`,
`typeIntoUiControl`, `findUiControl`, `verifyWindowTitle`, and `checkLinkElement`, and adds the shared ones. DITA's
two `goTo` rules become one `goToUrl`, and its two `<xref>` `checkLink` rules become one `checkHyperlink`. Every
built-in detects the same eight intents: `goTo`, `checkLink`, `click`, `find`, `screenshot`, `type`, `httpRequest`, and
`runCode`.

Selectors with `regex` keep each pattern where it still matters. `typeText` runs its pattern on prose, and
`httpRequestFormat` runs its request pattern inside `http` and unlabeled code blocks. `extends` now inherits
`inlineStatements.in` along with the regex statement keys.

This is a breaking change. The upgrade guide lists what's newly detected, what isn't anymore, and how to compare runs.

### Consequences

- Good: statements, links, and bold text inside code samples stop running, in every format.
- Good: AsciiDoc and HTML pages detect steps, and DITA gains screenshots, requests, and code blocks.
- Good: DITA reads an `<xref>`'s attributes in any order. The regex rules needed `href` first, unless the
  `<xref>` had `scope="external"`, so other `<xref>` elements gain `goTo` and `checkLink` steps.
- Good: the JSON-as-JavaScript and duplicate-DITA bugs are gone.
- Bad: suites gain and lose steps. On this repo's docs, with step detection on, 176 of 206 pages change, and the steps
  drop from 2,137 to 1,481. Most of the drop is 379 `runCode` steps from JSON samples. With the docs job's own config,
  which reads statements only, 5 of 49 pages change, losing 13 steps that sat in samples.
- Bad: generated test IDs change for tests whose steps change.
- Neutral: code that reads `defaultFileTypes[...].markup[].regex` from `doc-detective-common` finds selector
  definitions instead.

### Confirmation

- `src/common/test/builtins.test.js` asserts that each built-in detects every intent with selectors only, and that the
  four formats detect the same steps from equivalent documents. It asserts that no built-in reads a statement or a step
  from code.
- The same file runs every detection fixture through the built-ins and through frozen copies of the regex tables, in
  `test/fixtures/regex-fileTypes.js`. Each fixture must detect the same steps. The one named exception is the dropped
  DITA duplicates, which must keep the regex order.
- `test/core-artifacts/detection/selectors.spec.json` runs each built-in through the real CLI with no `fileTypes` in
  the config.

## Pros and Cons of the Options

### A. Every built-in on selectors

- Good: one definition list, and the same coverage in every format.
- Bad: the largest change to default detection, for every format at once.

### B. Only Markdown

- Good: a smaller change.
- Bad: AsciiDoc, HTML, and DITA keep reading samples, and keep detecting less.

### C. Fix the regex built-ins

- Good: no change in approach.
- Bad: regex can't tell a code sample from prose, so the main problem stays.
