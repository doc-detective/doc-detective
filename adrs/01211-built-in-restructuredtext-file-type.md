---
status: accepted
date: 2026-11-15
decision-makers: doc-detective maintainers
---

# Built-in reStructuredText file type

## Context and Problem Statement

Doc Detective ships four built-in file types: `markdown`, `asciidoc`, `html`, and `dita`. Sphinx and
docutils projects write reStructuredText (`.rst`), and those files got no detection. The only advice
was a dormant hint that told users to declare `{ "extends": "markdown", "extensions": ["rst"] }`,
which parses RST as Markdown: directive bodies read as prose, `.. ` comments never hold statements,
and `` `text <url>`_ `` links aren't links.

Selector detection needs a parser that turns a file into nodes with exact source offsets (comment,
code block, link, image, strong, emphasis, text). How do we read RST, and how does it reach users?

## Decision Drivers

- Parity with AsciiDoc: inline statements in comments, plus every shared built-in definition
  (goTo, checkLink, click, find, screenshot, type, httpRequest, runCode).
- `doc-detective-common` runs in the CLI, the VS Code extension, and Online. A dependency or a load
  step lands in all three.
- `collectStatements` and its parsers are synchronous.
- Match the sibling `manni` tool, which reads RST with line scanning and no parser dependency.

## Considered Options

- **A. A hand-rolled line scanner, like the AsciiDoc one.**
- **B. `tree-sitter-rst` through `web-tree-sitter`.**
- **C. The `restructured` npm package.**
- **D. docutils through Python.**

## Decision Outcome

Chosen option: **A**, a line scanner in `src/common/src/detect/rst.ts`.

- New built-in `rst` (versioned key `rst_1_0`): `extensions: ["rst"]`,
  `inlineStatements: { in: ["comment"] }`, and its own copy of the shared markup.
- `rst` joins the default `fileTypes` list and the `fileTypes` and `extends` enums in `config_v3`.
- Statements are RST comments: `.. step {...}`, `.. test {...}`, `.. test end`,
  `.. test ignore start`, `.. test ignore end`. A comment's content is its first line plus the
  indented block below it, so a step's JSON can sit on the next lines.
- Not `.rest`: the REST Client editor extension uses it for HTTP request files.
- The scanner reads:
  - comments, which aren't directives (`.. x::`), targets (`.. _x:`), footnotes or citations
    (`.. [x]`), or substitutions (`.. |x|`);
  - `code-block`, `code`, and `sourcecode` directives, with the argument as the language and the
    option lines as the meta, so `:class: testIgnore` skips a block for the built-in `runCode`;
  - literal blocks after a paragraph ending in `::`;
  - `image` and `figure` directives, with `:alt:` as the alt text and other options as attributes;
  - embedded-URI links (`` `text <url>`_ ``) and bare URLs;
  - `**strong**` and `*emphasis*`.
- Inline literals, interpreted text, and roles are code and hold no nodes. `raw` bodies and title
  adornments hold no nodes. Other directives' bodies are prose.
- The extension picks the parser before `extends`, as for every format. A custom fileType that
  claims `.rst` while extending Markdown now parses as RST. That is the intent: the old workaround
  mis-parsed the file.
- The dormant `useFileTypesForRst` hint and its per-run filesystem scan are removed. Its advice is
  now wrong.

Not read, landing as text with no error: named references resolved through `.. _name: url` targets,
substitution images, and roles such as `:guilabel:` as elements.

### Consequences

- Good: `.rst` files under `--input` get inline statements and the built-in detected steps with no
  config.
- Good: no new dependency and no async load in common's three consumers.
- Bad: the scanner covers the selector kinds, not the language. Nested inline markup and
  reference-style links aren't read.
- Neutral: a custom fileType that claimed `.rst` through `extends: "markdown"` changes parser.

### Confirmation

- `src/common/test/formats.test.js` covers the scanner node by node, and `builtins.test.js` holds RST
  to the same steps as the other built-ins.
- `test/core-artifacts/detection/` runs the RST cases through the real CLI: every kind, the extension
  picking the parser over `extends`, `extends: "rst"`, a run with a multi-line step and an ignore
  block, the built-in with no config, and the exit-2 rejection of an unknown built-in name.

## Pros and Cons of the Options

### A. Hand-rolled line scanner

- Good: no dependency. Same shape as `asciidoc.ts`, and the same `Node[]` contract.
- Good: synchronous, so it drops into `parseFile` as is.
- Bad: a subset of RST. Upgrade path: swap the body of `parseRst` for option B behind the same
  contract.

### B. `tree-sitter-rst` with `web-tree-sitter`

- Good: maintained, a full grammar, exact offsets, and a shipped `.wasm`.
- Bad: about 1.3 MB of wasm, an async `Parser.init()` in a synchronous path, and wasm loading in
  the VS Code extension and Online bundles.

### C. `restructured`

- Bad: last released in 2016 at 0.0.11, with `power-assert` and `commander@2` as runtime
  dependencies.

### D. docutils

- Bad: needs a Python runtime on every machine that runs Doc Detective.
