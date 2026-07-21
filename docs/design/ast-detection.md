# AST-based test detection

Design for replacing regex-only test detection with structure-aware (AST-backed) detection via
**semantic selectors**, while keeping regex detection fully supported. Decision record:
[ADR 01082](../../adrs/01082-semantic-selector-test-detection.md).

## Context

Doc Detective's test detection is 100% regex today: `fileTypes[].markup[].regex` and
`inlineStatements` patterns run via `matchAll` over raw file text, ordered by character offset,
through the state machine in `src/common/src/detectTests.ts`. This causes a persistent class of
problems: hand-tuned guard hacks (image negative-lookbehinds, `testIgnore` lookaheads, non-greedy
bold matching in `src/common/src/fileTypes.ts`), false positives from comments inside code fences,
HTML-entity/escaping workarounds in `parseObject`, prototype-pollution guards in
`parseXmlAttributes`, a ReDoS guard (`safeRegExp`), duplicated default tables
(`src/common/src/fileTypes.ts` vs `src/core/config.ts`), and a third divergent detection
reimplementation in the LSP (`src/lsp/inline.ts`).

Two prior AST prototypes (Dec 2025 Copilot draft PR in `.github`; Feb 2026
`doc-detective-common/ast` branch, ~13.9k insertions) implemented a raw `astNodeMatch`
node-matcher design. Neither was rejected on merit — both were orphaned by the monorepo migration.
Research into the 2026 parser landscape and comparable tools (Vale, markdownlint, Bluehawk,
pytest-codeblocks) informed the design below.

**Decisions:**

1. **Config surface = semantic selectors only** — no raw AST node-matcher surface; regex remains
   the escape hatch.
2. **AsciiDoc = purpose-built line-aware scanner backend** — asciidoctor.js discards comments
   pre-parse and is Opal-heavy; tree-sitter-asciidoc is the future upgrade slot, not v1.
3. **Regex stays co-equal indefinitely**; built-in fileType definitions migrate to selectors; user
   regex configs keep working unchanged.

**Node/ESM:** the repo requires Node ≥22.12.0, which supports unflagged `require(esm)`, so the
ESM-only unified/remark stack is directly consumable from the CJS build — no engines bump, no
bundling. The effort ships as `feat` minors.

## Design

### Core concept: format backends + semantic nodes + selectors

A **format backend** parses a source file into a flat, offset-ordered list of positioned
**semantic nodes**. The vocabulary is format-agnostic; each backend maps its native constructs
onto it:

| Kind | Meaning | Markdown/MDX | HTML | XML/DITA | AsciiDoc |
|---|---|---|---|---|---|
| `comment` | non-rendered author note | `<!-- -->`, `[comment]: #` (all quote variants), MDX `{/* */}` | `<!-- -->` | `<!-- -->` | `//` line, `////` block |
| `codeBlock` | fenced/source block | ``` fence (language + meta from info string) | `<pre><code class="language-x">` | `<codeblock>` | `[source,lang]` + `----` |
| `link` | hyperlink | `[text](url)` (images are a different node — no lookbehind needed) | `<a href>` | — (use `element`) | `https://…[text]` |
| `image` | image w/ optional attrs | `![alt](src){: .cls #id key="val"}` | `<img>` | `<image>` | `image::src[alt, role=…]` |
| `strong` / `emphasis` | bold / italic text | `**x**` / `*x*` | `<strong>/<b>`, `<em>/<i>` | `<b>` / `<i>` | `*x*` / `_x_` |
| `text` | prose text runs (never inside code/comments) | text nodes | text nodes | text nodes | body lines |
| `element` | named element + attributes | MDX JSX components | any tag | any tag (`<uicontrol>`, `<xref>`…) | — |

Each node carries exact start/end offsets (drives existing `sortIndex` ordering), line number, and
named fields (`content`, `text`, `language`, `meta`, `url`, `alt`, `src`, `tag`, `attributes.*`).

**Selectors** are declarative matchers against semantic nodes, added to `markupDefinition` as a
peer of `regex` — and **modeled on the step schema: the kind IS the key** (like `{"goTo": …}`,
`{"find": …}` in `step_v3`). The schema is a `oneOf` across kind keys, so each kind object exposes
only the options valid for that kind:

