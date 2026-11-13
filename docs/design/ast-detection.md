# Structure-aware test detection

Detection in 5.0 matches parsed structure instead of raw text, so code samples stop becoming tests. This doc tracks the
work. [ADR 01155](../../adrs/01155-detect-tests-with-selectors.md) records the engine's design, and
[Selectors](../fern/pages/docs/input-formats/selectors.mdx) is the user-facing reference.

It replaces the spike in #673, which proved the approach at 1,867 lines. The rebuild keeps the spike's intent and its
tested pieces: the statement grammar, the attribute-list parser, the AsciiDoc scanner, and the compat corpus. It drops
the separate statement builder, per-kind matchers, `followedBy.then` chains, and new exports.

## Sequence

Each step is one PR into `feat/v5-rc`.

| Step | Change | Status |
|---|---|---|
| 1 | One default `fileTypes` table, in common (ADR 01153) | PR #801 |
| 2 | `runCode` accepts `py` and `js` (ADR 01154) | PR #802 |
| 3 | Selector engine, Markdown and MDX parsers, schema, `inlineStatements.in` (ADR 01155) | PR #803 |
| 4 | The LSP reads statements through the shared collector, and drops its own regex scanning (ADR 01156) | PR #804 |
| 5 | Parsers for HTML and DITA (`htmlparser2`) and AsciiDoc (a line scanner). Markdown sends embedded HTML, and `.mdx` sends lowercase JSX tags, through the HTML mapping (ADR 01157) | PR #805 |
| 6 | The built-ins move to selectors, and the upgrade guide lists what they detect differently (ADR 01158) | This change |

Steps 1 to 5 don't change what a default config detects, apart from step 1's `typeText` fix and step 2's `py` and `js`
fences. Step 6 does, and can be reverted alone.

## Decisions for step 6 (ADR 01158)

- **Every built-in detects the same eight intents:** goTo, checkLink, click, find, screenshot, type, httpRequest, and
  runCode. Markdown, AsciiDoc, and HTML share one list. DITA keeps its element rules, and adds the shared screenshot,
  httpRequest, and runCode definitions, which match `<image outputclass="screenshot">` and `<codeblock>`.
- **No built-in uses regex.** Regex definitions stay supported for custom file types.
- **`.md` and `.mdx` stay one built-in.** The extension picks the parser.
- **`extends` inherits `inlineStatements.in`.** Built-ins gain `in`, so the merge in `setConfig` must carry it, as it
  carries the regex statement keys today.
- **DITA's duplicate rules merge.** Two `goTo` rules and two `checkLink` rules matched the same external `<xref>`. Each
  is one rule now.
- **A parity test keeps the frozen regex tables,** and lists each intended difference by name, so any other difference
  fails.

## Notes

- Dry runs force the log level to `silent`, so parse warnings never show in `--dry-run` output. The detection fixtures
  that check a warning run their steps instead.
- `setConfig` validates with type coercion. An `anyOf` that allows both a string and `true` must list `true` first,
  untyped, or coercion turns it into the string `"true"`.
- Action objects in `markup` are templates, checked as steps after `$n` replacement, so the schema types them as plain
  objects.
