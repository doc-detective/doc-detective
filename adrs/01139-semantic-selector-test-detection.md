---
status: accepted
date: 2026-07-21
decision-makers: doc-detective maintainers
---

# Structure-aware test detection via semantic selectors, co-equal with regex

## Context and Problem Statement

Test detection in documentation source files is 100% regex today: `fileTypes[].markup[].regex`
and `inlineStatements` patterns run over raw file text and feed an offset-sorted state machine
(`src/common/src/detectTests.ts`). The cost shows up as a persistent class of defects and hacks.
The patterns need image negative-lookbehinds, `testIgnore` lookaheads, and non-greedy bold
matching, and comments inside code fences produce false positives. The code needs HTML-entity
decode-order workarounds in `parseObject`, prototype-pollution guards in `parseXmlAttributes`, and
a ReDoS guard (`safeRegExp`). Markdown comment wrappers need 8 `testStart` regex variants, and DITA
quote/attribute-order permutations need 7 `step` variants. The default tables are duplicated
(`src/common/src/fileTypes.ts` vs `src/core/config.ts`), and the LSP has a third divergent
detection implementation (`src/lsp/inline.ts`).

Two prior AST prototypes implemented a raw `astNodeMatch` node-matcher surface
(nodeType/attributes/children/extract against mdast/hast/XML node shapes). One was a Dec 2025
draft PR in the transitional `.github` workspace, and the other was the Feb 2026
`doc-detective-common/ast` branch. Both were orphaned by the monorepo migration, not rejected on
merit.

How should detection become structure-aware, and what configuration surface should users get for
specifying where tests live in each file type?

## Decision Drivers

* **Intuitive but powerful config.** Doc writers should express "code fences with language bash",
  "images with class screenshot", and "comments". They shouldn't have to write raw AST node
  queries or hand-tuned regexes.
* **No behavior change on upgrade.** Every existing config, including one that relies on the
  built-in defaults, must detect exactly the tests and steps it detected before. That holds even
  where raw-text matching finds statements a structural parse wouldn't (inside code blocks,
  lazy continuation lines, `.mdx` files with HTML comments). Every config that validates today must
  keep validating. Identical steps also keep `contentHash`-derived test IDs stable.
* **Zero forced migration.** Existing regex `fileTypes` configs (and the v2→v3 delimiter
  conversion path) must keep working unchanged, indefinitely.
* **Source-position fidelity.** Detected statements must carry exact offsets to preserve the
  existing `sortIndex` ordering contract and power editor diagnostics.
* **Browser compatibility of `src/common`** (pure-JS, bundler-friendly deps only) and the CJS
  build (Node ≥22.12 `require(esm)` makes the ESM-only unified stack consumable).
* Prior-art convergence: Vale, markdownlint, Bluehawk, and pytest-codeblocks all expose
  comment-delimiter, fence-info-string, and directive primitives. None expose raw AST queries.

## Considered Options

* **A. Semantic selectors, kind-as-key, co-equal with regex** (chosen).
* **B. Raw AST node matchers**: revive the prior `astNodeMatch` design as the user surface.
* **C. Layered**: semantic selectors compiling down to an exposed raw node-matcher escape hatch.
* **D. Regex-only improvements**: keep the engine, add more guards and pattern variants.

## Decision Outcome

Chosen option: **A**, because it matches the "intuitive but powerful" driver directly. The
semantic vocabulary covers every built-in pattern that exists today. Regex remains the escape
hatch for anything exotic, which satisfies B/C's power argument without asking doc writers to
learn per-format AST shapes. D leaves every structural defect class in place.

Mechanism:

1. **Format backends** parse a source file into a flat, offset-ordered list of positioned
   semantic nodes: `comment`, `codeBlock`, `link`, `image`, `strong`, `emphasis`, `text`, and
   `element`. Each node carries exact start/end offsets and named fields (`content`, `text`,
   `language`, `meta`, `url`, `alt`, `src`, `tag`, `attributes.*`). Backends:
   mdast-util-from-markdown with micromark GFM (markdown), plus micromark-extension-mdxjs (MDX),
   parse5 (HTML), and @rgrove/parse-xml (DITA/XML). AsciiDoc uses an in-repo line-aware scanner
   instead of asciidoctor.js, which discards comments pre-parse and is Opal-heavy. The designated future upgrade is
   tree-sitter-asciidoc. Backend selection is automatic per file via an extension→backend map plus
   existing content sniffing. There is no `parser` config field.
2. **Selector markup definitions**: `markupDefinition` keeps one shared property table (`name`,
   `regex`, eight kind keys, `captures`, `actions`, `batchMatches`). An outer `oneOf` constrains
   it: `required: ["regex"]` | inner `oneOf` over the kind keys. **Modeled on the step
   schema, the kind IS the key** (`{"codeBlock": {…}}` like `{"goTo": …}`). The outer `oneOf`
   makes the modes mutually exclusive: a definition carrying both `regex` and a kind key fails
   validation rather than getting undefined runtime semantics. Kind option objects are
   `additionalProperties: false` with scalar shorthands. The single property table exists because
   the dereferencing schema build would otherwise duplicate the embedded step schema per branch.
   The measured cost was +39 MB on `schemas.json` vs +9 MB flattened. `captures` maps named node fields
   (`url`, `content`, `attributes.<name>`, `match.<n>`, `then.<field>`) to `$1..$n`, preserving
   the action-substitution contract. Scoped regex refinements
   (`matches`/`contentMatches`/`precededBy`/`followedBy`, incl. `followedBy.then` chaining for
   sequence patterns) replace guard-hack lookarounds.
