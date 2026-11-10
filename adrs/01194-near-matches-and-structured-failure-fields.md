---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# Near matches and structured failure fields on failed steps

## Context and Problem Statement

A failed `find` said only "No elements matched selector or text." The author had to open the page and
guess what changed. Most such failures are drift: the docs say "Save" and the button now says "Save
changes." Agents that fix tests hit the same wall. They had nothing structured to tell drift from a
dead network or a real product bug.

The v5 rollout plan (item 1.1) asks for near matches on a failed `find` and a failure class on every
failed step. The reporters in #878 already read `resultHint` and `resultCode` when present. How should a
failed step describe what kind of failure it was, and what was close?

## Decision Drivers

* A person or an agent can act on a failure without opening the page.
* Collecting help never changes a step's result, and never fails a step on its own.
* One place classifies every failure, so every action and every reporter agrees.
* Report fields stay masked like the rest of the report (ADR 01178).
* Reuse the edit distance the CLI already uses for "did you mean."

## Considered Options

* **A. Near matches in `outputs`, plus `resultCode` and `resultHint` set where step reports are pushed.**
* **B. Append near matches to `resultDescription`.**
* **C. Each action sets its own failure class.**

## Decision Outcome

Chosen option: **A**, because it keeps the description short and gives scripts structured fields. It
also classifies every action in one place.

Behavior decided:

1. **Near matches.** When a browser `find` doesn't find its element, one `driver.execute` call collects
   the page's visible elements. Each candidate has its own text, an id, a `data-testid`, or an
   `aria-label`, up to 1,000 of them. Node ranks them against what the step asked for. That's the
   string form, or `elementText`, `elementAria`, `elementId`, `elementTestId`, then `selector` without
   a leading `#`. A `/regex/` gets none.
2. **Ranking.** Matching ignores case and collapses whitespace. An identical value ranks first. Next
   comes a label of up to 40 characters, or three times the target, that contains the target as whole
   words. Last comes a close spelling: one edit per three letters, using the CLI's edit distance.
   Within a tier, fewer edits win. The top three land in `outputs.nearMatches`, each as
   `{ text, tag, id, testId, ariaLabel }` with empty fields left out.
3. **Empty is meaningful.** A failed browser `find` always sets `outputs.nearMatches`. An empty array
   means nothing on the page was close. App surfaces don't set it.
4. **Never fails the step.** A driver that can't run the script, or a script that throws, gives an
   empty list.
5. **Inheritance.** `click` reports `find`'s outputs, so it inherits the field. A failed
   `dragAndDrop` reports the missing element's near matches. Annotations, a screenshot's `crop`, and
   `goTo`'s `waitUntil.find` report only their own message, so they pass `nearMatches: false` and skip
   the collector. `type` locates its element without `find`, so it has none.
6. **`resultCode`.** Every `FAIL` step report gets one of three values. Non-empty `nearMatches` is
   `drift`. A description that names a network, session, or blank-page error is `environment`.
   Anything else is `assertion`. Other results get no `resultCode`.
7. **`resultHint`.** A `drift` step's hint names the matches: ``Closest matches: `Save changes`,
   `Saved`.``
8. **Where.** `pushStepReport` classifies the report before `maskDeep`, so the hint and the near
   matches are masked like every other field.
9. **Schema.** `step_v3` declares `resultCode` (enum) and `resultHint` (string) as read-only report
   fields.
10. **Automatic recording.** ADR 01179 committed these fields to `contexts[].autoRecording` too.
    `mergeAutoRecording` runs the same classifier on the merged record, so a `FAIL` recording gets a
    `resultCode`. The `failureClass` that ADR 01179 names is `resultCode`; no separate field exists.
    `test_v3` declares both fields on `autoRecording`.
11. **Contract.** `resultCode` and `resultHint` join the result fields scripts can rely on in
    "Reporters and artifacts."

### Consequences

* Good: a failed `find` names what changed, and scripts can branch on `resultCode`.
* Good: one helper classifies every action's failures, including routing and runner markers.
* Bad: a failed browser `find` costs one more script round trip. It runs only on failure.
* Neutral: `environment` is a text match on the description. A message that names none of the
  patterns lands in `assertion`. If that misclassifies, the fix is error codes carried on the result.

### Confirmation

Red→green unit tests in `test/findElement.test.js` cover the ranking, the collector, and both `find`
call sites. Tests in `test/core-utils-coverage.test.js` cover `classifyStepFailure`. Focused cases in
`test/core-core.test.js` run a real browser: a renamed button reports `drift` with its hint, and a miss
with nothing close reports `assertion`. Fixtures can't carry these, since every case FAILs.
`src/common/test/strictKeys.test.js` accepts the new fields and rejects an unknown `resultCode`.
`test/run-artifacts.test.js` covers the recording's `resultCode`, and `src/common/test/validate.test.js`
its schema. `test/annotations-geometry.test.js` checks that annotations skip the collector.

## Pros and Cons of the Options

### A. Structured outputs plus fields set at push time

* Good: the description stays one sentence, and every reporter reads the same fields.
* Good: classification can't drift between actions.
* Bad: the classifier sees only the description and outputs, not the original error object.

### B. Append near matches to the description

* Good: no schema change.
* Bad: scripts and agents would parse prose, and the description gets long.

### C. Each action sets its own class

* Good: each action knows its own errors best.
* Bad: 20-plus actions to keep consistent, and routing markers would still need a fallback.
