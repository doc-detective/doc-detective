---
status: accepted
date: 2026-10-21
decision-makers: doc-detective maintainers
---

# Write verification results back into source docs, in manni's shared keys

## Context and Problem Statement

A docs page earns trust when it says "a check proved this worked on 2026-10-21". It should keep
saying so without anyone editing the date. Doc Detective already proves a procedure works by running it. The
missing piece is writing that result back into the source file, where a docs site can show it and an
agent can read it. CI can then turn the change into a pull request.

Other tools, such as a link checker or a sample runner, prove things about pages too. If each tool invents its
own key, no reader can treat "a check passed" as one fact. manni's vocabularies define one shape for
it. Proposal 0098 sets the page keys, `verified-by` and `last-verified`, in `manni:stewardship:1.2.0`.
Proposal 0099 sets the inline form, the `meta` statement, pinned to the block it describes.

How should Doc Detective decide what to write, where to write it, and how an author opts in? It must
avoid surprising file changes, brittle anchoring and new configuration.

## Decision Drivers

* The result must land in the source file, and a second run must leave the file as it was.
* The signal must be honest. A date means "verified passing", and it never moves when the docs break.
* The anchor between a date and its test must survive edits and reordering.
* The shape must be the one manni defines, so any tool reads and writes one key, and manni can
  validate it and serve it.
* By default, a run writes only where an author asked. Anything more is an explicit setting.
* CI should turn the change into a pull request with no new plumbing.

## Considered Options

* **A. Author-declared `verified-by` entries in manni's shared keys** (chosen). The author lists an
  entry naming Doc Detective and a test or spec id. Doc Detective fills in the result.
* **B. Doc Detective's own keys.** A `doc-detective.verified` front-matter object and an inline
  `verified` comment marker, each with an `id` and a `date`.
* **C. Config-driven injection.** A `verification` config object tells Doc Detective where to stamp
  dates.
* **D. Sidecar manifest.** Results go to `.doc-detective/verified.json`, and source files are never
  touched.

## Decision Outcome

Chosen option: **A**. The author's entry makes anchoring and granularity explicit, which removes the
hardest problems of C. It writes into the file, which D cannot. Unlike B, it uses keys the whole
manni family reads, so one page can list several tools and a reader sees one date.

Behavior decided:

1. **One setting, `verification.write`, with the CLI override `--verification`.**
   * `"existing"`, the default, fills only what pages already declare: `verified-by` entries naming
     Doc Detective, and `badge: true` tests.
   * `false` writes nothing back, badges included. It suits a local or exploratory run.
   * `true` also declares entries on a passing run, then fills them in the same run. A passing
     Markdown or MDX page with no Doc Detective entry gets one in its front matter, checked by its
     spec id. A page without front matter gets a block.
   * Under `true`, a passing inline test gets a `meta` statement on the line above it, and above
     its badge. Detection doesn't record which ids were authored. But an authored id is written in
     its own test statement, whose span the report carries, and a generated one never is.
   * A generated id changes whenever its test does, so a statement naming it would break. Under
     `true`, it's frozen first: written into the test's own statement, where it counts as authored
     from then on. Only a statement with no options or one JSON object is edited, so the author's
     statement is never re-serialized. Any other form is skipped with a warning.
   * An entry is added once. Later runs fill it in place, like one an author wrote.

   Unlike option C, `true` infers no placement. A page entry goes in front matter, and a statement
   goes on the line above its test, the same spot a badge takes.
2. **A page opts in with a `verified-by` entry.** The entry has `tool: doc-detective` and a `check`
   naming a test id or a spec id. After a run, the check resolves to that unit's roll-up result. A
   spec id wins over a test id of the same name.

   ```yaml
   verified-by:
     - tool: doc-detective
       check: cite-set-up
   ```

3. **On PASS, Doc Detective fills its own entry.** It sets `version` to its own version and `passed`
   to today as a UTC day (`YYYY-MM-DD`). It then sets the top-level `last-verified` to the oldest
   `passed` across all entries, but only once every entry has one. A lagging check holds the date
   back, so it never claims more than every check proved.

   ```yaml
   last-verified: 2026-10-21
   verified-by:
     - tool: doc-detective
       check: cite-set-up
       version: 4.27.0
       passed: 2026-10-21
   ```

4. **On FAIL, WARNING or SKIPPED it writes nothing.** The existing values age, and the age is the
   signal.
5. **It never touches another tool's entry.** An entry for `lychee` keeps whatever its own writer
   put there, even when it names the same check.
6. **Writes keep the file's style.** A value is replaced in place and keeps its quotes. A missing key
   goes at the end of its block, in that block's style, block or flow. Line endings stay as they
   were. A second pass on the same day changes nothing.
7. **The inline form is manni's `meta` statement.** It carries the same fields for one block, in the
   page's own comment syntax. Markdown and MDX take `<!-- -->`, `{/* */}` or `[comment]: # ( )`.
   HTML takes `<!-- -->`, AsciiDoc `// ( )`, and DITA `<?manni meta …?>` or `<!-- -->`. A
   statement opts in the same way, with an entry naming Doc Detective and a check.

   ```mdx
   {/* meta {"verified-by":[{"tool":"doc-detective","check":"cite-add-first-pin"}]} */}
   1. Run `manni cite add docs/intro.md:12 --source src/limits.ts:10-14`.
   ```

8. **On PASS, a statement is filled and pinned.** Doc Detective fills its entry and sets the
   statement's `last-verified` by the same rule as the page. It then writes a pin: the hash of the
   lines the statement anchors, by manni's rule. The rewrite stays in the statement's own comment
   form, so the diff is one line. Statements inside code are never read.
