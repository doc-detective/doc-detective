---
status: accepted
date: 2026-11-14
decision-makers: doc-detective maintainers
---

# Static documentation coverage with `doc-detective audit`

## Context and Problem Statement

Doc Detective can't tell a writer which documented instructions no test exercises. `runCoverage`
([ADR 00035](00035-coverage-analysis-feature.md)) did this once and was removed
([ADR 00103](00103-drop-edge-and-remove-coverage-suggest.md)), partly because it was a second analysis
engine that drifted from the runner. [ADR 01146](01146-cli-v5-contract.md) kept the subcommand
namespace free for its replacement, and [docs/design/coverage.md](../docs/design/coverage.md) sets
out what coverage should measure.

How should `audit` decide what's testable and what a step covers, without a second engine, a
model, or a single score?

## Decision Drivers

- One engine: steps come from the runner's own detection.
- Deterministic: the same files give the same numbers.
- Few false positives in the headline, and no silent drops.
- Works for Markdown, MDX, AsciiDoc, HTML, and DITA.
- No new weight in `doc-detective-common`, which browsers load.

## Considered Options

For deciding that a numbered list is a procedure:

1. A configurable verb list checked against the first item.
2. Every numbered list.
3. Explicit markers only.
4. Tiers: explicit markers, then a grammar tagger, then a "possible" bucket.

## Decision Outcome

Chosen option: 4, tiers.

### Procedures

A list's tier is the first that matches:

1. **Explicit.** DITA `<steps>`, an MDX `<Steps>` component, or a list right after a `procedure`
   statement. `procedure` is a new inline statement keyword. The runner and the LSP skip it.
