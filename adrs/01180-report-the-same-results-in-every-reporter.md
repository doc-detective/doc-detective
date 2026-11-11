---
status: accepted
date: 2026-11-08
decision-makers: doc-detective maintainers
---

# Report the same results in every reporter

Amends [ADR 00084](00084-outputresults-file-or-directory.md),
[ADR 00153](00153-self-contained-html-reporter.md), and
[ADR 01092](01092-junit-and-markdown-reporters.md).

## Context and Problem Statement

Doc Detective has six reporters: `terminal`, `json`, `runFolder`, `html`, `junit`, and `markdown`. The JSON ones
write the report as it is. The other four each walk the report on their own, and they disagree about what happened:

- **Items.** The terminal names items `platform/browser - stepId`, lists skips only when something failed, and never
  lists warnings. JUnit hides a skipped step inside a passing context. Markdown lists failures only. After
  [ADR 01179](01179-report-the-automatic-recording-on-its-context.md), a failed `autoRecording` can be the only reason
  a context failed, and none of the three print it.
- **Verdict.** The terminal counts tests. Markdown and HTML count specs, and Markdown calls a warnings-only run
  "Passed".
- **Evidence.** Only HTML shows screenshots and recordings. JUnit has no attachments, properties, or timestamp.
- **Announcements.** `html`, `junit`, and `markdown` print `See … at <path>` with `console.log` on stdout, at every
  log level, which corrupts `--json` stdout. `json` and `runFolder` print relative paths on stderr.
- **Files.** `json` and `html` add `-N` to a path you name. `junit` and `markdown` overwrite. Three helpers decide
  whether `outputDir` is a file or a folder.
- **Errors.** Six write errors read `Error writing … ${err}`.

What should every reporter say about a run, and where does that logic live?

## Decision Drivers

- A reader should get the same items, ID paths, and reasons from whichever reporter their tool reads.
- A failure's evidence should be reachable from the report that names the failure.
- `--json` stdout carries JSON and nothing else.
- Reporters stay pure builders plus a short writer (ADR 01092), and a write failure doesn't change the exit code.
- No new config keys, flags, or exports.

## Considered Options

- **A. One small internal model that every reporter builds on.**
- **B. Keep the walks, and align each one by hand.**
- **C. Render every other format from one intermediate document.**

## Decision Outcome

Chosen option: **A**, as `src/reporters/model.ts`, with five internal functions: `verdict`, `nonPassItems`, `mediaPath`,
`environmentLine`, and `writeReport`. The terminal's tree walk, the JUnit and Markdown walks, and five write-and-announce
blocks are gone.

### The verdict

One verdict, counted at the test level. HTML, Markdown, and the terminal's last line all read it. The terminal's last
line keeps its colors, and `cli.ts` still prints it.

| Status | When | Label | Text |
|---|---|---|---|
| `none` | no tests | No tests ran | `No tests ran.` |
| `fail` | `tests.fail > 0` | Failed | `1 of 12 tests failed (2 with warnings, 3 skipped).` |
| `skipped` | no pass or warning | Skipped | `All 12 tests skipped.` |
| `warning` | `tests.warning > 0` | Passed with warnings | `9 of 12 tests passed (2 with warnings, 3 skipped).` |
| `pass` | otherwise | Passed | `12 of 12 tests passed.` |

### DR4: which results each reporter lists

The deepest non-PASS result that has its own reason. An `Item` is
`{status, idPath, description?, reason, hint?, code?, screenshot?, recording?, skippedAfter}`:

1. The walk goes through specs, tests, contexts, then each context's `autoRecording` and its steps. Holes in `contexts`
   are skipped (ADR 01092).
2. A non-PASS `autoRecording` or step is an item.
3. SKIPPED steps that follow a FAIL in the same context fold into that item as `skippedAfter: N`. A failed
   `autoRecording` counts as coming first.
4. A non-PASS context whose result no item carries is an item itself, for example a guard skip, an unavailable driver,
   or a fallback warning. The same goes for a non-PASS test with no contexts and a non-PASS spec with no tests.
5. Items group as FAIL, WARNING, then SKIPPED, in report order.
6. The ID path is `specId › testId › contextId › stepId`, and `… › contextId › autoRecording` for the recording. The
   description follows ` — `. A missing ID falls back to `spec N`, `test N`, `context N`, or `step N`.