3. **Inline statements**: `inlineStatements.in` declares statement *containers* (comment nodes,
   or attribute-bearing elements via `value` field paths); one shared keyword parser feeds the
   existing `parseObject`. Markdown/MDX attribute lists (Kramdown IAL / Pandoc spans) are parsed
   into `attributes.*` by a backend post-pass. The MDX backend lifts `<!-- -->` comments (a
   syntax error in MDX) out before parsing and surfaces them as comment nodes.
4. **Pipeline is additive**: selector and regex matches both emit positioned statements into the
   existing sorted state machine, `contentHash` IDs, and `step_v3`/`test_v3` validation. Backend
   parse failure degrades that file to regex-only detection. A regex statement that a container
   already produced at the same offset counts once. Regex matches never dedupe each other, so a
   regex-only fileType runs exactly the legacy engine path.
5. **Selectors are opt-in; built-ins don't change.** The `markdown`, `html`, `dita`, and
   `asciidoc` built-ins keep their regex definitions byte for byte, including `markdown` claiming
   `.mdx`, and the `fileTypes` default list stays `markdown`, `asciidoc`, `html`, `dita`. The
   new `mdx` built-in is selector-based and opt-in: listing it ahead of `markdown` routes `.mdx`
   files to it. The runner keeps its historical lowercase-only markdown `typeText` rule as an
   explicit override on the single-sourced table (`src/core/config.ts`). The
   doc-detective-common table stays case-tolerant, so neither surface changes.
6. **Validation stays as lenient as before.** The executable `fileTypes` schema branch keeps
   accepting any object with `extensions`, as every earlier release did, unless the fileType uses
   a selector feature (`inlineStatements.in`, a kind key, or `captures`). Selector definitions get
   strict validation because no existing config can contain them.

### Consequences

* Good, because upgrading changes nothing. The built-ins, the default list, validation, and the
  runner's rules all behave as before, verified against output recorded from the legacy build.
* Good, because for file types that opt in, the structural false-positive classes become
  unrepresentable rather than guarded against. Those classes are comments in code fences,
  image-vs-link, bold spanning `**` pairs, and quote/attribute-order variants.
* Bad, because the built-ins keep those false positives until a future major release chooses to
  move them to selectors. For example, a `<!-- step -->` inside a code fence still runs.
* Good, because one selector vocabulary spans five formats, and the LSP can consume the same
  backend extraction, ending the three-way implementation drift.
* Good, because regex co-equality means no config migration, no breaking release, and an escape
  hatch for patterns the vocabulary doesn't cover.
* Bad, because detection gains parser dependencies (remark/rehype/parse-xml ecosystems) with an
  ESM-interop obligation on the CJS build. It also gains an in-repo AsciiDoc scanner to maintain.
* Bad, because two detection engines coexist indefinitely, and behavior questions must be answered
  for both paths.
* Neutral, because `.mdx` files get a real MDX grammar (`{/* */}` and `<!-- -->` comments, JSX
  elements) only when a config lists `mdx` ahead of `markdown`.

### Confirmation

* `src/common/test/parity.test.js` asserts the four built-ins deep-equal frozen copies of the
  legacy tables.
* `src/common/test/compat.test.js` runs a corpus of edge cases and compares the output against
  `fixtures/compat/expected.json`, recorded from the legacy doc-detective-common build. The corpus
  covers code regions, lazy continuation lines, `{/* */}` in `.md`, `.mdx` with HTML comments,
  attribute prefixes, and entities.
* `validate.test.js` keeps legacy-valid configs valid, and `test/config-coverage.test.js` pins the
  runner's `typeText` rule.
* Per-backend unit suites cover selector mode through opt-in definitions. End-to-end `detection/`
  feature fixtures in `test/core-artifacts/` run through the fixtures CI gate (PASS/SKIPPED only).
* Before merge, the legacy and current builds produced identical specs for every markup file in the
  repository (638 files, 489 with tests).

Full design and per-format maximal examples:
[docs/design/ast-detection.md](../docs/design/ast-detection.md).

## Pros and Cons of the Options

### A. Semantic selectors, kind-as-key, co-equal with regex

* Good, because config reads as intent ("codeBlock with language bash"), and the schema constrains
  each kind to its valid options. Typos fail validation instead of silently matching nothing.
* Good, because it preserves every existing contract (`$n` captures, `actions`, `batchMatches`,
  offset ordering, IDs).
* Neutral, because sequence patterns need `followedBy.then` chaining. The complexity is bounded:
  it's needed once (DITA `typeIntoUiControl`), with regex fallback available.
* Bad, because the vocabulary is a curated set; genuinely novel constructs wait for a vocabulary
  addition or use regex.

### B. Raw AST node matchers

* Good, because maximum expressive power over any parseable construct.
* Bad, because users must learn mdast/hast/XML node taxonomies per format. That's the opposite of
  intuitive, and every comparable tool's surface contradicts it.
* Bad, because it couples user configs to parser-internal AST shapes, making parser swaps
  (e.g. AsciiDoc scanner → tree-sitter) breaking changes.

### C. Layered (selectors + raw escape hatch)

* Good, because power users get structure without regex.
* Bad, because it ships and must forever support two new surfaces instead of one. Regex already
  serves as the escape hatch, so the raw layer's marginal value doesn't cover its schema, docs,
  and compatibility cost.

### D. Regex-only improvements

* Good, because no new dependencies or engines.
* Bad, because every structural defect class remains; guards keep accreting; the three-way
  implementation drift (common/core/LSP) stays unsolved.
