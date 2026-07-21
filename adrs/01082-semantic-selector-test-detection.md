---
status: accepted
date: 2026-07-21
decision-makers: doc-detective maintainers
---

# Structure-aware test detection via semantic selectors, co-equal with regex

## Context and Problem Statement

Test detection in documentation source files is 100% regex today: `fileTypes[].markup[].regex`
and `inlineStatements` patterns run over raw file text and feed an offset-sorted state machine
(`src/common/src/detectTests.ts`). The cost shows up as a persistent class of defects and hacks:
image negative-lookbehinds, `testIgnore` lookaheads, non-greedy bold matching, comment-in-code-fence
false positives, HTML-entity decode-order workarounds in `parseObject`, prototype-pollution guards
in `parseXmlAttributes`, a ReDoS guard (`safeRegExp`), 8 `testStart` regex variants for markdown
comment wrappers and 7 `step` variants for DITA quote/attribute-order permutations, duplicated
default tables (`src/common/src/fileTypes.ts` vs `src/core/config.ts`), and a third divergent
detection implementation in the LSP (`src/lsp/inline.ts`).

Two prior AST prototypes (Dec 2025 draft PR in the transitional `.github` workspace; Feb 2026
`doc-detective-common/ast` branch) implemented a raw `astNodeMatch` node-matcher surface
(nodeType/attributes/children/extract against mdast/hast/XML node shapes). Both were orphaned by
the monorepo migration, not rejected on merit.

How should detection become structure-aware, and what configuration surface should users get for
specifying where tests live in each file type?

## Decision Drivers

* **Intuitive but powerful config.** Doc writers should express "code fences with language bash",
  "images with class screenshot", "comments" — not raw AST node queries or hand-tuned regexes.
* **Zero forced migration.** Existing regex `fileTypes` configs (and the v2→v3 delimiter
  conversion path) must keep working unchanged, indefinitely.
* **Stable test IDs.** Built-in definitions migrating to the new engine must produce identical
  steps on well-formed docs so `contentHash`-derived IDs don't churn.
* **Source-position fidelity.** Detected statements must carry exact offsets to preserve the
  existing `sortIndex` ordering contract and power editor diagnostics.
* **Browser compatibility of `src/common`** (pure-JS, bundler-friendly deps only) and the CJS
  build (Node ≥22.12 `require(esm)` makes the ESM-only unified stack consumable).
* Prior-art convergence: Vale, markdownlint, Bluehawk, and pytest-codeblocks all expose
  comment-delimiter, fence-info-string, and directive primitives — none expose raw AST queries.

## Considered Options

* **A. Semantic selectors, kind-as-key, co-equal with regex** (chosen).
* **B. Raw AST node matchers** — revive the prior `astNodeMatch` design as the user surface.
* **C. Layered** — semantic selectors compiling down to an exposed raw node-matcher escape hatch.
* **D. Regex-only improvements** — keep the engine, add more guards and pattern variants.

## Decision Outcome

Chosen option: **A**, because it matches the "intuitive but powerful" driver directly: the
semantic vocabulary covers every built-in pattern that exists today, regex remains the escape
hatch for anything exotic (satisfying B/C's power argument without asking doc writers to learn
per-format AST shapes), and D leaves every structural defect class in place.

Mechanism:

1. **Format backends** parse a source file into a flat, offset-ordered list of positioned
   semantic nodes — `comment`, `codeBlock`, `link`, `image`, `strong`, `emphasis`, `text`,
   `element` — each carrying exact start/end offsets and named fields (`content`, `text`,
   `language`, `meta`, `url`, `alt`, `src`, `tag`, `attributes.*`). Backends: remark-parse+GFM
   (markdown), remark-mdx (MDX), rehype-parse (HTML), @rgrove/parse-xml (DITA/XML), and an
   in-repo line-aware scanner for AsciiDoc (asciidoctor.js discards comments pre-parse and is
   Opal-heavy; tree-sitter-asciidoc is the designated future upgrade). Backend selection is
   automatic per file via an extension→backend map plus existing content sniffing — there is no
   `parser` config field.
