---
status: accepted
date: 2026-07-10
decision-makers: doc-detective maintainers
---

# Badge-anchored test verification without an authored id

## Context and Problem Statement

[ADR 01140](01140-last-verified-on-marker-writeback.md) records when a test or spec last passed.
The author names the unit by its `id` in a `verified-by` entry, and Doc Detective writes the result
on PASS. That id is the entry's only anchor to a result. The author must know or copy the right
id, and a typo only warns.

The common case is a freshness badge on the procedure right where it's tested. For that case, an
id is friction the feature doesn't need. The inline `test` statement is already in the source.
Detection already gives it a stable identity, an authored or content-hash-derived `testId`.
Detection also knows exactly where the statement sits in the file. Can a badge anchor to the test
itself, with no id anywhere in the file?

## Decision Drivers

* Remove the "know or copy a valid id" friction for a badge next to its test.
* Keep a way to record a date somewhere else, such as an index page or another file.
* The badge must land in the source file, idempotently, as ADR 01140 established for dates.
* Resolving a badge-flagged test to its result must not re-derive detection's logic in the writer.
  Duplicating id generation or statement parsing risks drifting from what detection computed.
* No breaking changes to the public schemas or report shape beyond additive fields.

## Considered Options

* **A. Anchor by source location, resolved through the report** (chosen). A `badge: true` flag on
  the `test` statement, and detection stamps the test with its own `location`. The writer resolves
  the result by `(contentPath, location.line)`, straight off the report.
* **B. Anchor by source location, resolved by re-scanning the file.** Same flag and `location`,
  but the writer re-parses each file's `test` statements to find `badge: true` and correlates by
  line. The first prototype worked this way.
* **C. Anchor by the auto-derived `testId`.** The writer recomputes detection's
  `${specId}~${contentHash}` formula and resolves by that id.

## Decision Outcome

Chosen option: **A**, because the report already holds everything B or C would re-derive.
Detection parses every `test` statement once, with the real per-format grammar and the real
lenient object parser. When a run finishes, each test's `badge` flag and `location` are already on
`results.specs[].tests[]`.

Re-scanning (B) would need a second, looser parser in the writer, which could drift from what
detection accepted. It gains nothing, because the writer opens the file for the edit either way.
Recomputing an id (C) breaks whenever the hash inputs change. It also brings back the naming
indirection this feature exists to remove.

Behavior decided:

1. **No id required, anywhere.** An author opts a test in with `"badge": true` in its `test`
   statement. Nothing else about the test changes.
2. **Detection stamps `location`, and the report carries it forward.** Steps already carry
   `location` (`common/detectTests.ts`). `core/tests.ts` passes `badge` and `location` onto each
   report test entry unchanged.
3. **The writer is purely report-driven.** `applyBadgeAnchoredTests` (`core/utils.ts`) groups
   every `badge: true` report test by `contentPath`. For each one that PASSED, it inserts or
   updates a shields.io "Last verified" badge on the line **immediately above** the test statement.
   The badge uses `shieldsBadge()` and the format's native image syntax. On any other result, an
   existing badge is left untouched, so it ages.
4. **A `badge: true` test with no `location` warns and is skipped.** A JSON or YAML spec test has
   no "line above" to hold an image. Its neighbors are other array entries, not renderable content.
   It's a deliberate non-goal: the writer logs a warning and never crashes or drops it silently.
5. **Idempotent and in place.** Re-running is byte-identical, and an existing badge is replaced in
   place, never duplicated. The insert keeps the test statement's indentation, so a badge in a
   nested list stays nested. A badge is always one self-contained line, so no EOL handling is
   needed.
6. **No config, no CLI flag, no `files` parameter.** `applyBadgeAnchoredTests({ config, results })`
   needs nothing else, because every file and result it needs is on `results`. A badge is always
   in the same file as its test, so there's no cross-file case.
7. **The one way to place a badge.** ADR 01140's inline `verified` marker, and its `badge` flag,
   gave way to manni's `meta` statement, which carries verification data, not an image. So
   `"badge": true` is the only way Doc Detective draws a badge. A date for somewhere else, such as a
   landing page or a different file, goes in a `verified-by` entry. That entry records the date
   without an image.
