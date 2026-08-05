---
status: accepted
date: 2026-08-05
decision-makers: [hawkeyexl]
---

# A `markdown` reporter emitting a size-capped run summary

## Context and Problem Statement

No reporter produced output that could be pasted where reviewers read results. `html` is a
self-contained file (great as an artifact, useless in a comment), `json` is machine-only, and
`terminal` writes ANSI to stdout. The gap shows up immediately in CI: GitHub renders any Markdown
written to `$GITHUB_STEP_SUMMARY` on the workflow run page, GitLab renders Markdown in merge
request notes, and a Slack relay or a human pasting a result wants the same artifact. Every one of
those had to hand-roll a summary from the `json` reporter
([#684](https://github.com/doc-detective/doc-detective/issues/684)).

This complements the `junit` reporter ([ADR 01091](./01091-junit-reporter.md)): `junit` is for
machines (the MR test widget), `markdown` is for humans (the job summary and the MR note).

## Decision Drivers

* GitHub caps a job step summary at **1 MiB** and fails the whole upload past it with an error
  annotation. A 5,000-step run must still produce something uploadable.
* The output is read at a glance, so failures must be prominent and passes must not be enumerated.
* It must be renderable on both GitHub and GitLab, which share a Markdown dialect but little else.
* Same reporter contract as every built-in: never throw, pure builder for hermetic tests.

## Considered Options

* **A. A compact summary — verdict, table, failures in collapsible `<details>`, everything else
  rolled up to counts — truncated deterministically at the byte cap** (chosen).
* **B. A full Markdown transcript of the results tree.**
* **C. Reuse the `html` reporter's rendering and strip tags.**

## Decision Outcome

Chosen option: **A**.

**B is unusable at the target size.** A transcript of a real run blows the 1 MiB cap, and past it
GitHub does not truncate — it rejects the upload, so an over-long summary produces *no* summary.
Even under the cap, a wall of passing steps buries the failures that are the reason to read it.
**C** was a non-starter: `htmlReporter`'s `esc`/`escAttr` live inside an inert browser-JS string
literal and are not Node-callable, and its rendering targets an interactive document.

The content, in order: a title and the run's verdict; a summary table taken straight from
`results.summary` (specs / tests / contexts / steps × pass / fail / warning / skipped); failures
detailed spec → test → context → failing step with its `resultDescription`, each wrapped in a
`<details>` block (both GitHub and GitLab render raw HTML `<details>` inside Markdown); passes and
skips rolled up to counts; a collapsible top-5 slowest contexts table; and a pointer to the run
artifacts. The slowest-contexts section is possible because
[ADR 01083](./01083-record-durationms-on-report-nodes.md) put `durationMs` on every node.

**Truncation is by whole blocks, not by bytes.** The header and the tail sections are reserved up
front, failure blocks are appended only while the running byte total leaves room, and the remainder
becomes a `… and N more failures` footer. Because only complete blocks are ever appended, the
output can never be cut mid-character — slicing a UTF-8 buffer at a byte offset would emit U+FFFD
in the middle of a multi-byte sequence.

**Output path.** Follows [ADR 01091](./01091-junit-reporter.md) exactly — a fixed filename in the
output directory, written atomically, overwritten each run, and placed *beside* an output path that
carries another reporter's extension. The filename is **`doc-detective-summary.md`**, not
`summary.md`: `config.output` defaults to `"."`, so a bare `doc-detective --reporters markdown`
writes into the repo root, and `summary.md` is a name a user plausibly owns. `junit.xml` is a
strong enough industry convention to keep unqualified; `summary.md` is not.

**Escaping** is applied unconditionally rather than per-context: `|` becomes `\|` and newlines
become `<br>`. The same `resultDescription` is rendered both in a table cell and in a list item,
where a raw `|` splits a cell and a raw newline ends the row or item.

### Consequences

* Good, because `cat doc-detective-summary.md >> $GITHUB_STEP_SUMMARY` is now a complete recipe for
  a rendered CI summary, and the same file drops into an MR note.
* Good, because the summary stays uploadable at any run size, and the summary table — the part read
  first — is reserved and therefore survives truncation.
* Bad, because a truncated summary silently omits failures beyond the cap. Mitigated by the
  explicit `… and N more failures. See the JSON report for the full list.` footer; a silent cut
  would be the real failure mode.
* Bad, because the same overwrite and reporter-shadowing consequences as
  [ADR 01091](./01091-junit-reporter.md) apply here (`registerReporter("markdown", fn)` is shadowed
  by the shorthand normalizer).
* Neutral, because the reporter logs `See Markdown summary at …` and deliberately avoids the
  substring `results at`, which the doc-detective GitHub Action parses out of stdout.

### Confirmation

[test/markdownReporter.test.js](../test/markdownReporter.test.js) asserts the table numbers equal
`results.summary` exactly, that a failing step's `resultDescription` appears while passing specs
are only counted, that pipes and newlines cannot break a table, that a synthetic 5,000-failure run
stays under the cap and ends with the truncation footer without producing a replacement character,
that an empty run yields a valid summary rather than an empty file, and every path-resolution and
write-failure branch. [test/reporters-cli.test.js](../test/reporters-cli.test.js) and
[test/core-artifacts/reporters/reporters.spec.json](../test/core-artifacts/reporters/reporters.spec.json)
prove the reporter is selectable end to end.

## Pros and Cons of the Options

### A. Compact, size-capped summary

* Good, because it fits the target surfaces and stays readable at any run size.
* Good, because collapsible `<details>` keeps detail available without cost to the skim.
* Bad, because very large runs are truncated (with an explicit footer).

### B. Full Markdown transcript

* Good, because nothing is omitted.
* Bad, because past 1 MiB GitHub rejects the upload outright — the result is no summary at all.
* Bad, because failures are buried in passing detail.

### C. Reuse the HTML reporter's rendering

* Good, because it would share one renderer.
* Bad, because `htmlReporter`'s escaping helpers are inert browser-JS strings, not Node-callable.
* Bad, because its output targets an interactive document, not a comment.
