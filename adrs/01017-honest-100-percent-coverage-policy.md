---
status: accepted
date: 2026-07-01
decision-makers: doc-detective maintainers
---

# Reach 100% root coverage via reachable tests + documented `c8 ignore` annotations

## Context and Problem Statement

The root coverage ratchet ([ADR 01015](01015-cross-platform-coverage-merge.md)) measures the
cross-platform union of the full E2E suite. It currently sits at ~94.6% lines, 95.5% functions, and
89.1% branches. Several phases of hermetic unit tests closed most of the gap, covering `heretto.ts`,
`config.ts`, the browser action files, agent adapters, runtime helpers, reporters, `cli.ts`, and
more. See the coverage-ratchet PR history.

The remaining ~1,700 uncovered lines split into two fundamentally different categories:

1. **Reachable but untested.** Logic that runs in Node, and could be exercised with more hermetic
   tests. That's additional guard branches, error paths, and small action files not yet touched.
2. **Genuinely unreachable from Node under c8**, in three distinct classes:
   - **Browser-side code.** `driver.execute(() => { ...DOM code... })` callback bodies (in `goTo`,
     `dragAndDrop`, `moveTo`, `startRecording`, `saveScreenshot`, …) are serialized and run **inside
     the browser process**, never in the Node process c8 instruments. They execute correctly in the
     real E2E suite, but c8 can never observe that.
   - **Real subprocess or network dependent code.** That's live `ffmpeg` encode and transcode, real
     `dita` and `appium` CLI spawns, and live HTTP fetches. Fetches include self-update registry
     checks, remote reference images, and `fetchLatestVersion` in the agent adapters. These only
     execute with a real network peer or installed binary. Forcing them in a unit test would make
     the suite flaky or slow. It could also require bundling network mocks that don't prove
     anything a stub couldn't already prove.
   - **Structurally dead defensive code.** A `catch` around a call that cannot throw given its
     inputs, such as a `.match()` on input already validated a paragraph above. Or a branch a prior
     guard already makes unreachable. This class predates this ADR. The codebase already uses
     `c8 ignore` for it, in `src/common/src/detectTests.ts` and `src/common/src/validate.ts`.

Chasing a raw 100% number by writing tests that don't actually prove anything would make the number
dishonest. It would also make the suite slower and flakier, for no correctness benefit. Think of
mocking `driver.execute` to a no-op just to tick a coverage counter, or looping a live ffmpeg encode
into every CI run.

## Decision Drivers

* Coverage should mean what it says: a covered line was actually exercised by a test that could catch
  a regression in it.
* Don't fabricate tests for code that fundamentally cannot run in the process being measured.
* Keep the annotation trail auditable. A future reader must be able to tell *why* a line is excluded
  without archaeology.
* Don't let annotation become a shortcut around real test-writing. Every `c8 ignore` must be
  independently reviewed, rather than self-certified by the PR that adds it.

## Considered Options

* **A. Reachable tests, plus a documented `c8 ignore` for the rest.** For every uncovered line, if
  it's reachable from Node with a hermetic test, write the test. That's the same pattern as every
  prior coverage phase. If it genuinely cannot run outside a real browser, subprocess, or network
  peer, annotate it with `/* c8 ignore next N - <specific reason> */`, using the existing repo
  convention.
* **B. Exclude whole files or globs in `.c8rc.json`.** That's coarser, and excludes files rather
  than lines. A newly-added *reachable* line in an otherwise browser-heavy file would silently go
  uncounted too.
* **C. Instrument the browser page with its own coverage collector, and merge browser and Node
  coverage.** It's the only way to get *true* execution coverage of the `driver.execute` bodies.
  It's a real infrastructure project. Inject istanbul into the page context, and extract coverage
  through CDP. Then merge with the Node V8 coverage already being unioned across the OS matrix.

## Decision Outcome

Chosen: **Option A**, at the per-line granularity the codebase already uses.

