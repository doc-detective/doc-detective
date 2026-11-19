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
2. **Tagger.** An ordered list where at least a third of the items read as instructions. With a
   vote, one odd first item can't sink a procedure. "Install prerequisites" is one such item. The
   tagger misses about one real step in five, so the bar sits below half. The tagger, compromise
   14.19.0, reads each item. It's lexicon-based and pinned exactly. Before tagging, the item
   loses its markup. The tagger reads it as is. It reads it again without a leading emoji,
   "(Optional)", or a sequence word or negation ("Then", "Now", "Please", "Don't"). A third reading
   also drops up to two openers of up to five words before a comma. A last reading also drops a
   leading adverb such as "Briefly". Any reading counts. So "Apply the patch" and "Then click Save"
   keep their verb, and so does "In the terminal, from the repo folder, run it". The item is an
   instruction when its first word is an imperative or infinitive verb with a complement after it. A complement is a determiner, pronoun, preposition,
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
   Each procedure also labels every item as an action or not. `test/audit-tagger-corpus.test.js`
   fails when precision or recall drops below its floor. Scores on the 130 distinct lists:

   - First item decides: 0.983 precision, 0.713 recall (1 false positive, 23 misses).
   - Half the items decide: 0.947 precision, 0.887 recall (4 false positives, 9 misses).
   - A third of the items decide, the chosen rule: 0.938 precision, 0.950 recall (5 false
     positives, 4 misses). It wins in both doc sets.

   The false positives are imperative advice and overview lists, such as "**Explain your
   reasoning**" and "**Bring your docs.**". They read as instructions but aren't a sequence. The
   threshold was chosen on the same corpus it's scored on, so expect lower figures on other docs.

   These variants were measured and rejected:

   - **Structure.** A colon line before the list predicts a procedure only half the time (37 of 76
     lists). A how-to heading above the list recovers 1 more list than the vote alone, and needs a
     heading reader per format.
   - **Verb with a bare noun in a bold lead-in.** Accepting "**Edit files**:" adds 4 false positives
     for every 4 misses it recovers, through terms such as "**Automated checks**".
   - **Scoring items, not only lists.** Only 4 of 272 items in procedures aren't actions, such as
     "The console shows all matching elements". The tagger rejects 58 of the 268 that are. So
     moving rejected items out of the headline drops far more steps than it cleans.
   - **Other taggers.** Each was swapped in behind the same readings and vote. At the one-third rule,
     the en-pos 1.0.16 tagger scores 0.900 and 0.900. The wink-nlp 2.4.0 tagger trails at the half
     rule, 0.859 and 0.688, because it reads "click" as a noun. A list of 264 doc verbs, written
     without the corpus, scores 0.974 and 0.950 with no dependency. It ties compromise on recall. Its
     precision edge comes from 3 advice lists whose verbs ("explain", "comment", "bring") aren't on
     its list. The compromise tagger stays, because it reads verbs that no list anticipates. It costs
     4.2 MB and about 300 ms on first use.
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
3. `inTest`: a procedure step that overlaps a counting test region. See
   [Test regions and guidance](#test-regions-and-guidance).
4. `skipped`: the item's only steps are unsafe.
5. `untested`.

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

### Test regions and guidance

The report lists untested procedure steps, but it doesn't say what to write to fix them. An agent or
a person had to look up each format's inline-statement syntax in the docs. Two changes make the
report something an agent can act on.

Decision drivers:

- An agent reading `--json` must be able to act without opening the docs.
- No false credit. Wrapping a page in an empty test must not hide untested steps. That's why a
  wrapping test used to give no credit.
- The guidance must match what `audit` actually accepts, including custom file types.
- Keep the report readable. Hundreds of untested items must not repeat the same snippet.

Considered options:

- For a test region around an item:
  - No credit, as before, with guidance only.
  - Count it as `hasStep`.
  - A new `inTest` state, credited only when the test has a step that runs. **Chosen.**
- For where guidance goes:
  - Per item. Rejected, because one snippet would repeat hundreds of times.
  - Once per syntax, with each file naming its syntax. **Chosen.**
- For a file type's templates:
  - Built-in templates, keyed by format. Rejected, because they'd be wrong for a custom file type.
  - Built-in templates checked against the file's own file type, with a bare fallback. **Chosen.**

#### The `inTest` state

A test region runs from a `test` or `test start` statement to the next `test end`. With no `test
end`, it runs to the next test statement or the end of the file. Only regions opened by a statement
count. The implicit whole-file test that detection creates doesn't count, or one detected link would
credit a whole page.

A region counts when its test has at least one step that would run. An authored step counts: a
`step` statement in the region, or a step in the test statement's own `steps`. So does a detected
step that detection assigned to the test while `detectSteps` is on. "Would run" uses the rules
above. Steps that check nothing don't count, and unsafe steps don't count unless `allowUnsafeSteps`
is on. A test with no such step, such as an empty `<!-- test -->` wrapper, gives no credit.

`inTest` applies to procedure steps only. Code blocks, links, and images are unchanged. `ignored`
wins over `inTest`, because the author said not to test the item.

The headline counts `inTest` as covered, but shows it apart. In JSON, `procedureSteps` and
`possibleProcedureSteps` gain an `inTest` count, and items can carry `"state": "inTest"`. In text, the
headline gains ", N more are inside a test" when N is more than 0:

```text
Procedure steps      8 of 42 have a step, 6 more are inside a test (3 only by navigation or a link check)
                     21 untested, 5 ignored, 2 skipped as unsafe
```

An `inTest` item isn't in the untested list.

#### Guidance

Each file gets a syntax. A built-in syntax applies when the file's own `fileType` reads that syntax's
templates. `audit` checks this by running each template through `collectStatements` with the file's
real `fileType` and path. The candidate comes from the file's format, plus the `.mdx` extension. So a
custom file type that extends Markdown and keeps its statements still gets the `markdown` templates.

| Syntax | `step` | `testStart` / `testEnd` | `ignoreStart` / `ignoreEnd` | `ignoreCodeBlock` | `procedure` |
|---|---|---|---|---|---|
| `markdown` | `<!-- step {"click": "Save"} -->` | `<!-- test {"testId": "my-test"} -->` / `<!-- test end -->` | `<!-- test ignore start -->` / `<!-- test ignore end -->` | ```` ```bash testIgnore ```` | `<!-- procedure -->` |
| `mdx` | `{/* step {"click": "Save"} */}` | `{/* test {"testId": "my-test"} */}` / `{/* test end */}` | `{/* test ignore start */}` / `{/* test ignore end */}` | ```` ```bash testIgnore ```` | `{/* procedure */}` |
| `asciidoc` | `// (step {"click": "Save"})` | `// (test {"testId": "my-test"})` / `// (test end)` | `// (test ignore start)` / `// (test ignore end)` | `[source.testIgnore,bash]` | `// (procedure)` |
| `html` | `<!-- step {"click": "Save"} -->` | `<!-- test {"testId": "my-test"} -->` / `<!-- test end -->` | `<!-- test ignore start -->` / `<!-- test ignore end -->` | `<pre class="testIgnore"><code class="language-bash">` | `<!-- procedure -->` |
| `dita` | `<data name="doc-detective" value="step click='Save'"/>` | `<data name="doc-detective" value="test testId='my-test'"/>` / `<data name="doc-detective" value="test end"/>` | `<data name="doc-detective" value="test ignore start"/>` / `<data name="doc-detective" value="test ignore end"/>` | `<codeblock outputclass="language-bash testIgnore">` | `<data name="doc-detective" value="procedure"/>` |

DITA uses the `<data>` element, not processing instructions or comments, because `<data>` survives
every DITA-OT build. Its step uses the attribute form, so the value needs no escaped quotes.

The test opener names the test. A bare `test start` makes detection skip the whole test in MDX and
DITA, which would drop its steps. The HTML and DITA code-block templates keep the `language-bash`
class, because a block without a runnable language isn't counted at all.

A file type might not read the built-in templates. Examples are custom `inlineStatements` such as
Hugo shortcodes, or a format with no built-in parser. Then its syntax is the file type's `name`, or
`<name>-custom` when that name is a built-in syntax's. That key is numbered from `-2` when another file
type in the run already has it, so no two syntaxes share a key. The guidance
gives each statement's text without a wrapper, and says to wrap it in the comment form the file
type's `inlineStatements` define.

The `procedure` statement is the manual fix for a false negative: a real procedure that `audit`
leaves in "possible procedures".

In JSON, each entry in `files` gains `syntax`, and a top-level `guidance` object has one key per
syntax in `files`, or `{}` when no file was audited:

```json
"guidance": {
  "docs": "https://docs.doc-detective.com/docs/test-docs/audit-test-coverage",
  "coverStep": "Put a step statement inside the item, on the line after the sentence it tests. Or wrap the procedure in a `test` statement and `test end`, with at least one step inside, and its items count as inside a test.",
  "flagFalsePositive": "Wrap a list that isn't a procedure, or an item you won't test, in `test ignore start` and `test ignore end`. Its items then count as ignored. Tag a code block you won't run with `testIgnore`.",
  "markProcedure": "If `audit` misses a procedure and puts it in Possible procedures, put a `procedure` statement directly before the list.",
  "syntaxes": {
    "markdown": { "step": "<!-- step {\"click\": \"Save\"} -->", "testStart": "<!-- test {\"testId\": \"my-test\"} -->", "testEnd": "<!-- test end -->", "ignoreStart": "<!-- test ignore start -->", "ignoreEnd": "<!-- test ignore end -->", "ignoreCodeBlock": "```bash testIgnore", "procedure": "<!-- procedure -->" },
    "hugo": { "custom": true, "step": "step {\"click\": \"Save\"}", "testStart": "test {\"testId\": \"my-test\"}", "testEnd": "test end", "ignoreStart": "test ignore start", "ignoreEnd": "test ignore end", "procedure": "procedure", "note": "Wrap each statement in the comment form that the `hugo` file type's `inlineStatements` define." }
  }
}
```

In text, a guidance block follows the untested list when a procedure step is untested or a list is a
possible procedure. It lists only the syntaxes in the run. `-q` never prints it. The step, test,
and ignore lines print only when a procedure step is untested. The `procedure` lines print only when
a list is a possible procedure.

```text
To cover a step, put a step statement inside the item, on the line after the sentence it tests:
  Markdown   <!-- step {"click": "Save"} -->