8. **Badges are written before verification data.** `runTests` applies badges first, then ADR
   01140's write-back. A `meta` statement directly above a badge-flagged test anchors a block that
   includes the badge line. Its pin then covers the badge as written, not a line about to change.

### Consequences

* Good: zero authoring friction beyond one boolean flag, with no id to invent, copy, or mistype.
* Good: the writer duplicates none of detection's parsing. Nothing can drift between what detection
  called a test and what the writer called a badge target.
* Good: the change is additive and contained. It adds `badge` and `location` to `test_v3`
  (`src/common/src/schemas/src_schemas/test_v3.schema.json`) and a five-line stamp in
  `common/detectTests.ts`. It adds a two-line passthrough at both report-entry sites in
  `core/tests.ts`, and `applyBadgeAnchoredTests` in `core/utils.ts`. The writer reuses
  `shieldsBadge`, `verifiedDate`, `VERIFIED_FORMAT_BY_EXT`, and `VERIFIED_IMG_BODY`.
* Trade-off: scoped to inline tests in markdown/MDX, AsciiDoc, HTML, and DITA. On a JSON or YAML
  spec test, `badge: true` is a logged no-op by design. To show that test's date on a page, list
  its `testId` in a `verified-by` entry (ADR 01140), which records the date but draws no image.
* Trade-off: resolution is purely positional (`contentPath` plus `location.line`). Moving the
  `test` statement between runs still works, because fresh detection reports the new line. It
  misses only when `results` is stale against the file on disk, for example after a caller edits
  the file without re-running detection. Every post-run write-back here shares that precondition.

### Confirmation

* Detection: `src/common/test/detectTests.test.js` has a `describe("test location", …)` block. It
  covers location capture for a single test, a non-first line, and several tests in one file. It
  also proves `location` is excluded from the content hash, so it never changes a derived `testId`.
* Schema: `src/common/test/validate.test.js` has positive and negative cases for `badge` (boolean)
  and `location` (object) on `test_v3`.
* Writer: `test/badge-anchor-writeback.test.js` covers per-format PASS insertion (markdown,
  AsciiDoc, HTML, DITA). It covers idempotency, including a fresh insert that shifts the test's own
  line, and a stale badge replaced in place. It covers FAIL and SKIPPED aging, the no-`location`
  warning, indentation, and several badge tests in one file.
* The direct proof of "no id required" is two real `runTests()` runs against a file with **no
  `testId` anywhere**. They include a genuine two-runs-in-a-row idempotency check.
* `test/verified-writeback.test.js` proves the ordering: a `meta` statement's pin covers a badge
  that `"badge": true` inserted inside its block.
* As with ADR 01140, these are integration tests against temp files, not committed
  `test/core-artifacts/*.spec.json` fixtures. The feature mutates source files, so a committed
  fixture would change on every run and dirty the working tree.

## Pros and Cons of the Options

### A. Anchor by source location, resolved through the report

* Good, because the writer trusts detection's own parsing rather than re-implementing it.
* Good, because it needs no `files` parameter: a badge's file is always its test's file.
* Good, because it needs no config, and its only schema change is two additive `test_v3` fields.
* Bad, because it works only for tests whose report entry carries `location`. A caller that builds
  a `resolvedTests` payload by hand gets no badges. That's the pre-resolved `DOC_DETECTIVE_API`
  path, the same caveat ADR 01140 documents for `_qualifiedFiles`.

### B. Anchor by source location, resolved by re-scanning the file

* Good, because it works even when a caller's `results` don't carry `location`.
* Bad, because it duplicates detection's `test` grammar and object parsing in the writer. That
  invites silent drift: the first prototype used a strict `JSON.parse`, unlike detection's parser.
* Bad, because it does more work for no gain in the supported path, since every file is opened
  either way.

### C. Anchor by the auto-derived `testId`

* Good, because it reuses `resolveVerifiedId` with no new resolution machinery.
* Bad, because the content-hash formula must be recomputed identically outside detection, the
  fragility this feature exists to avoid.
* Bad, because nothing about `badge: true` reveals the generated id. That's harder to reason
  about than "the badge is above the test that produced it."