7. Evidence. `screenshot` is the step's `autoScreenshotPath`, `autoScreenshot`, or `outputs.screenshotPath`, the first
   whose file exists. `recording` is the context's `autoRecording.recordingPath`, if its file exists. Both are absolute.
8. `reason` is `resultDescription`. `hint` and `code` are `resultHint` and `resultCode`, when present.

The lists print whenever they have items. There's no cap on the terminal's lists.

### DR5: how paths print

| Reporter | Form |
|---|---|
| Terminal | Absolute, per the message rule |
| HTML | Relative to the HTML file, URL-encoded per segment, or a `file:///` URL when no relative path exists |
| Markdown | Relative to the summary file, as code rather than links, because a job summary can't serve files |
| JUnit | Relative to `junit.xml` |

`mediaPath` resolves a relative stored path against `runDir` first, and returns forward slashes. A path on another
Windows drive stays absolute.

### DR6 and DR7: JUnit

A case has `classname="<specId>"` and `name="<testId> › <contextId> — <description>"`. `contextId` is unique per test, so
GitLab can't drop duplicates. CI test history restarts once, at this major.

- Attachments go first in `<system-out>`, on every case that isn't skipped. The screenshot comes first, from the first
  non-PASS step that has one, then the context's recording. GitLab reads only the first marker. They're relative to `junit.xml`'s
  folder. Azure DevOps resolves them from there, and GitLab resolves them from the project folder, which is the same
  when `junit.xml` is at the project root.
- One `<failure>`. Its `message` is the first failure's reason, and its `type` is that failure's `resultCode` when
  present. The body lists each failing item with its ID path, reason, hint, and fold count.
- Warnings go in `<system-err>` as `Warning:` lines. Step skips are `Skipped:` lines in `<system-out>`.
- A whole-case skip is `<skipped message="X">X</skipped>`.
- Each suite has a `timestamp` and `<properties>`: `runId`, `docDetectiveVersion`, `nodeVersion`, `platform`, `arch`, and
  `osRelease`. A missing field is left out.
- A non-PASS test with no contexts gets a case of its own, and so does a non-PASS spec with no tests. Each is counted
  and listed the same way as everywhere else.

XML 1.0 stripping and escaping are unchanged (ADR 01092).

### DR8: no `hostname` in JUnit

The report doesn't record the host (ADR 01163), so JUnit doesn't either.

### Markdown

The verdict leads, then the count table and the environment line. Failures are a `## Failures` table. Warnings and skips
are tables inside `<details>`. `Run artifacts:` prints only when the run folder exists, relative to the summary file.

Caps: 100 rows per section, then `… and N more`. Each reason, hint, description, and ID path is clamped to 300
characters. Evidence paths print whole: a clamp over the whole cell would cut off the evidence the row exists to show.
The 1 MiB byte cap (ADR 01092) cuts Skipped, then Warnings, before Failures.

### DR9: file announcements

| Reporter | File | Announcement (stderr, info) |
|---|---|---|
| `json` | `<outputDir>/testResults-<runId>.json`; a path you name is overwritten | `Results: <abs>` |
| `runFolder` | `<outputDir>/.doc-detective/runs/<runId>/testResults.json` and `.html` | `Run results: <abs>`, `Run report: <abs>` |
| `runFolder` | `<outputDir>/.doc-detective/runs/<runId>/testResults.md`, the Markdown summary, with paths relative to the run folder | `Run summary: <abs>` |
| `html` | `<outputDir>/testResults-<runId>.html`; a path you name is overwritten | `HTML report: <abs>` |
| `junit` | `<outputDir>/junit.xml`, overwritten | `JUnit report: <abs>` |
| `markdown` | `<outputDir>/doc-detective-summary.md`, overwritten | `Markdown summary: <abs>` |

A directory scan for inputs skips any folder named `.doc-detective`, as it skips `node_modules`. Otherwise the default
`input` of `.` would test the run folder's `testResults.md` on the next run. A `.doc-detective` path passed as the input
itself is still read.

All go through `log()`, so `-l warning` and quieter hide them, and they're masked like every other log line
(ADR 01178). The string `results at ` never prints on any stream: GitHub Action tags up to v1.4.1 split stdout on it.

A write failure, or a report that can't be built, logs at error level, and the reporter returns `null`. It doesn't change the exit code. The line carries `log()`'s usual `Error: ` label. `<name>` is one of `results`, `run results`, `run report`, `run summary`, `HTML report`, `JUnit report`, or `Markdown summary`.

