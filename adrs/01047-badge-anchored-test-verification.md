---
status: accepted
date: 2026-07-10
decision-makers: doc-detective maintainers
---

# Badge-anchored test verification — no authored id required

## Context and Problem Statement

[ADR 01046](01046-last-verified-on-marker-writeback.md) shipped a marker-driven "Last Verified
On" write-back: an author places a `verified` marker carrying a test or spec `id` they choose,
and Doc Detective writes today's date into that marker on PASS. That id is the marker's only
anchor to a result — the author must know or copy the right test/spec id, and a typo only
warns rather than failing loudly.

For the common case — "put a freshness badge on the procedure right where I'm testing it" —
requiring an id is friction the feature doesn't need. A test's inline `test` statement is
already right there in the source, already gets a real, stable identity from detection (an
authored or content-hash-derived `testId`), and detection already knows exactly where that
statement sits in the file. Can a badge be anchored to the test itself, with no id required
anywhere in the file?

## Decision Drivers

* Eliminate the "author must know/copy a valid id" friction entirely for the co-located badge
  case, without regressing the shipped marker's flexibility for cross-file/prose-only badges.
* The date must land in the source file, idempotently, exactly as ADR 01046 established.
* Resolving a badge-flagged test to its PASS/FAIL result must not require re-deriving or
  guessing detection's own logic (id generation, statement parsing) a second time in the
  writer — any such duplication risks drifting from what detection actually computed.
* No breaking changes to the public schemas or report shape beyond additive fields.

## Considered Options

* **A. Anchor by source location, resolved via the report** (chosen) — a `badge: true` flag on
  the `test` statement; detection stamps the test with its own `location`; the writer resolves
  PASS/FAIL by `(contentPath, location.line)`, reading straight off the already-computed report.
* **B. Anchor by source location, resolved by re-scanning the file** — same `badge`/`location`
  idea, but the writer re-parses each candidate file's `test` statements independently to find
  `badge: true` matches, then correlates by line. (This is how the first prototype of this
  feature worked before being generalized here.)
* **C. Anchor by the auto-derived `testId`** — recompute detection's `${specId}~${contentHash}`
  formula in the writer and resolve by that id, same as the shipped marker.

## Decision Outcome

Chosen option: **A**, because the report already contains everything option B or C would have
to re-derive. Detection parses every `test` statement exactly once, using the real per-format
grammar and the real (lenient) object parser; by the time a run finishes, each test's `badge`
flag and `location` are sitting on `results.specs[].tests[]` already. Re-scanning (B) would
force the writer to reimplement statement parsing with a second, necessarily looser parser
(risking silent drift from what detection actually accepted), and gains nothing — the writer
still needs to open the file to do the text surgery either way. Recomputing an id (C) is fragile
in the way ADR 01046 already flagged for the marker path (any change to the hash inputs breaks
matching) and reintroduces the very naming indirection this feature exists to remove.

Behavior decided:

1. **No id required, anywhere.** An author opts a test in with `"badge": true` in its `test`
   statement. Nothing else changes about how the test is authored.
2. **Detection stamps `location`; the report carries `badge` + `location` forward.** Mirrors how
   steps already carry `location` (`common/detectTests.ts`); `core/tests.ts` passes both through
   onto each report test entry unchanged.
3. **The writer is purely report-driven.** `applyBadgeAnchoredTests` (`core/utils.ts`) groups
   every `badge: true` report test by `contentPath`, and for each PASSing one, inserts/updates a
   shields.io "Last verified" badge on the line **immediately above** the test statement, using
   the same `shieldsBadge()` renderer and per-format image syntax ADR 01046 established. On any
   non-PASS result the existing badge (if any) is left untouched — it ages, identically to the
   marker feature.
4. **A `badge: true` test with no `location` (i.e. a JSON/YAML spec test, which has no comparable
   "line above" to anchor an image to) logs a warning and is skipped — never silently dropped,
   never a crash.** This is a deliberate non-goal, not an oversight: unlike prose/markdown, a
   JSON/YAML test's neighbors are other structured array entries, not renderable content: there
   is no natural line to hold an image without editing unrelated JSON/YAML structure.