2. **Selector markup definitions**: `markupDefinition` keeps one shared property table (`name`,
   `regex`, eight kind keys, `captures`, `actions`, `batchMatches`) constrained by `anyOf`:
   `required: ["regex"]` | `oneOf` over the kind keys — **modeled on the step schema, the kind IS
   the key** (`{"codeBlock": {…}}` like `{"goTo": …}`). Kind option objects are
   `additionalProperties: false` with scalar shorthands; the single property table exists because
   the dereferencing schema build would otherwise duplicate the embedded step schema per branch
   (+39 MB measured on `schemas.json` vs +9 MB flattened). `captures` maps named node fields
   (`url`, `content`, `attributes.<name>`, `match.<n>`, `then.<field>`) to `$1..$n`, preserving
   the action-substitution contract. Scoped regex refinements
   (`matches`/`contentMatches`/`precededBy`/`followedBy`, incl. `followedBy.then` chaining for
   sequence patterns) replace guard-hack lookarounds.
3. **Inline statements**: `inlineStatements.in` declares statement *containers* (comment nodes,
   or attribute-bearing elements via `value` field paths); one shared keyword parser feeds the
   existing `parseObject`. Markdown/MDX attribute lists (Kramdown IAL / Pandoc spans) are parsed
   into `attributes.*` by a backend post-pass. DITA `<?doc-detective?>` PI statements stay on the
   legacy regex path only, documented as deprecated.
4. **Pipeline is additive**: selector and regex matches both emit positioned statements into the
   existing sorted state machine, `contentHash` IDs, and `step_v3`/`test_v3` validation. Backend
   parse failure degrades that file to regex-only detection.
5. **Built-ins migrate** to selectors (markdown, new mdx, html, dita, asciidoc); a permanent
   legacy-vs-selector parity harness over all fixtures guards ID stability, with intentional
   divergences (fixed false positives, MDX comment semantics) enumerated per phase.

### Consequences

* Good, because the structural false-positive classes (comments in code fences, image-vs-link,
  bold spanning `**` pairs, quote/attribute-order variants) become unrepresentable rather than
  guarded against.
* Good, because one selector vocabulary spans five formats, and the LSP can consume the same
  backend extraction, ending the three-way implementation drift.
* Good, because regex co-equality means no config migration, no breaking release, and an escape
  hatch for patterns the vocabulary doesn't cover.
* Bad, because detection gains parser dependencies (remark/rehype/parse-xml ecosystems) with an
  ESM-interop obligation on the CJS build, and an in-repo AsciiDoc scanner to maintain.
* Bad, because two detection engines coexist indefinitely — the parity harness is permanent test
  surface, and behavior questions must be answered for both paths.
* Neutral, because MDX splits from markdown (real grammar, `{/* */}` comments, JSX elements) —
  a documented behavior divergence for `.mdx` files that previously parsed as markdown-with-regexes.

### Confirmation

Phase-gated: schema positive/negative cases in `src/common/test/validate.test.js`; per-backend
unit suites in `src/common/test/`; the permanent parity harness diffing legacy-regex vs selector
detection over every fixture in `src/common/test/fixtures/`; existing `detectTests.test.js` staying
green with the coverage ratchet; end-to-end `detection/` feature fixtures in `test/core-artifacts/`
run by the fixtures CI gate (PASS/SKIPPED only). Full design, per-format maximal examples, and
phasing: [docs/design/ast-detection.md](../docs/design/ast-detection.md).

## Pros and Cons of the Options

### A. Semantic selectors, kind-as-key, co-equal with regex

* Good, because config reads as intent ("codeBlock with language bash") and the schema constrains
  each kind to its valid options — typos fail validation instead of silently matching nothing.
* Good, because it preserves every existing contract (`$n` captures, `actions`, `batchMatches`,
  offset ordering, IDs).
* Neutral, because sequence patterns need `followedBy.then` chaining — bounded complexity, needed
  once (DITA `typeIntoUiControl`), with regex fallback available.
* Bad, because the vocabulary is a curated set; genuinely novel constructs wait for a vocabulary
  addition or use regex.

### B. Raw AST node matchers

* Good, because maximum expressive power over any parseable construct.
* Bad, because users must learn mdast/hast/XML node taxonomies per format — the opposite of
  intuitive, and contradicted by every comparable tool's surface.
* Bad, because it couples user configs to parser-internal AST shapes, making parser swaps
  (e.g. AsciiDoc scanner → tree-sitter) breaking changes.

### C. Layered (selectors + raw escape hatch)

* Good, because power users get structure without regex.
* Bad, because it ships and must forever support two new surfaces instead of one; regex already
  serves as the escape hatch, so the raw layer's marginal value doesn't cover its schema, docs,
  and compatibility cost.

### D. Regex-only improvements

* Good, because no new dependencies or engines.
* Bad, because every structural defect class remains; guards keep accreting; the three-way
  implementation drift (common/core/LSP) stays unsolved.
