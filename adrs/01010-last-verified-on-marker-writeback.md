---
status: accepted
date: 2026-06-29
decision-makers: doc-detective maintainers
---

# "Last Verified On" — marker-driven write-back to source docs

## Context and Problem Statement

End-user documentation often wants a freshness/trust signal — "this page was verified working on
2026-06-26" — that stays current automatically. Doc Detective already *proves* a procedure works by
running it; the missing piece is writing that verification date **back into the source file** so a
docs site can render a badge, and surfacing the change for review in CI.

How should Doc Detective decide *what* date to write, *where* to write it, and *how* a user opts in —
without surprising file mutations, brittle anchoring, or a pile of new configuration?

## Decision Drivers

* The date must land **in the source file** (not just a run artifact), idempotently across re-runs.
* The signal must be **honest**: a date should mean "verified passing", and must not silently advance
  when the docs break.
* Anchoring a date to the right test/spec must survive edits and file reordering.
* Minimize new surface area: no new config knobs or schema changes if avoidable.
* CI should be able to turn the change into a pull request with no new plumbing.
* No breaking changes to public schemas or the report shape.

## Considered Options

* **A. Marker-driven, author-placed, no config** (chosen) — the author writes a static `verified`
  marker carrying an `id` they choose; Doc Detective resolves the id and writes the date.
* **B. Config-driven injection** — a `verification` config object (placement/granularity/template)
  tells Doc Detective where to inject stamps.
* **C. Sidecar manifest** — write verification data to `.doc-detective/verified.json`; never touch
  source files.

## Decision Outcome

Chosen option: **A**, because it makes anchoring, idempotency, granularity, and placement the
author's explicit choice instead of something Doc Detective must infer — which dissolves the hardest
problems of an injection model (B) and still satisfies the "write directly to the file" requirement
that C fails.

Behavior decided:

1. **No config, no CLI flag, no configurable marker.** The feature is always on and acts only where a
   `verified` marker exists in content, and nowhere else. There is no `verification` config object and
   no schema change.
2. **Author owns the `id`; Doc Detective owns the `date`.** The marker's `id` references a **test id or
   a spec id**. After a run, the id is resolved to that unit's roll-up result.
3. **Write the date only on PASS.** On FAIL/WARNING/SKIPPED the existing date is left untouched, so the
   badge "ages". Because a date is only ever written on PASS, the date alone is the trust signal — no
   `status` field is recorded.
4. **Two marker forms.** An inline comment (per format: markdown/MDX `{/* */}`, `<!-- -->`, and
   `[comment]: #`; AsciiDoc `// ( )`; HTML/DITA comments) and a page-level YAML front-matter object
   `doc-detective.verified` with sibling `id` (author-set) and `date` (Doc Detective-written) keys.
5. **Optional `badge`.** An inline marker with the `badge` attribute additionally maintains a
   **shields.io static badge image** (`![Last verified …](https://img.shields.io/badge/…)`) on the line
   after the marker, so it renders without theme work. Doc Detective only writes the URL — shields.io
   renders it client-side, so there is no network call. Without `badge`, the marker is data-only.
6. **Unknown id → warn and skip.** A marker whose id matches no test/spec logs a warning and is left
   untouched, catching typos and deleted tests without failing the run.
7. **CI uses the existing GitHub Action.** `create_pr_on_change` already turns any post-run file change
   into a pull request, so date writes flow into a PR with zero Action changes.

### Consequences

* Good: idempotent in-source writes; honest aging; author-explicit anchoring (no content-hash guessing,
  no orphans); zero new config/schema surface; zero new CI code.
* Good: implementation is contained in `src/core` (`applyVerifiedMarkers` + pure helpers in
  `src/core/utils.ts`, wired into `runTests`), so the schemas and the report shape are untouched.
* Coverage: the writer scans the **union** of the report's content paths and the full detected input
  set, so a marker in a prose-only page that produces no spec — referencing a test/spec defined in
  another file — is still updated. The detected input set is side-channelled from `qualifyFiles`
  (`config._qualifiedFiles`) through `resolvedTests._qualifiedFiles` into the writer, reusing the exact
  file discovery the run already performed (no re-enumeration, no duplicated globbing).
* Trade-off: `verified` markers must round-trip in the exact comment form they were authored in; the
  writer never rewrites an MDX `{/* */}` marker as `<!-- -->` (which would break the MDX build).

### Confirmation

* Pure helpers (`verifiedDate`, `shieldsBadge`, `parseVerifiedMarkers`, `applyVerifiedToContent`,
  `resolveVerifiedId`) are unit-tested in `test/verified-markers.test.js`, including the shields.io
  dash-doubling, MDX form preservation, idempotency, and aging.
* End-to-end write-back is covered in `test/verified-writeback.test.js`: a deterministic matrix
  (markdown/MDX/AsciiDoc/HTML/DITA, data-only and badge, front matter, spec-id and test-id targets,
  PASS/FAIL/SKIPPED, unknown-id warning, byte-idempotency) driven by a synthetic report, plus two real
  `runTests` runs — one mutating a temp markdown file with an inline `wait` test, one proving the
  full-input-set scan updates a prose-only page whose marker references a test defined in another file.
* These fixtures are intentionally **not** committed `test/core-artifacts/*.spec.json` files: the
  feature mutates source files, so a committed fixture would be rewritten with the current date on every
  run and permanently dirty the working tree. The temp-file integration tests are the correct
  adaptation of the feature-fixture requirement for a file-mutating feature.

## Pros and Cons of the Options

### A. Marker-driven, author-placed, no config

* Good, because anchoring is the author's literal `id` — stable, no orphans, no content-hash inference.
* Good, because idempotency is "find marker by id, overwrite its date in place" — position-independent.
* Good, because granularity and placement are free: reference a test or spec id, put the marker anywhere.
* Good, because it needs no config object, no schema change, and no Action change.
* Bad, because the author must know/copy a valid id, and a typo'd id only warns rather than failing.

### B. Config-driven injection

* Good, because users get badges without authoring per-location markers.
* Bad, because Doc Detective must infer a safe insertion point (avoiding code fences/lists/tables) and
  guess which test owns each stamp, reintroducing orphan and idempotency hazards.
* Bad, because it adds a `verification` config object and per-format placement machinery.

### C. Sidecar manifest

* Good, because it never risks a bad source-file diff and idempotency is trivial.
* Bad, because it fails the core requirement to write **directly into the source file**, and requires
  every docs theme to read a separate JSON file to render anything.