```jsonc
{
  "name": "runCode",
  "codeBlock": {                                          // the kind is the key
    "language": ["bash", "python", "py", "javascript", "js"],
    "metaExcludes": "testIgnore"                          // info-string tail filter
  },
  "captures": ["language", "content"],                    // → $1, $2 (preserves action contract)
  "actions": [{ "unsafe": true, "runCode": { "language": "$1", "code": "$2" } }]
}
```

A `markupDefinition` is a single object schema whose property table holds both modes (`name`,
`regex`, the eight kind keys, `captures`, `actions`, `batchMatches`), constrained by an outer
`oneOf`: `required: ["regex"]` | inner `oneOf` over the kind keys (exactly one). The outer
`oneOf` makes the modes mutually exclusive — a definition carrying both `regex` and a kind key
fails validation. One shared property
table matters because the schema build fully dereferences `$ref`s: `actions` embeds the entire
step schema, and a two-branch `anyOf` would duplicate it at every markupDefinition site (measured:
+39 MB on the generated `schemas.json`; the flattened shape costs +9 MB, all from the selector
tree itself). Consequence: unknown top-level properties pass when a valid mode is present (as
regex definitions always allowed), but kind *option* objects are `additionalProperties: false`, a
misspelled kind key means "no valid mode" and fails, and two kind keys fail the `oneOf`. Per-kind
options (all optional; `{}` = any node of that kind; scalar shorthands mirror the step schema,
e.g. `"codeBlock": "bash"` ≡ `{"language": "bash"}`, `"element": "uicontrol"` ≡
`{"tag": "uicontrol"}`):

| Kind key | Options | Capturable fields |
|---|---|---|
| `comment` | `matches`, `excludes` | `content`, `match.<n>` |
| `codeBlock` | `language` (string\|array; `""` = bare fence), `metaMatches`, `metaExcludes`, `attributes`, `contentMatches`, `contentExcludes` | `language`, `meta`, `content`, `attributes.<name>`, `match.<n>` |
| `link` | `url` (regex), `text` (regex), `attributes`, `precededBy`, `followedBy` | `text`, `url`, `title`, `attributes.<name>` |
| `image` | `src` (regex), `alt` (regex), `attributes`, `precededBy`, `followedBy` | `src`, `alt`, `attributes.<name>` |
| `strong` / `emphasis` | `text` (regex), `precededBy`, `followedBy` | `text` |
| `text` | `matches`, `excludes` | `match.<n>` |
| `element` | `tag` (string\|array), `attributes`, `contentMatches`, `contentExcludes`, `precededBy`, `followedBy` | `tag`, `content`, `attributes.<name>`, `match.<n>`, `then.<field>` |

Shared option semantics:

- `attributes` — map of attribute name → exact string | regex string | `true` (exists). Collapses
  today's attribute-order/quote-variant regex quadruplication; entities decoded by the real
  parser. Where attributes come from is per-backend:
  - **Markdown/MDX**: Kramdown-style IALs and Pandoc-style attribute spans on images, links, and
    code fences — `{: .screenshot}`, `{.screenshot}`, `{: #results .screenshot width="800"}` all
    normalize the same way: `.foo` → `class` (multiple classes space-joined), `#bar` → `id`,
    `key="val"`/`key=val` → named attribute. This is load-bearing: today's `screenshotImage` regex
    already keys off `{….screenshot…}`, and the backend upgrade makes *every* IAL attribute (not
    just classes) matchable and capturable. Kramdown block IALs on their own line attach to the
    adjacent block. MDX JSX attributes surface on `element` nodes the same way.
  - **HTML/XML**: native element attributes.
  - **AsciiDoc**: bracket attrlists (`image::x.png[alt, role=screenshot]` → positional + named
    attrs).
- `contentMatches`/`matches` capture groups are exposed as `match.1`, `match.2`, … (scoped regex
  power *inside* structure — replaces guard-hack lookarounds).
