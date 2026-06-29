---
status: accepted
date: 2026-06-29
decision-makers: doc-detective maintainers
---

# Nest run artifacts as a REST-style runs/specs/tests/contexts resource tree

## Context and Problem Statement

The `runFolder` reporter archives each run into `<output>/.doc-detective/run-<runId>/`, a single flat
folder holding `testResults.json`/`.html` plus two shallow media subtrees:
`screenshots/<specId>/<testId>/<contextId>/<NN>-<action>-<stepId>.png` and
`recordings/<specId>/<testId>/<contextId>.mp4`. The run is the only addressable resource; specs,
tests, and contexts are buried as path segments under a media-type root (`screenshots/`,
`recordings/`) rather than being first-class nodes. There is no single directory that holds
*everything* produced for one spec, one test, or one context — a consumer that wants "all artifacts
for context X" must glob across sibling `screenshots/` and `recordings/` trees.

How should the per-run artifact layout be organized so that each level of the run hierarchy (run →
spec → test → context) is an addressable resource whose folder contains everything recorded at or
below it, while preserving the run-over-run comparison guarantee that makes the reporter useful?

## Decision Drivers

* Addressability: runs, specs, tests, and contexts should each be a resource directory you can point
  at, the way a REST URL nests `collection/id/collection/id`.
* Locality: media recorded for a context should live *inside* that context's folder, beside any other
  artifacts for the same context, not in a parallel media-typed tree.
* Run-over-run comparison: the same step/context must land on the same path relative to the run
  folder in every run (the report's `autoScreenshot` value is stored relative to `runDir`) — this
  invariant must not regress.
* Cross-platform safety: a deeper tree adds path segments; the layout must not push paths past
  Windows' legacy `MAX_PATH`.
* Backward-compatibility of the report contract: consumers resolve media paths against the
  system-populated `runDir`/`autoScreenshot` fields, so the change must stay within that contract.

## Considered Options

* **A. Plural REST collections with typed media subfolders, single top-level report** (chosen):
  `runs/<runId>/specs/<specId>/tests/<testId>/contexts/<contextId>/screenshots|recordings/…`, one
  `testResults.json`/`.html` at the run root.
* **B. Bare-id nesting** (no collection segments):
  `<runId>/<specId>/<testId>/<contextId>/…` directly under `.doc-detective/`.
* **C. Per-resource result files**: also emit a `result.json` at each spec/test/context node
  describing that subtree.
* **D. Keep the existing flat `run-<id>/` + media-typed subtrees** (status quo).

## Decision Outcome

Chosen option: **A**. It makes every level an addressable resource and co-locates a context's media
inside the context folder, while keeping the change surgical: the three path builders
(`getRunOutputDir`, `captureAutoScreenshot`, `buildAutoRecordStep`) and the reporter's runId
derivation/confinement are the only behavioral edits, and the report's relativization code is
untouched, so the run-over-run comparison guarantee holds (the relative path simply grows the
`specs/…/tests/…/contexts/…` prefix). B was rejected because unprefixed id segments are ambiguous and
un-REST-like (you can't tell a spec id from a test id by position alone without knowing the depth).
C was deferred as a larger change with no consumer asking for per-node manifests yet; the single
top-level report already carries the full nested result tree. D is the problem being solved.

The run root moves from `.doc-detective/run-<runId>/` to `.doc-detective/runs/<runId>/`; the `run-`
filename prefix is dropped because the `runs/` collection segment now carries that meaning, so the
folder name *is* the `runId` (the same ISO-timestamp token, with the same same-millisecond ordinal
suffix on collision). The reporter's stamped-`runDir` confinement root tightens from
`.doc-detective/` to `.doc-detective/runs/`, so a stale or hostile stamped path directly under
`.doc-detective/` is rejected and the reporter falls back to a fresh in-tree `runs/<id>` folder.

To stay under `MAX_PATH`, the per-id path-segment cap (`capPathSegment`, tail-keep so the trailing
content hash survives) drops from 64 to 32 at the two media call sites; three 32-char id segments
reclaim ~96 characters, more than offsetting the four added fixed segments (`runs/`, `specs/`,
`tests/`, `contexts/`).

### Consequences

* Good: `runs/<id>/specs/<id>/tests/<id>/contexts/<id>/` is a clean resource hierarchy; everything
  for a context (its screenshots and recordings) lives in one folder.
* Good: the report contract is unchanged — `runId`, `runDir`, and relative `autoScreenshot` paths
  keep their meaning; only their string values change shape.
* Neutral/Cost: this is an observable layout change. Pre-existing `run-<id>/` folders from older
  versions are left in place (timestamped, git-ignored, harmless); there is no on-disk migration.
  External tooling that hard-coded the old `run-<id>/screenshots/…` path must update — released as a
  `feat` (minor bump).
* Cost: paths are deeper; mitigated by the 64→32 segment cap.

### Confirmation

* Unit (`test/run-artifacts.test.js`): `getRunOutputDir` resolves under `.doc-detective/runs/` with
  the bare-timestamp folder name and ordinal-suffix collisions; the reporter writes into / confines to
  the `runs/` root and derives `runId` as the bare basename; `buildAutoRecordStep` produces the nested
  `specs/…/tests/…/contexts/<ctx>/recordings/<ctx>.mp4` path; an over-long id is capped to 32 chars by
  prepending a deterministic 8-hex hash of the full id and keeping the tail, so two distinct ids that
  share a 32-char tail still produce distinct (and stable) path segments.
* Feature fixture (`test/core-artifacts/autoscreenshot.spec.json`, runOn-gated, PASS/SKIPPED only):
  exercises autoScreenshot end-to-end across the precedence permutations (spec-level true inherited,
  a test-level `false` that overrides spec-level true and captures nothing, a truthy-string coercion,
  and headless capture). Verified on Windows with real Chrome: all four tests PASS and screenshots
  land at `runs/<id>/specs/autoscreenshot/tests/<testId>/contexts/windows-chrome/screenshots/…`.
* The existing `recording.spec.json` / `recording-permutations.spec.json` / `autorecord.spec.json`
  fixtures now write into the same nested tree with no fixture changes required.

## Pros and Cons of the Options

### A. Plural REST collections, typed media subfolders, single report

* Good, because each level is an addressable `collection/id` resource, mirroring REST conventions.
* Good, because a context's media is co-located inside the context folder.
* Good, because it is a minimal, surgical change to the three path builders and the reporter.
* Neutral, because the report stays a single top-level file (no per-node manifests).
* Bad, because paths are deeper (mitigated by the 32-char segment cap).

### B. Bare-id nesting (no collection segments)

* Good, because it is the shallowest nested option.
* Bad, because id-only segments are positionally ambiguous and not REST-shaped.

### C. Per-resource result files at each node

* Good, because each node would be fully self-describing.
* Bad, because it is a larger change with no current consumer demand; the top-level report already
  contains the full nested result tree.

### D. Status quo (flat `run-<id>/` + media-typed subtrees)

* Good, because no change and no migration.
* Bad, because it is exactly the lack-of-nuance the change is meant to fix: specs/tests/contexts are
  not addressable resources and a context's media is split across parallel media-typed trees.
