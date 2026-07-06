---
status: accepted
date: 2026-07-06
decision-makers: [hawkeyexl]
---

# Escape MDX expression syntax in generated schema reference pages

## Context and Problem Statement

The schema reference pages under `docs/fern/pages/reference/schemas/` are generated from the
doc-detective-common JSON schemas by `docs/.scripts/buildSchemaReferencesV4.js` and rendered by
Fern, which parses them as MDX. In MDX, an unescaped `{` in plain text starts a JSX expression
that must parse as JavaScript. Several schema descriptions legitimately contain brace-bearing
prose — e.g. the `surface` fields' `App surfaces use the object form ({ "app": … }).` — which the
generator copied verbatim into table cells. `{ "app": … }` is not a valid JS expression, so
`fern generate --docs --preview` failed on five pages with `Could not parse expression with
acorn`, and every docs PR got the "⚠️ Failed to generate docs preview" comment instead of a
preview URL.

How should the pipeline make generated pages MDX-safe without distorting schema prose or
constraining what schema authors may write in descriptions?

## Decision Drivers

- Docs previews and publishes must never be broken by valid, useful schema description text.
- Schema descriptions are the single source of truth; the fix must not require rewording them or
  banning braces in schema prose.
- Braces inside inline code spans (e.g. `` `stopRecord: { name: "<name>" }` ``) are literal in
  MDX and must stay untouched.
- The failure mode is silent until a Fern run: the repo needs a guard that catches a regression at
  PR time without invoking Fern.

## Considered Options

1. Escape `{`/`}` outside code spans in the generator, and add a mocha test that fails on
   unescaped braces in the generated pages.
2. Reword the offending schema descriptions to avoid braces (or wrap every brace in backticks).
3. Upgrade the pinned Fern CLI (4.15.1 → 5.x) hoping for laxer MDX parsing.

## Decision Outcome

Chosen option: **Option 1 — escape in the generator, enforce with a test**, because it fixes the
class of failure (any brace in any current or future description) at the single point where schema
prose becomes MDX, keeps schema descriptions natural, and adds a cheap PR-time guard.

The generator gains `escapeMdxTextExpressions()`, which splits text on inline code spans (single
and double backtick) and escapes `{`/`}` as `\{`/`\}` only in the non-code segments. It is applied
to property descriptions (table cells) and page-intro descriptions. `\{` renders as a literal `{`
in MDX, so published pages read exactly as the schema author wrote them.

### Consequences

- Good: docs previews/publishes no longer fail when schema descriptions mention JSON-ish shapes.
- Good: `test/docs-schema-refs.test.js` fails any PR that reintroduces unescaped braces (via a
  generator change or a hand-edit), without needing Fern or network access in CI.
- Neutral: generated `.md` sources contain `\{`/`\}`; readers of the raw files see the escapes.
- Neutral: the generator script is now requirable as a module (`main()` runs only when executed
  directly) so the helper is unit-testable.
- Bad: the escaping heuristic parses code spans with a regex, not a full CommonMark parser;
  pathological descriptions (unbalanced backticks) would be over-escaped — which is safe (extra
  literal braces) rather than build-breaking.

### Confirmation

- `npx mocha --exit test/docs-schema-refs.test.js` — unit tests for the helper plus a scan of all
  generated pages for unescaped braces.
- All 166 pages under `docs/fern/pages/` compile with `@mdx-js/mdx` (the same parser family Fern
  uses); before the fix, exactly the five affected pages failed with the acorn error.
- The existing `docs-schema-refs.yml` drift check confirms the committed pages match the
  generator's output.

## Pros and Cons of the Options

### Option 1: Escape in the generator + test guard

- Good: one fix covers all current and future descriptions; no constraint on schema authors.
- Good: deterministic, testable without Fern.
- Bad: adds a small amount of escaping logic to maintain.

### Option 2: Reword schema descriptions

- Good: no generator change.
- Bad: distorts the source-of-truth prose everywhere it is consumed (editor tooltips, validation
  errors), and every future description becomes a docs-build landmine.

### Option 3: Upgrade Fern CLI

- Bad: MDX's expression syntax is spec-level, not a Fern bug — `{ "app": … }` is invalid in any
  MDX parser, so an upgrade would not fix it (verified: the same failure reproduces with
  `@mdx-js/mdx` v3 directly).
- Neutral: a Fern upgrade may still be worthwhile, but as its own change, decoupled from this fix.