- `precededBy` / `followedBy` — regex against adjacent sibling text, for verb-context patterns
  ("Click **X**", "Go to \[url]"). `followedBy` may also be
  `{ "text": regex, "then": { "<kind>": {…} } }` to chain a second node for sequence patterns
  (DITA's "Type `<userinput>` into `<uicontrol>`"); chained fields capture as `then.*`.
- `captures` — array of field paths mapped in order to `$1..$n`. The full set of exposed paths
  (each kind exposes the subset shown in the "Capturable fields" column above):
  - `content` — the node's inner source text (code block body, comment body, element inner
    text/XML).
  - `text` — the rendered/display text (link text, strong/emphasis text).
  - `language` / `meta` — codeBlock info-string language and its tail.
  - `url` / `title` — link destination and optional title.
  - `src` / `alt` — image source and alt text.
  - `tag` — element/component name.
  - `attributes.<name>` — any attribute value by name (element, image), post-entity-decoding.
  - `match.<n>` — the n-th capture group of the kind's `matches`/`contentMatches` regex.
  - `then.<field>` — any of the above on the node chained via `followedBy.then` (e.g.
    `then.content`, `then.attributes.href`).

  Each kind has a documented default capture order; built-ins set `captures` explicitly.

### Inline statements

(`test`, `test end`, `step`, `test ignore start/end`): today, each statement form needs its own
regex that matches the *entire literal text* — wrapper syntax included — so the markdown built-in
carries 8 separate `testStart` regexes (HTML comment, MDX comment, and `[comment]: #` in three
quote flavors), and DITA carries 7 `step` regexes (PI, XML comment, and `<data>` in quote ×
attribute-order permutations). Every wrapper × every keyword × every quoting variant = its own
pattern.

The new model splits that into two independent parts:

1. **Where statements live** — `inlineStatements.in` lists which semantic nodes to look inside,
   using the same kind-as-key shapes as markup selectors. Each entry answers one question: "which
   nodes should be read as potential statements?"
2. **What a statement says** — one shared parser takes each matching node's text, checks whether
   it starts with a statement keyword (`test`, `test end`, `step`, `test ignore start`,
   `test ignore end`), and hands the remainder to the existing `parseObject` (JSON/YAML/XML-attrs,
   unchanged). The wrapper syntax is already gone by this point — the backend stripped it when it
   built the node.

The migrated DITA config declares its statement locations like this:

```jsonc
"inlineStatements": {
  "in": [
    // 1. Any comment node. So `<!-- step {"screenshot": true} -->` works:
    //    the XML backend yields a comment node whose text is `step {"screenshot": true}`,
    //    the parser sees keyword `step`, and parseObject gets `{"screenshot": true}`.
    "comment",

    // 2. Any <data name="doc-detective" .../> element. The statement text isn't the
    //    element's content here — it's in its `value` attribute, so `value`
    //    points at it: <data name="doc-detective" value='step {"wait": 1000}'/> reads
    //    attributes.value, sees keyword `step`, payload `{"wait": 1000}`.
    { "element": { "tag": "data", "attributes": { "name": "doc-detective" } },
      "value": "attributes.value" }
  ]
}
```

(`value` defaults to the node's own text/content; you only set it when the statement lives in an
attribute, as with DITA `<data>`.)

Markdown collapses to just `"in": ["comment"]` because the backend normalizes `<!-- -->` and all
three `[comment]: #` quote variants into identical comment nodes — 8 testStart regexes become
zero. And because comment nodes structurally can't occur inside code fences, the
comment-in-code-block false-positive class disappears. Regex `inlineStatements` continue to work
unchanged for custom/legacy fileTypes — including DITA's `<?doc-detective …?>`
processing-instruction statements, which stay on the legacy regex path only (rarely used, slated
for deprecation; the new selector surface deliberately has no PI kind).

Detection pipeline change is additive: selector matches and regex matches both produce positioned
statements feeding the existing sorted state machine, `contentHash` IDs, and `step_v3`/`test_v3`
validation — unchanged downstream.

### Backends