Or wrap the procedure in a test with at least one step:
  Markdown   <!-- test {"testId": "my-test"} -->  …  <!-- test end -->
To flag a list that isn't a procedure, wrap it in ignore statements:
  Markdown   <!-- test ignore start -->  …  <!-- test ignore end -->
If audit missed a procedure, put a procedure statement before the list:
  Markdown   <!-- procedure -->
More: https://docs.doc-detective.com/docs/test-docs/audit-test-coverage
```

A custom syntax prints under its key with the bare statement. Its `note` prints once, at the top of
the block, because it applies to every section. Flags, exit codes, and usage errors don't change.

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
- Good, because an agent gets the exact statement for each file, checked against that file's type.
- Good, because wrapping a procedure in a real test now counts, without letting an empty wrapper
  pass.
- Bad, because `inTest` credits items the test never checks one by one. The headline keeps them
  apart from items with their own step.
- Bad, because the templates must track the statement grammar. The contract test catches drift.

### Confirmation

- `test/audit-tagger.test.js`, `test/audit-coverage.test.js`, and `test/audit.test.js`.
- `test/audit-tagger-corpus.test.js`, which holds the tagger to its precision and recall floors.
- `test/audit-guidance.test.js`, which reads every built-in template back through the coverage
  calculation and checks the state the guidance promises.
- The `test/core-artifacts/audit/` fixtures, which run every tier, format, credit rule, state, and
  output mode through the real CLI.

## Pros and Cons of the Options

### Verb list

- Good, because it's simple and configurable.
- Bad, because many verbs are also nouns ("Set of rules", "Update frequency"), so false positives
  rise as the list grows. The tagger shares part of this weakness. A verb-like noun before a
  preposition reads as an instruction, as in "Access to the API" or "Support for MDX". Voting
  across a list's items keeps one such item from deciding the list.
- Neutral, because on the labeled corpus a 264-verb list ties the tagger on recall. Its misses are
  verbs it doesn't list, such as "propose", "suggest", and "analyze", and they grow with each new
  doc set.

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