5. **Idempotent, in-place, form-agnostic.** Same guarantees as the marker feature: re-running is
   byte-identical, an existing badge is replaced in place (never duplicated), and the insert
   preserves the test statement's own indentation (so a badge inside a nested list stays nested).
   No EOL-preservation work was needed here (unlike the marker's front-matter path) because a
   badge insertion is always a single self-contained image line, never a multi-line rewrite.
6. **No config, no CLI flag, no `files` parameter.** `applyBadgeAnchoredTests({ config, results })`
   needs nothing else — every candidate file and every result it needs is already on `results`.
   This is strictly simpler than the marker writer's signature, which needed a `files` union
   (report content paths + the full detected input set) to reach prose-only pages referencing a
   test defined elsewhere. A badge-anchored test's badge is, by construction, always in the same
   file as the test itself — there is no cross-file case to support.
7. **Relationship to the shipped `verified` marker: complementary, not a replacement.** The
   marker remains the right tool for a badge that lives somewhere other than right next to its
   test (a landing page, an index, a different file) or that references a test/spec by name on
   purpose. Badge-anchored verification is the low-friction default for "stamp the procedure
   right where I tested it."

### Consequences

* Good: zero authoring friction beyond one boolean flag; no id to invent, copy, or typo.
* Good: the writer duplicates none of detection's parsing logic, so there is no drift surface
  between "what detection considered a test" and "what the writer considered a badge target."
* Good: implementation is additive and contained — `badge` + `location` on `test_v3`
  (`src/common/src/schemas/src_schemas/test_v3.schema.json`), a five-line stamp in
  `common/detectTests.ts`, a two-line passthrough at each of `core/tests.ts`'s two report-entry
  construction sites, and `applyBadgeAnchoredTests` in `core/utils.ts` (which reuses
  `shieldsBadge`, `verifiedDate`, `VERIFIED_FORMAT_BY_EXT`, and `VERIFIED_IMG_BODY` from the
  shipped marker feature verbatim).
* Trade-off: scoped to inline tests only (markdown/MDX, AsciiDoc, HTML, DITA). A `badge: true` on
  a JSON/YAML spec test is a logged no-op by design (see driver above) — not a gap to close, a
  boundary the image-anchoring model doesn't natively cross. Authors who want a badge tied to a
  JSON/YAML-authored test already have the marker (reference that test's `testId` from any
  file, including the doc page the JSON spec exercises).
* Trade-off: because a badge-anchored test's identity for resolution is purely positional
  (`contentPath` + `location.line`), moving the `test` statement to a different line between the
  run that inserted a badge and a later run is exactly the case that keeps behavior correct — a
  fresh detection on the moved file reports the new line, and the writer follows it. The only
  way this resolution can miss is if `results` itself is stale relative to the file on disk
  (e.g. a caller mutates the file after the run without re-running detection) — the same
  precondition every other post-run write-back in this codebase already depends on.

### Confirmation

* Detection: `src/common/test/detectTests.test.js` — a `describe("test location", …)` block
  covering location capture (single test, non-first-line, multiple tests in one file) and the
  key invariant that `location` is excluded from the content hash, so it never perturbs an
  auto-derived `testId` (mirroring `HASH_EXCLUDED_KEYS`'s existing treatment of step `location`).
* Schema: `src/common/test/validate.test.js` — positive/negative cases for `badge` (boolean) and
  `location` (object) on `test_v3`.
* Writer: `test/badge-anchor-writeback.test.js` — per-format PASS insertion (markdown, AsciiDoc,
  HTML, DITA), idempotency (including the case where a fresh insert shifts the test's own line,
  which a real re-detection reports correctly — modeled explicitly rather than assumed), stale
  badge replaced in place, FAIL/SKIPPED aging, the no-`location` warn-and-skip path, indentation
  preservation, multiple badge tests in one file, and — the direct proof of the "no id required"
  claim — two real `runTests()` end-to-end runs against a file with **no `testId` anywhere**,
  including a genuine two-runs-in-a-row idempotency check (not a synthetic re-invocation).
* As with ADR 01046, these are integration tests against temp files, not committed
  `test/core-artifacts/*.spec.json` fixtures — the feature mutates source files, so a committed
  fixture would be rewritten (and, for the E2E cases, would gain/lose a line) on every run and
  permanently dirty the working tree. Same precedent, same rationale.

## Pros and Cons of the Options

### A. Anchor by source location, resolved via the report

* Good, because the writer trusts detection's own parsing rather than re-implementing it.
* Good, because it needs no `files` parameter — a badge's file is always its test's file.
* Good, because it needs no config, no schema change beyond two additive `test_v3` fields.
* Bad, because it only works for tests whose report entry actually carries `location` — a
  caller that hand-builds a `resolvedTests` payload without threading it through
  `qualifyFiles`/`core/tests.ts` (the pre-resolved `DOC_DETECTIVE_API` path, same caveat ADR
  01046 already documents for `_qualifiedFiles`) won't get badges applied. Same shape of
  limitation as the existing precedent; not a new category of gap.

### B. Anchor by source location, resolved by re-scanning the file

* Good, because it works even if a caller's `results` object doesn't carry `location` (it
  re-derives everything from the file itself).
* Bad, because it duplicates detection's `test` statement grammar and JSON parsing a second
  time in the writer, with a real risk of silently drifting from what detection actually
  accepts (the first prototype of this feature used a strict `JSON.parse`, which is looser
  than detection's real object parser — exactly the kind of drift this trade-off invites).
* Bad, because it does strictly more work for no behavioral gain in the supported path: every
  file still has to be opened and read either way.

### C. Anchor by the auto-derived `testId`

* Good, because it reuses `resolveVerifiedId` verbatim — no new resolution machinery.
* Bad, because it reintroduces exactly the id-matching fragility (content-hash formula must be
  recomputed identically outside detection) that motivated this feature over the marker's
  id-based model in the first place.
* Bad, because an author-invisible id (nothing about `badge: true` reveals what id got
  generated) makes the anchor harder to reason about than "the badge is above the test that
  produced it," which location-anchoring gives for free.
