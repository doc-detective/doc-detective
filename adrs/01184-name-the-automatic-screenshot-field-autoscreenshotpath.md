---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Name the automatic screenshot field `autoScreenshotPath`

Amends [ADR 01149](01149-declare-the-report-contract.md).

## Context and Problem Statement

`autoScreenshot` names two things. On a config, spec, or test, it's the boolean setting that turns automatic
screenshots on or off ([ADR 01177](01177-capture-screenshots-and-recordings-by-default.md)). On a step result,
it's the path of the screenshot taken after that step.

That overlap misleads authors. `step_v3` declares the result field as a string, and validation coerces `false` to
`"false"`. So `"autoScreenshot": false` on a step validates, looks like a per-step opt-out, and changes nothing.
The step still takes its screenshot.

`assertion_v3` also declares `expected`, `actual`, and `description`. The runner never writes them, and no reader
reads them. The report contract (ADR 01149) promises fields that never appear.

What should the result field be called, and what should the schema declare?

## Decision Drivers

- A key means one thing wherever it's written.
- A setting that does nothing should fail validation, not pass silently ([ADR 01150](01150-reject-unknown-keys-on-specs-and-steps.md)).
- The report schema declares what the runner writes, and nothing else.
- Version 5 is the one chance to rename a result field without an alias.

## Considered Options

- **A. Rename the step result field to `autoScreenshotPath`, with no alias.**
- **B. Keep the name, and make a step's boolean `autoScreenshot` a real per-step opt-out.**
- **C. Keep the name, and reject a boolean on a step.**

## Decision Outcome

Chosen option: **A**.

- The runner writes the screenshot's path, relative to `runDir`, to the step's `autoScreenshotPath`. It writes
  no `autoScreenshot` on a step.
- `step_v3` declares `autoScreenshotPath`, with the old field's pattern and `readOnly`. It no longer declares
  `autoScreenshot`, so a step that sets it has an unknown key. Validation fails, and the run exits `2`.
  The message is the unknown-key one from ADR 01150, for `tests[0].steps[0]`.
- To turn screenshots off, set `autoScreenshot` on the test, spec, or config. Those keys don't change.
- The HTML, Markdown, JUnit, and terminal reporters and the hints read `autoScreenshotPath` only. A report from
  version 4 shows no automatic screenshots in a version 5 reporter.
- `assertion_v3` declares `statement`, `source`, and `result` only. A record with `expected`, `actual`, or
  `description` is invalid.
- Report output fields are renamed outright, per the rename rule in `CLAUDE.md`. The upgrade guide lists the rename.

### Consequences

- Good: `autoScreenshot` is only ever a setting, and a step can't set it by mistake.
- Good: the name says the field holds a path, like `recordingPath` and `screenshotPath`.
- Good: `assertion_v3` matches what the runner writes.
- Bad: a script that reads a step's `autoScreenshot` reads `undefined` until it moves to `autoScreenshotPath`.
- Bad: a spec with `autoScreenshot` on a step stops validating. It never worked, so the fix is to move the key.

### Confirmation

- `src/common/test/validate.test.js`: a step accepts `autoScreenshotPath` and rejects bad paths. It rejects
  `autoScreenshot` as `false`, `true`, or a path. An assertion record rejects each removed field.
- `test/auto-screenshot-surface.test.js`: a headless Chrome run writes `autoScreenshotPath`, its file exists, and
  the step has no `autoScreenshot`.
- `test/reporters-model.test.js`, `test/htmlReporter.test.js`, and `test/hints.test.js`: the readers use
  `autoScreenshotPath` and ignore the old name.
- Fixtures: `cli/strict-keys.spec.json` exits `2` on a step's `autoScreenshot`, and `cli/auto-capture.cjs` checks
  `autoScreenshotPath` on every UI step.

## Pros and Cons of the Options

### A. Rename to `autoScreenshotPath`

- Good: the setting and the result no longer share a name.
- Good: the per-step mistake fails loudly, through the unknown-key check that already exists.
- Bad: report consumers have to rename one read.

### B. A per-step opt-out

- Good: a step could skip its screenshot.
- Bad: a new feature no one asked for, under a name that still means two things.

### C. Reject a boolean on a step

- Good: no rename.
- Bad: the key still means a setting in one place and a path in another, and the error would have to explain why.
