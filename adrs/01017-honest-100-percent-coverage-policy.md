---
status: accepted
date: 2026-07-01
decision-makers: doc-detective maintainers
---

# Reach 100% root coverage via reachable tests + documented `c8 ignore` annotations

## Context and Problem Statement

The root coverage ratchet ([ADR 01015](01015-cross-platform-coverage-merge.md)) measures the
cross-platform union of the full E2E suite and currently sits at ~94.6% lines / 95.5% functions /
89.1% branches, after several phases of hermetic unit tests closed most of the gap (`heretto.ts`,
`config.ts`, the browser action files, agent adapters, runtime helpers, reporters, `cli.ts`, and
more — see the coverage-ratchet PR history).

The remaining ~1,700 uncovered lines split into two fundamentally different categories:

1. **Reachable but untested** — logic that runs in Node and could be exercised with more hermetic
   tests (additional guard branches, error paths, small action files not yet touched).
2. **Genuinely unreachable from Node under c8** — three distinct classes:
   - **Browser-side code.** `driver.execute(() => { ...DOM code... })` callback bodies (in `goTo`,
     `dragAndDrop`, `moveTo`, `startRecording`, `saveScreenshot`, …) are serialized and run **inside
     the browser process**, never in the Node process c8 instruments. They execute correctly in the
     real E2E suite, but c8 can never observe that.
   - **Real subprocess/network dependent code.** Live `ffmpeg` encode/transcode, real `dita`/`appium`
     CLI spawns, live HTTP fetches (self-update registry checks, remote reference images,
     `fetchLatestVersion` in the agent adapters) — these only execute with a real network peer or
     installed binary; forcing them in a unit test would make the suite flaky, slow, or require
     bundling network mocks that don't prove anything a stub couldn't already prove.
   - **Structurally dead defensive code.** A `catch` around a call that cannot throw given its inputs
     (e.g. a `.match()` on input already validated a paragraph above), or a branch a prior guard
     already makes unreachable. This class predates this ADR — the codebase already uses `c8 ignore`
     for it (see `src/common/src/detectTests.ts`, `src/common/src/validate.ts`).

Chasing a raw 100% number by writing tests that don't actually prove anything (mocking `driver.execute`
to a no-op just to tick a coverage counter, or looping a live ffmpeg encode into every CI run) would
make the number dishonest and the suite slower/flakier for no correctness benefit.

## Decision Drivers

* Coverage should mean what it says: a covered line was actually exercised by a test that could catch
  a regression in it.
* Don't fabricate tests for code that fundamentally cannot run in the process being measured.
* Keep the annotation trail auditable — a future reader must be able to tell *why* a line is excluded
  without archaeology.
* Don't let annotation become a shortcut around real test-writing — every `c8 ignore` must be
  independently reviewed, not self-certified by the PR that adds it.

## Considered Options

* **A — Reachable tests + documented `c8 ignore` for the rest.** For every uncovered line: if it's
  reachable from Node with a hermetic test, write the test (same pattern as every prior coverage
  phase). If it genuinely cannot run outside a real browser/subprocess/network peer, annotate it with
  `/* c8 ignore next N - <specific reason> */`, using the existing repo convention.
* **B — Exclude whole files/globs in `.c8rc.json`.** Coarser: excludes files rather than lines, so a
  newly-added *reachable* line in an otherwise browser-heavy file would silently go uncounted too.
* **C — Instrument the browser page with its own coverage collector and merge browser + Node
  coverage.** The only way to get *true* execution coverage of the `driver.execute` bodies. Real
  infrastructure project (inject istanbul into the page context, extract coverage via CDP, merge with
  the Node V8 coverage already being unioned across the OS matrix).

## Decision Outcome

Chosen: **Option A**, at the per-line granularity the codebase already uses.

Rules for this and every subsequent coverage PR aiming at the remaining gap:

1. **Test first.** Only add `c8 ignore` after confirming the line cannot be reached with a hermetic,
   offline test (no real network/browser/spawn) — not because it would merely be inconvenient to test.
2. **Every annotation states a specific reason**, not a generic "unreachable": which of the three
   unreachable classes above it falls into, and — for browser-side code — that it *is* exercised by
   the real E2E suite (so the underlying logic isn't actually untested, just untested *by Node's
   coverage tool*).
3. **Format**: `/* c8 ignore next N - <reason> */` for N contiguous lines, or
   `/* c8 ignore start - <reason> */` … `/* c8 ignore stop */` for a non-contiguous or larger block —
   matching the existing convention in `src/common/src/detectTests.ts` / `validate.ts`.
4. **Independent review.** Every `c8 ignore` added in service of this ADR is called out explicitly in
   its PR description and gets the same cross-platform/hazard review as the tests in that PR — a
   reviewer must be able to see the annotation is justified, not just trust the author.
5. **`core/tests.ts`** (the runner, ~475 uncovered lines) is the single largest remaining file. It
   mixes all three unreachable classes with substantial reachable guard/error/dispatch logic; it is
   covered incrementally across multiple PRs rather than one large one, for reviewability.
6. Option C (real browser-coverage merge) is **out of scope** for this pass — noted as a possible
   future project if the annotated-100% approach ever proves insufficient, but not undertaken now
   given its cost relative to the marginal benefit (the annotation approach already makes the
   *reason* for every gap explicit and auditable).

### Consequences

* Good: the coverage number, once at 100%, is honest — every line is either proven-exercised by a
  Node-side test or explicitly, reviewably justified as unreachable-by-construction from Node.
* Good: reuses the repo's existing `c8 ignore` convention; no new tooling.
* Good: `.c8rc.json`'s existing file-level excludes (generated types, `dist/common/**`) are untouched
  — this ADR only concerns line-level annotations inside otherwise-instrumented files.
* Neutral: the coverage-ratchet threshold in `coverage-thresholds.json` climbs in a final jump once
  the annotations land (uncovered-but-unreachable lines drop out of the denominator), not gradually —
  expected and consistent with how every prior phase's tests raised the union.
* Neutral: adding `c8 ignore` is a source change (comment-only, no behavior change), unlike prior
  coverage phases which were test-only. Per the repo's ADR-scope convention, comment-only annotations
  don't need their own per-PR ADR — they cite this one.

### Confirmation

Each PR implementing this ADR reports, per file: before/after coverage, the count and location of new
`c8 ignore` annotations with their reasons, and confirms `npm run build && npx mocha --exit <new test
file> <related existing files>` passes hermetically with no new tests depending on host OS, timing,
network, or leaking global/env state across the shared mocha process. The cross-platform matrix
(`coverage-merge`) is the final arbiter — it re-measures the true union after every merge.

## Docs impact

None — internal coverage-tooling and source-comment policy only. No user-facing behavior, flag,
output, or default changes.

## Pros and Cons of the Options

### A — Reachable tests + documented `c8 ignore`
* Good: honest, auditable, reuses existing convention, no new infra.
* Bad: manual, per-line judgment calls; some reviewer effort per annotation.

### B — File/glob excludes
* Good: fewer, coarser changes.
* Bad: a newly-added reachable line in an excluded file silently stops being measured — the ratchet
  can regress without the gate noticing.

### C — Browser-side coverage merge
* Good: the only path to *true* execution coverage of `driver.execute` bodies.
* Bad: significant new infrastructure (inject istanbul in-page, extract via CDP, merge with the
  existing V8-union pipeline); disproportionate cost for this pass.