Rules for this and every subsequent coverage PR aiming at the remaining gap:

1. **Test first.** Only add `c8 ignore` after confirming the line cannot be reached with a hermetic,
   offline test, meaning no real network, browser, or spawn. Not merely because it would be
   inconvenient to test.
2. **Every annotation states a specific reason**, rather than a generic "unreachable". It names
   which of the three unreachable classes above it falls into. For browser-side code, it also states
   that the line *is* exercised by the real E2E suite. The underlying logic isn't actually untested,
   just untested *by Node's coverage tool*.
3. **Format.** Use `/* c8 ignore next N - <reason> */` for N contiguous lines. Use
   `/* c8 ignore start - <reason> */` … `/* c8 ignore stop */` for a non-contiguous or larger block.
   That matches the existing convention in `src/common/src/detectTests.ts` and `validate.ts`.
4. **Independent review.** Every `c8 ignore` added in service of this ADR is called out explicitly
   in its PR description. It gets the same cross-platform and hazard review as the tests in that PR.
   A reviewer must be able to see the annotation is justified, rather than just trust the author.
5. **`core/tests.ts`**, the runner, has ~475 uncovered lines, and is the single largest remaining
   file. It mixes all three unreachable classes with substantial reachable guard, error, and
   dispatch logic. It is covered incrementally across multiple PRs, rather than one large one, for
   reviewability.
6. Option C, a real browser-coverage merge, is **out of scope** for this pass. It's noted as a
   possible future project if the annotated-100% approach ever proves insufficient. It isn't
   undertaken now, given its cost relative to the marginal benefit. The annotation approach already
   makes the *reason* for every gap explicit and auditable.

### Consequences

* Good: the coverage number, once at 100%, is honest. Every line is either proven-exercised by a
  Node-side test, or explicitly and reviewably justified as unreachable-by-construction from Node.
* Good: it reuses the repo's existing `c8 ignore` convention, with no new tooling.
* Good: `.c8rc.json`'s existing file-level excludes are untouched, covering generated types and
  `dist/common/**`. This ADR only concerns line-level annotations inside otherwise-instrumented
  files.
* Neutral: the coverage-ratchet threshold in `coverage-thresholds.json` climbs in a final jump once
  the annotations land, rather than gradually. Uncovered-but-unreachable lines drop out of the
  denominator. That's expected, and consistent with how every prior phase's tests raised the union.
* Neutral: adding `c8 ignore` is a source change, comment-only with no behavior change, unlike prior
  coverage phases which were test-only. Per the repo's ADR-scope convention, comment-only
  annotations don't need their own per-PR ADR. They cite this one.

### Confirmation

Each PR implementing this ADR reports two things per file. Before and after coverage, and the count
and location of new `c8 ignore` annotations with their reasons. It also confirms that
`npm run build && npx mocha --exit <new test file> <related existing files>` passes hermetically. No
new test may depend on host OS, timing, or network, or leak global or env state across the shared
mocha process. The cross-platform matrix, `coverage-merge`, is the final arbiter. It re-measures the
true union after every merge.

## Docs impact

None. This is internal coverage-tooling and source-comment policy only. No user-facing behavior,
flag, output, or default changes.

## Pros and Cons of the Options

### A: reachable tests, plus a documented `c8 ignore`
* Good: honest and auditable. It reuses an existing convention, with no new infra.
* Bad: manual, per-line judgment calls, and some reviewer effort per annotation.

### B: file or glob excludes
* Good: fewer, coarser changes.
* Bad: a newly-added reachable line in an excluded file silently stops being measured. The ratchet
  can regress without the gate noticing.

### C: browser-side coverage merge
* Good: the only path to *true* execution coverage of `driver.execute` bodies.
* Bad: significant new infrastructure. Inject istanbul in-page, extract through CDP, and merge with
  the existing V8-union pipeline. That's a disproportionate cost for this pass.
