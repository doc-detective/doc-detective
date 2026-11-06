---
status: accepted
date: 2026-11-05
decision-makers: doc-detective maintainers
---

# Parse HTML, DITA, and AsciiDoc for selectors

## Context and Problem Statement

[ADR 01155](01155-detect-tests-with-selectors.md) added selectors and parsers for Markdown and MDX. The built-ins move
to selectors next, and every built-in has to detect the same things, so HTML, DITA, and AsciiDoc need parsers too.
Markdown also embeds HTML, and MDX uses lowercase JSX tags such as `<a>` and `<img>`. Selectors there should see what
those tags mean.

How should these formats become selector nodes?

## Decision Drivers

- The same kinds mean the same things in every format.
- A broken document must not stop detection.
- Code samples hold no tests, in every format.
- Few dependencies, and none that throws on input users write.

## Considered Options

- **A. `htmlparser2` for HTML and DITA, with a table of tags per dialect, and a line scanner for AsciiDoc.**
- **B. A conformant XML parser for DITA, an HTML5 parser for HTML, and Asciidoctor.js for AsciiDoc.**
- **C. Keep these formats on regex definitions only.**

## Decision Outcome

Chosen option: **A**.

`src/common/src/detect/markup.ts` parses HTML and DITA with `htmlparser2`, which keeps exact offsets, decodes entities,
tolerates broken markup, and never throws. HTML maps `<a href>` to `link`, `<img>` to `image`, `<strong>` and `<b>` to
`strong`, `<em>` and `<i>` to `emphasis`, and `<pre>` to `codeBlock`. DITA maps `<b>`, `<i>`, `<codeblock>`, and
`<image>`, whose `href` is its `src`, and its `<?doc-detective ?>` instruction is a `comment`. Every other tag is an
`element`, with its attributes and text. DITA's `outputclass` also sets `class`, and a `language-x` class names a code
block's language.

Code tags hold no nodes, no prose, and no statements. In HTML, those are `<pre>`, `<code>`, `<script>`, `<style>`, and
`<textarea>`. In DITA, they're `<codeblock>`, `<codeph>`, `<pre>`, `<screen>`, and `<msgblock>`. A node's `before` runs
from its nearest block-level ancestor, so `precededBy` sees inline tags as source, as DITA's
`Type <userinput>x</userinput> into the <uicontrol>` pattern needs.

`src/common/src/detect/asciidoc.ts` scans AsciiDoc line by line:

- `//` lines and `////` blocks are comments, at the start of a line only.
- `----` and `....` blocks are code blocks. A `[source,x]` line above names the language, and its later options are
  the meta.
- `image::` lines and inline `image:` macros are images. A role, from `role=` or a `[.role]` line above, sets `class`.
- `https://...[text]` and `link:...[text]` are links. `*x*` and `**x**` are strong, and `_x_` and `__x__` are emphasis.
- Backtick spans, `++++` blocks, attribute entries, and indented literal paragraphs hold no nodes.

Markdown sends embedded HTML through the HTML mapping. A block of HTML parses whole, prose included. In a paragraph,
the span from the first raw-HTML node to the last parses as HTML, and Markdown keeps its own prose. In `.mdx`, lowercase
JSX tags with an HTML kind become that kind, and `className` sets `class`.

### Consequences

- Good: every format produces the same kinds, so the built-ins can share definitions.
- Good: comments, formatting, and links inside `<pre>`, `<script>`, `<codeblock>`, and AsciiDoc listings stop being
  detectable.
- Good: one new dependency, `htmlparser2`, which the lockfile already had as a cheerio dependency.
- Bad: the AsciiDoc scanner covers detection, not the language. Includes, conditionals, and tables aren't modeled, and
  a construct it doesn't know stays prose.
- Neutral: text between inline HTML tags in Markdown is prose and link text both, so a `text` selector also sees an
  `<a>`'s text.

### Confirmation

- `src/common/test/formats.test.js` covers each format's kinds, code tags, attributes, `before`, broken markup, CRLF,
  unclosed blocks, embedded HTML, and lowercase JSX, at the package's 100% coverage.
- `test/core-artifacts/detection/selectors.spec.json` runs five more CLI cases: HTML, DITA, AsciiDoc, HTML inside
  Markdown, and lowercase JSX in MDX.

## Pros and Cons of the Options

### A. `htmlparser2`, a tag table per dialect, and an AsciiDoc scanner

- Good: one parser and one walker for two formats.
- Good: no parse failures to handle.
- Bad: DITA isn't validated as XML, so a malformed topic still yields nodes.

### B. A conformant parser per format

- Good: each format is read exactly as its toolchain reads it.
- Bad: conformant XML parsers reject fragments and malformed topics, which needs fallback code.
- Bad: Asciidoctor.js is large, and drops comments before its parse tree exists.

### C. Keep these formats on regex

- Good: no new code.
- Bad: the built-ins can't detect the same things in every format, and code samples stay detectable.