2. **Tagger.** An ordered list where at least half the items read as instructions. With a vote, one
   odd first item can't sink a procedure. "Install prerequisites" is one such item.
   The tagger, compromise 14.19.0, reads each item. It's lexicon-based and pinned exactly. Before tagging, the item
   loses its markup. The tagger reads it as is. It reads it again without a leading emoji,
   "(Optional)", or a sequence word or negation ("Then", "Now", "Please", "Don't"). A third reading
   also drops up to two openers of up to five words before a comma. A last reading also drops a
   leading adverb such as "Briefly". Any reading counts. So "Apply the patch" and "Then click Save"
   keep their verb, and so does "In the terminal, from the repo folder, run it". The item is an instruction when its first word is an imperative or
   infinitive verb with a complement after it. A complement is a determiner, pronoun, preposition,
   particle, UI label, value, or adjective. A bare noun after the verb reads as a noun phrase, as in
   "Release notes". That choice trades a few misses ("Open settings") for a cleaner headline. A bold
   lead-in of two or more words is read alone. So "**Create a branch**: …" is the step, and
   "**Exact match** - …" is a term the item defines. A one-word lead-in labels the step, as in
   "**Commit**:" or "**Optional:**". So the text after it is read. Four UI
   verbs the lexicon misreads (hover, tap, select, preview) are corrected.
   `test/audit-tagger.test.js` pins the expected result for every contract case.

   Accuracy is measured on a labeled corpus, `test/audit-tagger-corpus.json`. It holds every
   non-explicit ordered list in this repository's docs and the agent-tools docs, 233 lists, 130 with
   distinct items. Each was labeled by a reader who didn't see the tagger's result.
   `test/audit-tagger-corpus.test.js` fails when precision or recall drops below its floor. On the
   130 distinct lists, letting the first item decide scored 0.983 precision and 0.713 recall, with
   1 false positive and 23 misses. The chosen vote scores 0.947 precision and 0.887 recall, with 4
   false positives and 9 misses. The remaining misses are mostly verb-and-bare-noun lead-ins ("**Edit files**:", "**Copy
   selector:**") and "Run:"-style labels. The false positives are imperative advice and overview
   lists, such as "**Explain your reasoning**" and "**Bring your docs.**", which read as
   instructions but aren't a sequence.
3. **Possible.** Any other ordered list, including one the tagger can't read. These are counted, but
   kept out of the headline.

Lists come from each format's parse tree, never from a text scan. Only top-level items count, and a
nested list belongs to its parent item. An item runs from its start to the next top-level item. A
step belongs to the item that contains its `location.startIndex`, so a `batchMatches` step credits
the item where it starts. A format no list finder handles is reported as not measured.

### Item states and credit

Each item gets one state, checked in this order:

1. `hasStep`: a counting step that isn't unsafe-skipped.
2. `ignored`: the item overlaps a `test ignore` region, or its block is tagged `testIgnore`.
3. `skipped`: the item's only steps are unsafe.
4. `untested`.

`wait`, `loadVariables`, `saveCookie`, `loadCookie`, `record`, `stopRecord`, and `closeSurface`
never count. Items covered only by `goTo` or `checkLink` are counted separately as navigation-only.

- **Code blocks.** Only runnable languages count. A block has a step when a step lies inside it, when
  an authored step statement directly follows it, or when its `id` equals an authored `stepId`. The
  runner derives other step IDs at run time, so only authored ones can match. A `procedure` class
  counts the block as a procedure step.
- **Links.** A link is testable when it's absolute, or relative with `origin` set. It has a step
  when any `goTo` or `checkLink` targets the same URL, compared through `new URL(url, origin)` without
  the fragment or a trailing slash.
- **Images.** An image has a step when a `screenshot` step is detected on it, or when a `screenshot`
  path resolves to the same file.

A step matched by ID, URL, or screenshot path follows the same state rules as a step inside the
item. So an unsafe match leaves the item `skipped`.

`detectSteps: false` keeps the inventory and drops only detected credit.

### Command contract

`doc-detective audit [inputs...]` takes `-c`, `-i`, `--no-env-file`, and the global flags. An input
of `-` reads a document from stdin, as in `run`. It prints
a text report or, with `--json`, one JSON document on stdout. Secrets from `.env` are masked in
both, as in run output. Warnings go to stderr. Spec files don't count as files to audit. It exits 0
whenever it prints a report, and 2 for bad usage, a bad config, or no files to audit. There's no
coverage gate, so it never exits 1.

### Placement

Coverage lives in core (`src/audit/`), not in `doc-detective-common` as coverage.md proposed. This
keeps compromise out of common, which browsers load. Move it to common when a second consumer,
such as the LSP or Online, needs it.

### Parser change

HTML, DITA, and AsciiDoc code-block nodes now carry their attributes: `id`, plus `class` from
`class`, `outputclass`, or roles. A custom `codeBlock` selector with `attributes` used to match
nothing in those formats, and now it can.

### Consequences

- Good, because a writer gets a per-step list of untested instructions before writing any test.
- Good, because the headline excludes lists the tagger can't vouch for, without hiding them.
- Bad, because the tagger reads English only. Other languages land in "possible" until marked.
- Bad, because a compromise upgrade can change results. The pinned version and contract suite make
  that change deliberate.

### Confirmation

- `test/audit-tagger.test.js`, `test/audit-coverage.test.js`, and `test/audit.test.js`.
- `test/audit-tagger-corpus.test.js`, which holds the tagger to its precision and recall floors.
- The `test/core-artifacts/audit/` fixtures, which run every tier, format, credit rule, state, and
  output mode through the real CLI.

## Pros and Cons of the Options

### Verb list

- Good, because it's simple and configurable.
- Bad, because many verbs are also nouns ("Set of rules", "Update frequency"), so false positives
  rise as the list grows. The tagger shares part of this weakness. A verb-like noun before a
  preposition reads as an instruction, as in "Access to the API" or "Support for MDX". Voting
  across a list's items keeps one such item from deciding the list. A verb list wasn't measured on
  the corpus.

### Every numbered list

- Good, because it never misses a procedure.
- Bad, because lists that aren't procedures inflate the untested count. This repository's docs had
  84 items, of which 42 were procedure steps.

### Explicit markers only

- Good, because it has no false positives.
- Bad, because unmarked docs show no procedures at all.

### Tiers

- Good, because markers give authors control and the tagger covers unmarked docs.
- Bad, because it adds a dependency and a contract suite to maintain.