- A report that can't be built: `Couldn't build the <name>: <message>.`, where `<message>` is the error's message without its trailing period. No file is written.
- A write failure: `Couldn't write the <name> to <abs>: <cause>.`

| Code | `<cause>` |
|---|---|
| `EACCES`, `EPERM` | permission denied |
| `ENOSPC` | the disk is full |
| `EROFS` | the file system is read-only |
| `ENOTDIR` | a folder in that path is a file |
| `EISDIR` | that path is a folder |
| other | the error's message, without its trailing period |

`outputResults` moves to `log()` too:

- ``Couldn't find reporter `<name>`. Available reporters: terminal, json, html, runFolder, junit, markdown.``
- ``Couldn't use reporter `<value>`: it isn't a name or a function.``

### DR10: an existing file

A path you name is overwritten, as `--output` already is. This replaces the `-N` collision suffix from ADR 00084. Names
Doc Detective picks are unique per run (`<runId>`) or fixed (`junit.xml`, `doc-detective-summary.md`, ADR 01092). A run
with no `runId`, when a filter matches nothing, keeps its timestamp name.

One rule decides the folder, in `reportOutputDir`: a path ending in `.json`, `.html`, `.htm`, `.xml`, or `.md` is a file,
so its folder is used. Any other path is checked on disk. A folder is used as is, and a file's folder is used. A missing
path is treated as a folder. The result is always absolute. `getRunOutputDir`, the file-writing reporters, and `runFolder` all
call it.

### DR11: the standalone `html` report

This amends ADR 00153. Both copies come from `buildHtml(results, htmlFile)`, so they're the same page with the same
features. They differ only in `hrefs`, because each file links from where it sits. A second JSON block, `dd-report-view`,
holds `{verdict, hrefs: {<stored path>: <href>}}`. `dd-report-data` stays the untouched report, so Download JSON stays
clean. The verdict banner reads `verdict`. Step details show the hint and code when present, and the context label adds
the browser version and driver.

### DR13: the structured failure fields

The reporters read `resultHint` and `resultCode` when present, so this change doesn't wait for them. The report fields
themselves aren't part of this ADR.

### Consequences

- Good: every reporter names the same items, ID paths, and reasons, including an `autoRecording` failure.
- Good: `--json` stdout parses with any combination of reporters.
- Good: a JUnit or Markdown failure links its screenshot and recording.
- Bad: JUnit case names change, so CI test history restarts once.
- Bad: report-file notices move to stderr and follow the log level, so anything that greps stdout for `See … at` stops
  matching.
- Bad: the Markdown and HTML verdicts count tests, so their numbers can differ from a script that reads
  `summary.specs`.
- Bad: a report path you name is overwritten, so a run no longer keeps the previous file at that path.
- Neutral: the terminal's lists and the Markdown tables grow with skips and warnings. A run that skips many contexts on
  purpose prints them all.

### Confirmation

- `test/reporters-model.test.js`. It covers every rule above for `nonPassItems`: holes, folding, context-only items, the
  `autoRecording` item, and missing files. It also covers `mediaPath`, including another Windows drive, and all five
  `verdict` rows. Then `environmentLine`, and `writeReport`'s announcement, its build error, and every `<cause>` row.
- `test/reporters-junit-markdown.test.js`. It covers names, attachments, properties, and the three Markdown sections. It
  parses them with the real XML parser where it applies, and checks the caps and the byte-cap cut order.
- `test/htmlReporter.test.js`: hrefs relative to each copy, the two copies differing only in `hrefs`, the verdict, the
  hint, and the context label.
- `test/utils-coverage.test.js` and `test/reporters-coverage.test.js`: the terminal's lists and footer, announcements on
  stderr only, and overwriting a named path.
- `test/cli-contract.test.js`: `--json -r junit,markdown,html` stdout parses as JSON.
- Fixtures: `reporters/reporter-parity.spec.json` runs a mixed run through every reporter and checks that they agree.

## Pros and Cons of the Options

### A. One small internal model

- Good: the rules live in one file, so a new reporter or a new result field lands everywhere at once.
- Good: it deletes more code than it adds.
- Neutral: reporters still format their own output, because the formats really do differ.

### B. Align each walk by hand

- Good: no new module.
- Bad: four walks that have already drifted, with nothing to stop them drifting again.

### C. Render every format from one intermediate document

- Good: the strongest guarantee of agreement.
- Bad: JUnit and HTML need different things from each node, so the document becomes a second copy of the report.
