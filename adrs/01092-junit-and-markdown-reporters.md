---
status: accepted
date: 2026-08-05
decision-makers: [hawkeyexl]
---

# `junit` and `markdown` reporters as pure transforms of the results object

## Context and Problem Statement

Doc Detective shipped four reporters — `terminal`, `json`, `html`, `runFolder` — and none produced a
format a CI platform understands, so a failing doc test was invisible where reviewers look. GitLab
renders `artifacts:reports:junit` in the merge request test-summary widget; GitHub renders Markdown
written to `$GITHUB_STEP_SUMMARY` on the run page. Both were left hand-rolling a summary from the
`json` reporter's output ([#683](https://github.com/doc-detective/doc-detective/issues/683),
[#684](https://github.com/doc-detective/doc-detective/issues/684)).

The question was not *whether* to emit these formats but how much machinery to build around them.

## Decision Drivers

* The results object the `json` reporter serializes already contains everything both formats need.
* Reporters run under `Promise.all` in `outputResults`; a rejection propagates out of `src/cli.ts`
  and skips the hint, the `--exit-on-fail` gate, and the telemetry flush.
* A CI artifact declaration names a **path**, so the output location has to be predictable.
* An invalid artifact is worse than no artifact: a JUnit file a parser rejects is reported as "no
  tests found", which looks the same as a green run.

## Considered Options

* **A. Two pure builders over the results object, each with a thin writer** (chosen).
* **B. A separate `transform` subcommand that reads a results JSON file from disk.**
* **C. Reporters that re-walk the test tree independently of the results object.**

## Decision Outcome

Chosen option: **A**.

`buildJunitXml(results)` and `buildMarkdown(results)` are pure functions over the same object the
`json` reporter writes — no second traversal and no second source of truth, so the three reporters
can never disagree about what happened. Each file is one builder plus a short writer that resolves a
path, writes, and returns `null` on failure rather than throwing.

**B** adds a CLI surface and a file round-trip to reach data the process already has in memory.
**C** is the version that creates a second source of truth, which is exactly the bug this avoids.

Four behaviors are deliberate rather than incidental, because each prevents a broken artifact:

- **Characters XML 1.0 forbids are stripped.** C0 controls, `\x7F`, the noncharacters U+FFFE and
  U+FFFF, and unpaired surrogates are illegal even when escaped, and driver errors routinely carry
  ANSI escapes (`\x1B`). One of them makes the whole file unparseable.
- **`\`, `|`, newlines and `<` are escaped in Markdown** — a pipe splits a table cell, a newline
  ends a row, a backslash already in the text would consume the pipe's escape, and a description
  naming an element (`Couldn't find '<button>'`) would swallow the rest of the cell as a tag.
- **`contexts` is filtered for holes.** The array is pre-allocated with `new Array(n)` and filled as
  contexts finish, so an aborted run leaves `undefined` entries.
- **Each reporter writes a fixed filename and writes *beside* `output` when `output` names a file.**
  `--output results.json --reporters json junit` is the natural CI invocation; treating a
  non-`.xml` path as a directory would `mkdir` over the path `jsonReporter` is concurrently writing
  to, and reporters run concurrently.

The fixed filenames are `junit.xml` (a strong enough convention to keep unqualified) and
`doc-detective-summary.md` (namespaced because `output` defaults to `"."`, so a bare
`--reporters markdown` writes into the repo root and must not clobber a file the user owns). Both
overwrite on each run: a CI artifact declaration names one path, so collision-suffixing would pin
that path to the first run's results. This is a deliberate exception to
[ADR 00084](./00084-outputresults-file-or-directory.md), which still governs `json` and `html` —
their job is a historical archive, and the per-run `runFolder` remains the way to keep history.

Per-suite `failures`/`skipped`/`errors`/`time` are emitted on `<testsuite>` as well as on
`<testsuites>`, because GitLab builds its suite-level rollup from the per-suite attributes rather
than from the `<testcase>` children.

`WARNING` maps to a **passing** JUnit test case carrying its detail in `<system-out>`: JUnit has no
warning state, and a warning must not turn a build red.

### Consequences

* Good, because a failed doc test now shows up in the merge request test widget and the CI job
  summary instead of only in the job log.
* Good, because the reporters are pure functions of the results object, so they stay correct as the
  runner changes without tracking it.
* Bad, because two runs sharing an output directory overwrite each other's `junit.xml` and
  `doc-detective-summary.md`.
* Bad, because the Markdown reporter lists at most 100 failures before emitting a
  `… and N more failures` footer, and clamps each table cell to 300 characters. GitHub rejects a job
  step summary over 1 MiB outright rather than truncating it, so bounding both the row count and the
  cell length is what keeps a large run's summary uploadable at all — a row cap alone is not enough,
  because a failed `runShell` step embeds its captured stdout in `resultDescription`.
* Neutral, because `output` is resolved the same way `runFolderBaseDir` resolves it: a known report
  extension always means a file, and anything else is resolved by what is on disk.
* Neutral, because both reporters log `See … report/summary at` rather than `… results at`: the
  doc-detective GitHub Action splits stdout on `"results at "` and `require()`s the trailing path.

### Confirmation

[test/reporters-junit-markdown.test.js](../test/reporters-junit-markdown.test.js) covers the
mapping and counts, XML metacharacter and control-character handling (every well-formedness claim is
checked by parsing with a real XML parser), pipe/newline escaping, empty runs, null results, holes
in `contexts`, the write-beside-a-file path, and the never-throws contract.
[test/core-artifacts/reporters/reporters.spec.json](../test/core-artifacts/reporters/reporters.spec.json)
runs both reporters through a nested CLI run on Windows, macOS and Linux, including a failing run
that must produce a `<failure>` element.

## Pros and Cons of the Options

### A. Pure builders over the results object

* Good, because there is exactly one source of truth for what happened in a run.
* Good, because the builders are trivially testable without a runner, a driver, or the filesystem.
* Neutral, because both reporters must tolerate the shapes the results object actually takes
  (holes, missing `summary`, absent descriptions).

### B. A separate `transform` subcommand

* Good, because it would convert an archived results file after the fact.
* Bad, because it adds CLI surface and a file round-trip for data already in memory, and it cannot
  run as part of the run that produced the results.

### C. Reporters that re-walk the test tree

* Good, because a reporter could reach data the results object omits.
* Bad, because it creates a second source of truth that can disagree with the `json` reporter — the
  precise failure this design avoids.