| Format | Backend | Notes |
|---|---|---|
| Markdown | `remark-parse` + `remark-gfm` (mdast) | Offsets on every node; `<!-- -->` = `html` nodes; `[comment]: #` = definition nodes |
| MDX | `micromark-extension-mdxjs` + `mdast-util-mdx` on the shared walker | `{/* */}` = expression comments; JSX components = elements; IAL spans (never valid JS) are blanked length-preservingly before the parse |
| HTML | `parse5` (direct, `sourceCodeLocationInfo`) | Comment nodes + exact offsets; raw attribute names (hast's property normalization avoided) |
| DITA/XML | `@rgrove/parse-xml` (`includeOffsets`, `preserveComments`) | Pure JS, positions + comments; replaces `parseXmlAttributes` guards with a real parser. NOT fast-xml-parser (no positions) |
| AsciiDoc | new line-aware scanner in-repo | Implements exactly the selector kinds the built-in needs — no more |
| Unknown | none | Regex path only, unchanged |

All pure JS and browser-safe — `src/common` keeps browser compatibility (deps stay
bundler-friendly ESM).

**Backend selection is automatic — there is no `parser` config field.** A built-in
extension→backend map resolves the backend per file: `md`/`markdown`/`mdown`/`mkd`/`mkdn` →
markdown; `mdx` → mdx; `html`/`htm`/`xhtml` → html; `dita`/`ditamap`/`xml` → xml;
`adoc`/`asciidoc`/`asc` → asciidoc (extension lists broadened to be inclusive; extending the map
is a data change, not a code change). Resolution is per-file, so a custom fileType spanning
`["md", "mdx"]` gets the right backend for each file. Files with no mapped extension fall back to
the existing content sniffing (`detectFileTypeFromContent`, `src/common/src/fileTypes.ts`) to pick
a backend; if none resolves, the file is regex-only — and config validation warns when a fileType
declares selector-based markup but none of its extensions map to a backend.

### Maximal examples by format

Each example pairs a source document exercising every detection path for that format with the
selector-based fileType config. The built-in migrations must reproduce today's regex behavior
(parity); blocks marked *custom* show surface the new engine enables beyond current built-ins.

#### Markdown (built-in `markdown_1_0` migrated)

Source:

`````markdown
<!-- test {"testId": "search-flow", "detectSteps": true} -->

Go to [Google](https://www.google.com) and click **Search**.

See the [API reference](https://example.com/api "docs") for details.

Type "kittens" in the search bar. Press "Enter".

![Search results](results.png){: #results .screenshot width="800" }

<!-- step {"wait": 2000} -->

```bash
curl https://example.com/health
```

```js testIgnore
console.log("not executed");
```

```http
POST https://api.example.com/v1/search HTTP/1.1
Content-Type: application/json

{"query": "kittens"}
```

<!-- test ignore start -->
This [link](https://example.com/broken) is not tested.
<!-- test ignore end -->

[comment]: # (step {"screenshot": true})
[comment]: # 'step {"find": "Results"}'
[comment]: # "step {\"click\": \"Next\"}"

<!-- test end -->
`````

Config:

```jsonc
{
  "name": "markdown",
  "extensions": ["md", "markdown", "mdown", "mkd", "mkdn"],   // backend inferred from extensions
  "inlineStatements": { "in": ["comment"] },   // <!-- --> and all [comment]: # quote variants normalize to one node
  "markup": [
    { "name": "checkHyperlink",
      "link": { "url": "^https?://" },
      "captures": ["url"], "actions": ["checkLink"] },
    { "name": "goToUrl",
      "link": { "url": "^https?://",
        "precededBy": "\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\s*$" },
      "captures": ["url"], "actions": ["goTo"] },
    { "name": "clickOnscreenText",
      "strong": { "precededBy": "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\s*$" },
      "captures": ["text"], "actions": ["click"] },
    { "name": "findOnscreenText",
      "strong": {},
      "captures": ["text"], "actions": ["find"] },
    { "name": "screenshotImage",
      "image": { "attributes": { "class": "screenshot" } },   // matches {.screenshot} and {: .screenshot …} IALs
      "captures": ["src"], "actions": ["screenshot"] },
    { "name": "typeText",
      "text": { "matches": "\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+\"([^\"]+)\"" },
      "captures": ["match.1"], "actions": ["type"] },
    { "name": "httpRequestFormat",
      "codeBlock": { "language": ["http", ""],
        "contentMatches": "^([A-Z]+)\\s+(\\S+)(?:\\s+HTTP/[\\d.]+)?\\r?\\n((?:\\S+:\\s+\\S+\\r?\\n)*)?(?:\\s*([\\s\\S]*))?$" },
      "captures": ["match.1", "match.2", "match.3", "match.4"],
      "actions": [{ "httpRequest": { "method": "$1", "url": "$2",
        "request": { "headers": "$3", "body": "$4" } } }] },
    { "name": "runCode",
      "codeBlock": { "language": ["bash", "python", "py", "javascript", "js"],
        "metaExcludes": "testIgnore" },
      "captures": ["language", "content"],
      "actions": [{ "unsafe": true, "runCode": { "language": "$1", "code": "$2" } }] }
  ]
}
```

*Custom* addition showing non-class IAL attributes (the built-in only needs `class`, but every IAL
attribute is matchable/capturable):

```jsonc
{ "name": "screenshotToPath",
  "image": { "attributes": { "class": "screenshot", "path": true } },   // ![x](a.png){: .screenshot path="shots/a.png"}
  "captures": ["src", "attributes.path"],
  "actions": [{ "screenshot": "$2" }] }
```

Structure wins over today's hacks: `link` can't match images (separate node kind — the `(?<!\!)`
lookbehind dies), `strong`/`text` never exist inside code fences (bold/typeText false positives
die), the three `[comment]: #` quote variants collapse into one normalized comment node, and IAL
matching stops being a lookahead inside a brace-blob regex — `{: #results .screenshot width="800" }`
parses into `id`/`class`/`width` fields.

#### MDX (new built-in `mdx_1_0`, split from markdown)

Source:

`````mdx
{/* test {"testId": "mdx-flow"} */}

import { Callout } from "@site/components";

Click **Run**, then go to [the console](https://console.example.com).

<Button label="Save" />

![Console dashboard](console.png){: .screenshot }

export const region = "us-east-1";

{/* step {"click": "Save"} */}

```bash
aws s3 ls --region us-east-1
```

{/* test ignore start */}
[Broken link](https://example.com/broken)
{/* test ignore end */}

{/* test end */}
`````

Config:

```jsonc
{
  "name": "mdx",
  "extends": "markdown",          // inherits all markdown selectors above
  "extensions": ["mdx"],          // → mdx backend: {/* */} = expression nodes; <!-- --> is an MDX syntax error
  "markup": [
    { "name": "clickNamedButton",   // custom: JSX components addressable as elements
      "element": { "tag": "Button", "attributes": { "label": true } },
      "captures": ["attributes.label"], "actions": ["click"] }
  ]
}
```

Today `.mdx` is lumped into the markdown fileType and parsed with markdown regexes; the split
gives it a real grammar (ESM/JSX statements, expression comments). Kramdown/Pandoc-style IALs on
markdown constructs parse in MDX exactly as in markdown (the inherited `screenshotImage` matches
the image above), and JSX attributes surface on `element` nodes.

#### HTML (built-in `html_1_0` migrated + custom)

Source:

```html
<!-- test {"testId": "signup"} -->
<p>Go to <a href="https://app.example.com/signup">the signup page</a> and click <strong>Create account</strong>.</p>
<p>Type "jane@example.com" in the email field.</p>
<img src="signup.png" class="screenshot" alt="Signup form" />
<pre><code class="language-bash">curl https://app.example.com/api/health</code></pre>
<!-- step {"find": "Welcome"} -->
<!-- test ignore start -->
<a href="https://example.com/broken">untested</a>
<!-- test ignore end -->
<!-- test end -->
```

Config — the built-in migration is statements-only (today's `html_1_0` has `markup: []`, and
parity keeps it that way):

```jsonc
{
  "name": "html",
  "extensions": ["html", "htm", "xhtml"],
  "inlineStatements": { "in": ["comment"] }
}
```

*Custom* extension showing what the backend enables:

```jsonc
{
  "name": "html-rich",
  "extends": "html",
  "markup": [
    { "name": "checkHyperlink",
      "link": { "url": "^https?://" },                       // <a href>
      "captures": ["url"], "actions": ["checkLink"] },
    { "name": "clickOnscreenText",
      "strong": { "precededBy": "\\b(?:[Cc]lick|[Ss]elect|[Cc]hoose)\\s*$" },
      "captures": ["text"], "actions": ["click"] },
    { "name": "typeText",
      "text": { "matches": "\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+\"([^\"]+)\"" },
      "captures": ["match.1"], "actions": ["type"] },
    { "name": "screenshotImage",
      "image": { "attributes": { "class": "screenshot" } },
      "captures": ["src"], "actions": ["screenshot"] },
    { "name": "runCode",
      "codeBlock": { "language": ["bash", "js"] },           // <pre><code class="language-x">
      "captures": ["language", "content"],
      "actions": [{ "unsafe": true, "runCode": { "language": "$1", "code": "$2" } }] },
    { "name": "clickTestIdElement",
      "element": { "tag": "button", "attributes": { "data-testid": true } },
      "captures": ["attributes.data-testid"], "actions": ["click"] }
  ]
}
```

#### DITA/XML (built-in `dita_1_0` migrated)

Source — both statement channels (comment, `<data>`) plus every markup element:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE task PUBLIC "-//OASIS//DTD DITA Task//EN" "task.dtd">
<task id="search-task">
  <title>Search for kittens</title>
  <taskbody>
    <!-- test {"testId": "dita-search"} -->
    <steps>
      <step><cmd>Go to <xref href="https://www.google.com" scope="external">Google</xref>.</cmd></step>
      <step><cmd>See also <xref href="https://example.com/docs">the docs</xref> and <link href="https://example.com/api"/>.</cmd></step>
      <step><cmd>Click the <uicontrol>Search</uicontrol> field.</cmd></step>
      <step><cmd>Type <userinput>kittens</userinput> into the <uicontrol>Search</uicontrol> field.</cmd></step>
      <step><cmd>Press "Enter".</cmd></step>
      <step><cmd>Confirm the <wintitle>Results</wintitle> window shows <b>kittens</b>.</cmd></step>
      <!-- step {"screenshot": true} -->
      <step><cmd><data name="doc-detective" value='step {"wait": 1000}'/>Wait for results.</cmd></step>
    </steps>
    <!-- test ignore start -->
    <p><xref href="https://example.com/broken">untested</xref></p>
    <!-- test ignore end -->
    <!-- test end -->
  </taskbody>
</task>
```

Config:

```jsonc
{
  "name": "dita",
  "extensions": ["dita", "ditamap", "xml"],
  "inlineStatements": { "in": [
    "comment",
    { "element": { "tag": "data", "attributes": { "name": "doc-detective" } },
      "value": "attributes.value" }
  ]},
  "markup": [
    { "name": "clickUiControl",
      "element": { "tag": "uicontrol",
        "precededBy": "(?:[Cc]lick|[Tt]ap|[Ss]elect|[Pp]ress|[Cc]hoose)\\s+(?:the\\s+)?$" },
      "captures": ["content"], "actions": ["click"] },
    { "name": "typeIntoUiControl",   // sequence pattern via chained selector
      "element": { "tag": "userinput",
        "precededBy": "\\b(?:[Tt]ype|[Ee]nter|[Ii]nput)\\s*$",
        "followedBy": { "text": "^\\s+(?:in|into)(?:\\s+the)?\\s*$",
                        "then": { "element": { "tag": "uicontrol" } } } },
      "captures": ["content", "then.content"],
      "actions": [{ "type": { "keys": "$1", "selector": "$2" } }] },
    { "name": "navigateToXref",
      "element": { "tag": "xref", "attributes": { "href": "^https?://" },
        "precededBy": "\\b(?:[Nn]avigate\\s+to|[Oo]pen|[Gg]o\\s+to|[Vv]isit|[Bb]rowse\\s+to)\\s*$" },
      "captures": ["attributes.href"], "actions": ["goTo"] },
    { "name": "findUiControl",
      "element": "uicontrol",          // scalar shorthand ≡ {"tag": "uicontrol"}
      "captures": ["content"], "actions": ["find"] },
    { "name": "verifyWindowTitle",
      "element": "wintitle",
      "captures": ["content"], "actions": ["find"] },
    { "name": "checkExternalXref",   // one selector replaces two attribute-order regex variants
      "element": { "tag": "xref",
        "attributes": { "scope": "external", "href": "^https?://" } },
      "captures": ["attributes.href"], "actions": ["checkLink"] },
    { "name": "checkHyperlink",
      "element": { "tag": "xref", "attributes": { "href": "^https?://" } },
      "captures": ["attributes.href"], "actions": ["checkLink"] },
    { "name": "checkLinkElement",
      "element": { "tag": "link", "attributes": { "href": "^https?://" } },
      "captures": ["attributes.href"], "actions": ["checkLink"] },
    { "name": "clickOnscreenText",
      "strong": { "precededBy": "\\b(?:[Cc]lick|[Tt]ap|[Ll]eft-click|[Cc]hoose|[Ss]elect|[Cc]heck)\\s*$" },
      "captures": ["text"], "actions": ["click"] },
    { "name": "findOnscreenText",
      "strong": {},
      "captures": ["text"], "actions": ["find"] },
    { "name": "goToUrl",
      "element": { "tag": "xref", "attributes": { "href": "^https?://" },
        "precededBy": "\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\s*$" },
      "captures": ["attributes.href"], "actions": ["goTo"] },
    { "name": "typeText",
      "text": { "matches": "\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+\"([^\"]+)\"" },
      "captures": ["match.1"], "actions": ["type"] }
  ]
}
```

The 7-variant `<data>` statement regexes (quote × attribute-order permutations) become one
declarative container; entity decoding (`&quot;` etc.) is the parser's job, retiring
`parseObject`'s decode-order caveats for this path.

Parity note: the migrated built-in additionally retains today's `<?doc-detective …?>`
processing-instruction regexes in its legacy `inlineStatements` (regex and selector statement
sources coexist within one fileType) so existing PI users don't break — documented as deprecated,
with removal targeted at a future major.

#### AsciiDoc (built-in `asciidoc_1_0` migrated + custom)

Source:

```asciidoc
= Search guide

// (test {"testId": "adoc-search"})

Go to https://duckduckgo.com[DuckDuckGo] and click *Search*.

Type "kittens" in the search field.

// (step {"screenshot": true})

[source,bash]
----
curl https://example.com/health
----

image::results.png[Search results, role=screenshot]

// (test ignore start)
This https://example.com/broken[link] is not tested.
// (test ignore end)

////
Block comments are also comment nodes; statements inside them are recognized too.
////

// (test end)
```

Config — built-in migration is statements-only (today's `asciidoc_1_0` has `markup: []`):

```jsonc
{
  "name": "asciidoc",
  "extensions": ["adoc", "asciidoc", "asc"],  // → asciidoc backend (in-repo line scanner, not asciidoctor.js)
  "inlineStatements": { "in": ["comment"] }   // // (test …) keyword grammar unchanged
}
```

*Custom* extension showing what the scanner's vocabulary enables:

```jsonc
{
  "name": "asciidoc-rich",
  "extends": "asciidoc",
  "markup": [
    { "name": "checkHyperlink",
      "link": { "url": "^https?://" },
      "captures": ["url"], "actions": ["checkLink"] },
    { "name": "goToUrl",
      "link": { "url": "^https?://",
        "precededBy": "\\b(?:[Gg]o\\s+to|[Oo]pen|[Vv]isit)\\s*$" },
      "captures": ["url"], "actions": ["goTo"] },
    { "name": "clickOnscreenText",
      "strong": { "precededBy": "\\b(?:[Cc]lick|[Ss]elect|[Cc]hoose)\\s*$" },
      "captures": ["text"], "actions": ["click"] },
    { "name": "typeText",
      "text": { "matches": "\\b(?:[Pp]ress|[Ee]nter|[Tt]ype)\\b\\s+\"([^\"]+)\"" },
      "captures": ["match.1"], "actions": ["type"] },
    { "name": "screenshotImage",
      "image": { "attributes": { "role": "screenshot" } },
      "captures": ["src"], "actions": ["screenshot"] },
    { "name": "runCode",
      "codeBlock": { "language": ["bash", "python", "js"] },
      "captures": ["language", "content"],
      "actions": [{ "unsafe": true, "runCode": { "language": "$1", "code": "$2" } }] }
  ]
}
```

The scanner implements exactly the standard vocabulary (`comment`, `codeBlock`, `link`, `image`,
`strong`, `emphasis`, `text`) and nothing more — no tables, includes, or conditionals.

#### Unchanged paths

JSON/YAML spec files, executable fileTypes (`runShell`, e.g. `.ipynb` via nbconvert),
unknown-extension regex-only fileTypes, and the `dita` CLI ditamap shell-out all keep their
existing behavior.

### Structural fixes riding along

- Single source of truth for default fileTypes: defined once in `src/common/src/fileTypes.ts`,
  imported by `src/core/config.ts` (delete the duplicate table).
- LSP (`src/lsp/inline.ts`, `src/lsp/diagnostics.ts`) rebuilt on the same backend extraction —
  runtime and editor diagnostics can't drift.
- Fix `extends` enum excluding `dita` (`config_v3.schema.json`).
- v2→v3 delimiter converter (`src/common/src/validate.ts`) untouched — emits regex, regex is
  co-equal.
- Old `ast` branch (`doc-detective-common/ast`, commit `6f5bc9bc`): mine its ~4k lines of
  tests/expected outputs as a corpus; do NOT port its `astNodeMatch` implementation (ruled out) —
  monorepo `detectTests.ts` has diverged anyway.

## Phasing (one PR per phase; red→green TDD; ADR + fixtures + docs per repo rules)

1. **Foundation** — ADR 01082; `require(esm)` smoke check from compiled CJS; selector shapes in
   `config_v3.schema.json` (flattened single property table, `anyOf` regex | `oneOf` kind,
   strict per-kind option objects); this design doc.
2. **Markdown backend + selector engine** — `src/common/src/detect/` module (backend interface,
   selector matcher, statement parser, IAL normalizer: mdast doesn't parse Kramdown/Pandoc
   attribute lists natively, so a post-pass parses trailing `{: …}`/`{…}` spans into
   `attributes.*`); wire into `parseContent`; migrate `markdown_1_0`; permanent legacy-vs-selector
   **parity harness** over all fixtures.
3. **MDX backend** — new `mdx_1_0` built-in; remove `mdx` from markdown extensions.
4. **HTML backend** — rehype-parse; migrate `html_1_0`.
5. **DITA/XML backend** — parse-xml; migrate `dita_1_0`; fix `extends`/dita schema asymmetry.
6. **AsciiDoc line-scanner backend** — migrate `asciidoc_1_0`.
7. **LSP unification** — shared backend extraction; delete parallel scanning.
8. **Fixtures + docs** — new `detection/` fixture group wired into a fixtures.yml bundle; selector
   vocabulary reference; IA map updates.

## Verification

- Per phase: `npm test` (mocha root + `test:common`), coverage ratchet green.
- Parity harness (phase 2+) is the core guarantee: legacy-vs-selector spec diff over all fixtures,
  byte-identical steps except enumerated intentional fixes.
- End-to-end: `node ./bin/doc-detective.js runTests --input <fixture>` against
  markdown/MDX/HTML/DITA/adoc fixtures; detected spec output matches pre-change runs.
- Fixture CI group must land all PASS/SKIPPED.
- LSP: existing LSP tests + manual diagnostics smoke on a fixture doc.

## Risks

- **ESM interop**: `require(esm)` on Node ≥22.12 is expected to just work for the unified stack;
  phase 1 smoke-verifies it from the actual compiled CJS output. Fallback: esbuild-bundle that
  subtree (not preferred).
- **Parity is make-or-break** — identical specs on well-formed docs keeps user test IDs stable;
  harness stays in the suite permanently.
- **AsciiDoc scanner scope creep** — implement exactly the standard selector vocabulary and stop.
- **Chained selectors (`followedBy.then`)** — needed only for DITA's `typeIntoUiControl` parity;
  if it proves gnarly in phase 5, that one definition can stay regex (co-equal) without blocking
  anything.
