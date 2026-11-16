---
status: accepted
date: 2026-11-15
decision-makers: doc-detective maintainers
---

# Resolve includes during detection

## Context and Problem Statement

Readers see a page with its includes already resolved: AsciiDoc `include::`, MkDocs snippets,
mdBook `{{#include}}`, MDX snippet imports, and reStructuredText `.. include::`. Detection, though,
reads each source file on its own. That causes three problems:

- A test in an included snippet doesn't run in the context of the page that shows it.
- A test that starts on the page and continues in a snippet is split in two.
- The directory walk picks up partials such as `_setup.md` and runs them alone. They often lack
  their context, so they fail, or they run twice.

Issue #960 asks that tests run the docs the way a reader follows them. This ADR covers the passive
part of that issue: how detection treats includes, with no opt-in. DITA conref and keyref already
resolve, because `processDitaMaps` runs DITA-OT on map inputs.

## Decision Drivers

- On by default. Every user benefits without choosing a command or a key.
- Locations must still name the file that holds the text. Badge write-back (ADR 01141) edits files
  at those offsets.
- No new dependency, and no toolchain such as Sphinx, Asciidoctor, or a site build.
- A broken include must not change a run's exit code. Reporting broken includes belongs to the
  `validate` and `audit` subcommands.
- Detection reads only what the user pointed it at, and nothing outside the working directory.

## Considered Options

- **A. Expand includes inline before parsing, and keep a source map back to each file.**
- **B. Parse each included file separately, and merge its tests into the parent.**
- **C. Run each format's own toolchain as a preprocessor**, the way `processDitaMaps` runs DITA-OT.
- **D. Ship it as an opt-in key, off by default.**

## Decision Outcome

Chosen option: **A**, on by default.

- **Expansion.** `expandIncludes` in `src/core/includes.ts` replaces each directive with the
  target's content. Nested includes resolve recursively, and each file is read with the syntax of
  its own fileType. It keeps a list of pieces, `(text, file, offset)`, and afterwards
  `remapLocations` points every test and step `location` back at the file that holds it.
- **`location.file`.** When a statement comes from another file, `location` gains `file` (an
  absolute path), and `line`, `startIndex`, and `endIndex` refer to that file. `contentPath`,
  `specId`, and test IDs keep naming the page.
- **Partials.** An input that another input includes doesn't run on its own. Inputs are checked in
  order, so one file of an include cycle still runs. A partial given alone still runs.
- **Built-in syntax:**
  - AsciiDoc `include::`, with `lines`, `tag` and `tags`, `opts=optional`, and `{attribute}`
    paths.
  - MkDocs `--8<--`, with line ranges and sections.
  - mdBook `{{#include}}`, with line ranges and anchors.
  - Fern `<Markdown src>`.
  - MDX imports rendered as components, in the Docusaurus (`@site/`), Mintlify (`/snippets/`), and
    Starlight/Astro (`{ Content }` and `* as X`) forms.
  - reStructuredText `.. include::` for the `rst` fileType, with `start-line`, `end-line`,
    `start-after`, and `end-before`, and `/` resolved from `conf.py`'s folder.
- **Custom syntax.** `fileTypes[].includeStatements` adds regexes whose group 1 is a path. Those
  include the whole file.
- **Opting out.** `resolveIncludes: false` restores the old behavior.
- **MDX.** HTML comments in a non-MDX file included into an MDX page become MDX comments. `<!--`
  and `{/*` have the same length, as do `-->` and `*/}`, so offsets don't move.
- **Guards.** Each one warns, leaves the directive in place, and keeps the exit code:
  - a missing file;
  - a target whose real path is outside the working directory;
  - a cycle, with the chain named;
  - nesting more than 64 levels deep, Asciidoctor's default;
  - a URL target;
  - a tag, section, or anchor that isn't found. That one includes nothing.

### Consequences

- Good, because tests in snippets run in their page's context, in reading order, with no
  configuration.
- Good, because partials no longer fail or run twice when they're tested on their own.
- Good, because badges and verified markers land in the file that holds the test statement.
- Bad, because a test from a partial that two pages include runs once per page. That's the
  reader's view, and it costs run time.
- Bad, because the containment root is the working directory. Runs started from a subfolder can't
  include files above it. The warning names the fix.
- Neutral: MkDocs block-form snippets, AsciiDoc `tags=*` wildcards, and docutils standard includes
  aren't resolved. They stay as text.

### Confirmation

- `test/includes.test.js` covers each syntax, each selector, each guard, the source map, and the
  partial rule.
- `test/badge-anchor-writeback.test.js` covers a badge written into an included file.
- Fixtures: the pages under `test/core-artifacts/detection/includes/` run through the real CLI.
  Partials hold failing steps outside the selected regions. `detection/includes.spec.json` runs the
  config and guard permutations through `dry-run-detect.cjs`.

## Pros and Cons of the Options

### A. Expand inline with a source map

- Good, because a test can span the page and a snippet, and steps keep their reading order.
- Good, because the parsers stay unchanged and see the page a reader sees.
- Bad, because every location needs remapping, which `remapLocations` does once per spec.

### B. Parse each included file separately

- Good, because locations need no mapping.
- Bad, because a test can't span files. The order between page and snippet steps would be lost.

### C. Run each format's toolchain

- Good, because it matches each tool exactly.
- Bad, because it needs Python, Ruby, or Node site builds that users may not have, as `dita`
  already shows. It's also slow, and output offsets don't map back to source files.

### D. Opt-in key

- Good, because nothing changes for current users.
- Bad, because the maintainer wants passive improvements. Most users would never find the key, and
  partials would keep failing alone.
