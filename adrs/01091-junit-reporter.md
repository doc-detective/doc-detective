---
status: accepted
date: 2026-08-05
decision-makers: [hawkeyexl]
---

# A `junit` reporter writing a stable `junit.xml`

## Context and Problem Statement

Doc Detective shipped four reporters — `terminal`, `json`, `html`, `runFolder` — and none of them
produce a format a CI platform understands natively. A failing doc test is therefore invisible in
the place reviewers actually look: GitLab renders `artifacts:reports:junit` in the merge request
test-summary widget, and GitHub, Jenkins, CircleCI and Bitbucket all consume the same JUnit XML.
Until now a GitLab user's only options were reading the job log or hand-parsing the `json`
reporter's output ([#683](https://github.com/doc-detective/doc-detective/issues/683)).

This is Phase 2 of [docs/design/gitlab-ci-first-class-support.md](../docs/design/gitlab-ci-first-class-support.md)
(§4.2–§4.4) and a prerequisite for the GitLab CI/CD Component
([#685](https://github.com/doc-detective/doc-detective/issues/685)), which wires
`artifacts: reports: junit: junit.xml`.

Three questions had to be answered together: how the results tree maps onto JUnit's grammar, where
the file is written, and how the XML is generated safely.

## Decision Drivers

* A CI artifact declaration names a **path**, so the reporter's output path must be predictable and
  stable across runs.
* The XML must parse. A JUnit file a parser rejects is reported as "no tests found", not as an
  error — indistinguishable from a green run.
* `output` is a single global setting shared by every active reporter, so reporters must not fight
  over the same path.
* A reporter must never throw: they run under `Promise.all` in `outputResults`, and a rejection
  propagates out of [src/cli.ts](../src/cli.ts) and skips the hint, the `--exit-on-fail` gate and
  the telemetry flush.
* For a *documentation* test, the most valuable thing a widget can do is link back to the doc line
  that failed.

## Considered Options

* **A. Fixed `junit.xml` in the output directory, overwritten each run** (chosen).
* **B. Timestamped/collision-suffixed filenames, matching the `json` and `html` reporters.**
* **C. A per-reporter options object in `config_v3` (`{ reporters: [{ name, output }] }`).**

For XML generation:

* **X1. Hand-rolled string building with a local sanitizer** (chosen).
* **X2. `XMLBuilder` from `fast-xml-parser`, already a production dependency.**

## Decision Outcome

Chosen option: **A**, with **X1** for generation.

**A over B.** Suffixing is actively wrong here. `artifacts:reports:junit: junit.xml` globs one
path; with `-0`/`-1` suffixing, run 1 writes `junit.xml` and every later run writes
`junit-0.xml`, `junit-1.xml`, … so the CI widget would display the *first* run's results forever
while the build appears to be reporting. A stable, overwritten path is the only behavior that makes
the artifact declaration mean what it says. **C** was deferred per design doc §4.3 — it is a larger
schema and back-compat surface, and nothing yet needs more than one JUnit file per run.

This knowingly carves an exception to decision driver #2 of
[ADR 00084](./00084-outputresults-file-or-directory.md) ("A run should not silently overwrite a
previous run's results file") and to its consequence "existing results are never silently
overwritten". That principle still governs `json` and `html`, whose job is a historical archive; it
does not govern a reporter whose entire purpose is to be found again at a known path by a machine.
The per-run archive under `.doc-detective/runs/<runId>/` remains the way to keep history.

To make overwriting safe, the write goes through a sibling temp file and `fs.renameSync`
(`writeFileAtomic` in [src/reporters/outputPath.ts](../src/reporters/outputPath.ts)). Suffixing had
one genuine virtue — a run killed mid-write could not corrupt the previous run's file — and rename
is atomic within a filesystem on all three supported OSes, so nothing is lost.

**Cross-cutting: extension classification.** `--output results.json --reporters json junit` is the
natural CI invocation. The `json`/`html` reporters classify "not my extension" as "a directory", so
a naive `junit` reporter would `mkdirSync` a *directory* named `results.json` on top of the path
`jsonReporter` is concurrently writing a file to — a genuine race, since reporters run under
`Promise.all`. The new `resolveReportOutput` therefore classifies **any** known report extension as
a file and writes its fixed name beside it. The extension list moved to
[src/reportExtensions.ts](../src/reportExtensions.ts) as `REPORT_FILE_EXTENSIONS` and is now shared
by all three consumers that must agree about it: `runFolderBaseDir`, `getRunOutputDir`, and
`resolveReportOutput`. `.xml` and `.md` joined the list.

**X1 over X2.** `XMLBuilder` escapes the five predefined entities but does not strip C0 control
characters, `\x7F` or lone surrogates — all illegal in XML 1.0 even when escaped, and all routinely
present in driver errors and captured shell output (ANSI escapes are `\x1B`). The sanitizer is
required either way, and once it exists the remaining grammar is a prolog plus three nested
elements with fixed attribute order. Hand-rolling keeps the reporter a leaf module with no new API
surface, matching how [src/core/annotations/svg.ts](../src/core/annotations/svg.ts) already
generates XML.

### Mapping

| Results tree | JUnit |
| --- | --- |
| run | `<testsuites>` (`tests`, `failures`, `errors="0"`, `skipped`, `time`, `timestamp`) |
| spec | `<testsuite>` (`name` from `description`, `file` from `contentPath`) |
| test × context | `<testcase>` (`name` carries `browser / platform`, `file`, `line`) |
| `FAIL` | `<failure message>` with the failing steps' `resultDescription`s in the body |
| `SKIPPED` | `<skipped message>` |
| `WARNING` | a **passing** testcase plus `<system-out>` — JUnit has no warning state, and a warning must not turn a build red |

`durationMs` ([ADR 01083](./01083-record-durationms-on-report-nodes.md)) supplies every `time`,
divided by 1000. `timestamp` is derived from `runId` through an anchored regex validated with
`Date.parse`, and **omitted** when that fails — `getRunOutputDir` appends a `-2`/`-3` ordinal when
two runs start in the same millisecond, and a positional reverse-transform would emit garbage.
`timestamp` is optional in JUnit, so omitting beats lying.

### Consequences

* Good, because a failed doc test now appears in the MR/PR test-summary widget, with `file` and
  `line` pointing at the source doc line that failed.
* Good, because the shared `REPORT_FILE_EXTENSIONS` removes a class of bug where two reporters
  disagree about whether `output` is a file.
* Bad, because two runs sharing an output directory now clobber each other's `junit.xml`. This
  gives up the reservation `getRunOutputDir` provides for run folders (a non-recursive mkdir that
  survives same-millisecond collisions). Deliberate: CI runs one build per workspace, and the
  stable path is the feature.
* Bad, because the default `output` of `"."` means a bare `doc-detective --reporters junit` writes
  `junit.xml` into the repo root. Accepted: `junit.xml` is a strong enough convention that the name
  is expected, and design doc §4.3 commits to it. (The `markdown` reporter, which has no such
  convention, is namespaced instead — see [ADR 01092](./01092-markdown-reporter.md).)
* Bad, because `runTests` and `runCoverage` would share one filename rather than being namespaced
  the way `testResults-*.json` / `coverageResults-*.json` are. Currently unreachable: `outputResults`
  is only invoked from the `runTests` path.
* Bad, because the shorthand normalizer runs before the reporter-map lookup, so a user who calls
  `registerReporter("junit", fn)` now has their reporter shadowed by the built-in.
* Neutral, because adding `.xml`/`.md` to `REPORT_FILE_EXTENSIONS` changes where the run folder
  lands for `--output report.md`: previously inside a `report.md/` directory, now in its parent.
  That is a fix, and it keeps `runFolderBaseDir` and `getRunOutputDir` in agreement.
* Neutral, because the reporter deliberately logs `See JUnit report at …` rather than
  `… results at …`: the doc-detective GitHub Action splits stdout on `"results at "` and `require()`s
  the trailing path, and an XML path there is a syntax error.

### Confirmation

[test/junitReporter.test.js](../test/junitReporter.test.js) covers the mapping, counts against
`results.summary`, escaping and sanitization (control characters, lone surrogates, XML
metacharacters), the empty-run document, `runId` timestamp validation, testcase-name
disambiguation, and every path-resolution and failure branch. Every claim of well-formedness is
checked by parsing with a real XML parser. [test/reporter-output-path.test.js](../test/reporter-output-path.test.js)
pins the shared extension list against all three consumers.
[test/reporters-cli.test.js](../test/reporters-cli.test.js) spawns the real binary end to end,
including the `--output results.json --reporters json junit` case.
[test/core-artifacts/reporters/reporters.spec.json](../test/core-artifacts/reporters/reporters.spec.json)
runs the reporter through a nested CLI run on all three OSes.

## Pros and Cons of the Options

### A. Fixed `junit.xml`, overwritten

* Good, because `artifacts:reports:junit: junit.xml` resolves to the current run's results.
* Good, because it needs no schema change, matching how `runFolder` already owns its own layout.
* Bad, because it overwrites, departing from ADR 00084's principle for the older reporters.

### B. Timestamped / collision-suffixed

* Good, because it preserves every run's output and is consistent with `json`/`html`.
* Bad, because it defeats the purpose: a CI glob would pin to the first run's file forever.

### C. Per-reporter output in `config_v3`

* Good, because it is the most flexible and would let a user place each report independently.
* Bad, because it is a much larger schema and back-compat surface for a need nobody has yet.

### X1. Hand-rolled XML

* Good, because the sanitizer is needed regardless, so the builder adds little.
* Good, because it keeps the module dependency-free and the attribute order stable and reviewable.
* Neutral, because the grammar is small and fixed; this would not scale to a complex document.

### X2. `XMLBuilder`

* Good, because escaping the five predefined entities comes for free, and the dependency is
  already present.
* Bad, because it does not strip control characters, `\x7F` or lone surrogates, so the sanitizer
  would still be required — the hard part is not the part it solves.