9. **Anchoring and the pin follow manni's rules exactly.** In the line formats a statement anchors
   the rest of its own line, else the next paragraph or fenced block. In DITA it anchors the element
   it is the first child of, else the next element, start tag to end tag. On a section it anchors
   the title. The pin is `sha256-` and the hex digest of those lines joined with LF.
   * **Statements are cut out first,** per manni proposal 0101. Every `meta` statement inside the
     anchored lines is removed before hashing, the anchoring one and any other. A DITA `<data>`
     carrier is removed whole, start tag to end tag.
   * **A line the cut leaves blank is dropped,** and a line that was blank before stays.
   * So a write into any statement never changes a pin over it. A `<steps>` statement stays
     current while Doc Detective fills the statement of a step inside it.
10. **Unknown check, then warn and skip.** A check that matches no test or spec logs a warning, and
    the entry is left as it was.
11. **CI uses the existing GitHub Action.** `create_pr_on_change` already turns a post-run file
    change into a pull request.

Doc Detective's own keys from option B are gone. The front-matter `doc-detective.verified` object
and the inline `verified` marker are no longer read or written. The shields.io badge that marker
could carry moves to badge-anchored tests, recorded in ADR 01141.

### Consequences

* Good, because one shape serves every tool. manni validates the form of every value, and other tools read the
  same date.
* Good, because it keeps honest aging, author-explicit anchoring and idempotent writes. Its one
  setting defaults to writing only what authors declared.
* Trade-off: a page entry that `true` adds names the page's spec id, which is its path from the run
  directory. Run from the same folder each time. A moved page gets a new entry, and the old one
  reports an unknown check until it's removed.
* Good, because a pin records exactly which words a check proved. When they change, `manni meta validate`
  warns until the next passing run re-pins them.
* The writer scans the union of the report's content paths and the full detected input
  set. A prose-only page that names a check defined in another file is still updated. The detected
  set is side-channelled from `qualifyFiles` (`config._qualifiedFiles`) through
  `resolvedTests._qualifiedFiles`, so the run's own file discovery is reused.
  * **Exception, pre-resolved (`DOC_DETECTIVE_API`) runs:** caller-supplied `resolvedTests` never
    carry `_qualifiedFiles`. The candidate set falls back to the report's content paths, and a
    `debug` line says so.
* Trade-off: the anchoring rules are ported from manni rather than shared as a package. Fixtures
  pinned by manni itself guard the port against drift.
* Trade-off: new dates are written unquoted, as manni's own examples are. A YAML 1.1 reader may load
  one as a date object rather than a string.

### Confirmation

* `test/verified-markers.test.js` covers the content-level rules: opt-in through `verified-by`,
  `version`, `passed` and `last-verified` on PASS, nothing on FAIL, WARNING or SKIPPED, and the
  oldest-pass rule with two entries. It also covers other tools' entries, flow style, CRLF, quotes
  and idempotency.
* The same file runs each page in `test/verification-fixtures/` with its pins stripped. Each page was
  pinned by `manni meta derive`. Doc Detective must write back the same pins, in Markdown, MDX, HTML,
  AsciiDoc and DITA, and keep each comment form.
* `test/verified-writeback.test.js` covers the file-level writer and two real `runTests` runs. One
  fills front matter after an inline `wait` test. One pins a statement on a prose-only page whose
  test lives in another file.
* The setting is covered at each layer:
  * `src/common/test/validate.test.js` checks each mode, the `"existing"` default, and rejects an
    unknown mode.
  * `test/utils.test.js` checks that `--verification` sets `verification.write`, and that an unknown
    value is ignored with a warning.
  * `test/verified-markers.test.js` covers `declarePage`: a new block, an appended key or list item,
    flow style, quoting and CRLF, and a page that already names Doc Detective.
  * `test/badge-anchor-writeback.test.js` covers statement declaration: each comment form, placement
    above a badge, and skipping generated ids, failures and already-declared checks.
  * `test/verified-writeback.test.js` runs `runTests` in each mode. `true` declares, fills and pins on
    the first run and adds nothing on the second. `"existing"` declares nothing. `false` writes nothing.
* These are temp-file tests, not committed `test/core-artifacts/*.spec.json` fixtures. The feature
  writes to source files, so a committed fixture would get today's date on every run and dirty the
  working tree.

## Pros and Cons of the Options

### A. Author-declared `verified-by` entries in manni's shared keys

* Good, because anchoring is the author's literal check id: stable, with no orphans.
* Good, because idempotency is "find the entry, overwrite its values in place".
* Good, because several tools share one page and one reader-facing date.
* Good, because manni validates the shape, and the pin tells a reader when proved text changed.
* Bad, because the author must know a valid id, and a typo only warns.

### B. Doc Detective's own keys

* Good, because Doc Detective owns the whole format.
* Bad, because no other tool or reader understands it, and manni cannot validate or serve it.
* Bad, because a page verified by two tools carries two unrelated dates.

### C. Config-driven injection

* Good, because users get dates without placing anything by hand.
* Bad, because Doc Detective must infer a safe insertion point and guess which test owns each stamp,
  which brings back orphan and idempotency hazards.
* Bad, because it adds a `verification` config object and per-format placement machinery.

### D. Sidecar manifest

* Good, because it never risks a bad source-file diff.
* Bad, because it fails the core need to write into the source file, and every docs theme must read
  a separate file.
