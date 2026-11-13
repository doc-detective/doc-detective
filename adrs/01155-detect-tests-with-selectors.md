---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Detect tests with selectors

## Context and Problem Statement

Test detection runs regular expressions over a file's raw text. A pattern can't tell prose from a code sample. Statements
and markup inside code fences, inline code, and HTML `<pre>` blocks become tests and steps. A docs page that
shows how to write a Doc Detective test detects that example as a real one. The patterns also miss structure they
can't see, such as a fence inside a list item or bold text written as `__x__`.

The spike in #673 replaced regex with parser-backed "semantic selectors". It proved the idea, but it grew to 1,867
lines across 10 files. It had a separate statement builder, a branch per kind, and four schema shapes for chained
matches. Its last revision made selectors opt-in so that 4.x couldn't break anyone. 5.0 can change what the built-ins
detect, so this decision rebuilds the engine smaller on `feat/v5-rc`.

How should a file type select what to detect, and what should stay of regex detection?

## Decision Drivers

- Detection shouldn't read code samples as tests.
- Regex definitions are in use, and must keep working.
- The config should read like a step: the kind is the key, as the action is in a step.
- One engine and one statement grammar, shared by every format and by the LSP.
- Small: no raw AST in config, no new `parser` setting, and no new exports.

## Considered Options

- **A. Selectors that match parsed nodes, beside regex definitions.** The kind is the key, and a kind with `regex`
  runs the pattern inside each node.
- **B. Keep regex, and add regions that regex skips.**
- **C. The spike as it stood.**
- **D. Expose the parser's syntax tree in config.**

## Decision Outcome

Chosen option: **A**.

A `markup` definition takes `regex`, one selector kind, or both:

- `regex` alone matches the raw text, as before.
- A kind alone matches every node the selector picks. The kinds are `comment`, `codeBlock`, `link`, `image`, `strong`,
  `emphasis`, `text`, and `element`.
- A kind with `regex` runs the pattern on each picked node's main text, and each occurrence is a match.

`captures` maps node fields to `$1`, `$2`, and so on. Without it, a selector uses its `regex` groups, else the node's
main text. Selector matches have the same shape as regex matches, so numbering, `batchMatches`, ordering, generated
test IDs, and the statement state machine don't change. Options filter nodes: `excludes`, `language`, `metaExcludes`,
`tag`, `url`, `src`, `attributes`, and `precededBy`, whose groups are captures too. One matcher applies them all, and
the schema decides which options each kind allows.

`inlineStatements.in` lists the nodes that hold statements. `"comment"` reads every comment, and an object selects
nodes like a markup definition, with `value` naming the field and `regex` extracting the statement. One grammar reads
them all: the text starts with `test`, `test start`, `test end`, `test ignore start`, `test ignore end`, or `step`,
ending at a word boundary. A statement a regex and a container both find counts once.

The extension picks the parser, else the file type's `extends`. This change adds Markdown and MDX:

- Markdown parses as CommonMark through `mdast-util-from-markdown`. GFM is off: detection doesn't need it, and it
  doubles parse time. Paragraphs are also scanned for `{/* */}` and `[comment]: #`, so those forms work in `.md` pages,
  which Docusaurus treats as MDX.
- MDX parses through `micromark-extension-mdxjs`. A file that isn't valid MDX parses as Markdown, with a warning.
- A file no parser handles gets a warning. Its selectors match nothing, and its regex definitions still run.

Selectors work in custom file types. The built-ins keep their regex tables until a later change moves them, so this
change doesn't alter what a default config detects. Other formats get parsers in their own changes. The plan is in
[the design doc](../docs/design/ast-detection.md).

The schema gets stricter about file types, which is a breaking change:

- A custom file type, its `inlineStatements`, and its `markup` definitions reject unknown keys. An executable file
  type rejects them too, so it can't also have `markup`.
- Before, any object with `extensions` passed as an executable file type, so a custom file type was never really
  checked. A typo, or a key from the version 2 config format, did nothing.
- `markup` definitions need `regex` or exactly one kind. A selector pattern must compile, and must be at most 1,500
  characters.
- An action object is a step template, so the schema checks only that it's an object. `{ "httpRequest": { "method":
  "$1" } }` isn't a valid step until `$1` is replaced, and detection already checks each step after replacement.
  With the executable branch no longer hiding them, keeping `step_v3` there would reject valid templates. Dropping it
  also shrinks `schemas.json` from 61 MB to 42 MB.
- `extends` accepts `dita`, and `markup` may be empty, as the HTML built-in's is.

### Consequences

- Good: a custom file type can skip code samples, and match structure regex can't see.
- Good: regex definitions keep working, alone or inside a kind.
- Good: one collector produces every statement, so the LSP can share it.
- Good: a broken custom file type fails at startup with the key it doesn't recognize.
- Bad: configs with unknown file type keys, or action names Doc Detective doesn't know, now exit 2. The upgrade guide
  covers this.
- Bad: three parser dependencies, about 70 packages with their own dependencies. They load only when detection does.
- Neutral: dry runs silence warnings, so a parse warning shows only on a real run.

### Confirmation

- `src/common/test/selectors.test.js` covers the schema, the statement grammar, the Markdown and MDX nodes, and
  detection through `detectTests`, at the package's 100% coverage.
- `test/core-artifacts/detection/selectors.spec.json` runs each case of `dry-run-detect.cjs` through the real CLI. The
  cases cover every Markdown kind, each container form, each definition form, and MDX components. They also cover the
  MDX fallback, the no-parser warning, `extends`, `detectSteps: false`, and three configs that must exit 2.
- `test/config-coverage.test.js` asserts that containers and selector definitions survive `extends`.

## Pros and Cons of the Options

### A. Selectors that match parsed nodes, beside regex definitions

- Good: the kind as the key matches how steps read, and a kind with `regex` reuses the patterns users have.
- Good: about 530 lines for the engine and the Markdown parser, with no new package exports.
- Bad: each format needs a parser.

### B. Keep regex, and add regions that regex skips

- Good: no parsers.
- Bad: every format needs its own region rules, written in regex, with the same blind spots.

### C. The spike as it stood

- Good: done, with tests.
- Bad: 1,867 lines, a separate statement builder, and 18 new exports to maintain.
- Bad: chained `followedBy.then` matches doubled the schema shapes for one definition.

### D. Expose the parser's syntax tree in config

- Good: anything a parser sees is selectable.
- Bad: config would tie users to one parser's node names, for each format.
