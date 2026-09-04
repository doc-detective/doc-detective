---
status: accepted
date: 2026-09-04
decision-makers: [hawkeyexl]
---

# Vale gates the whole repository and fails the check on any error

## Context and Problem Statement

The Vale style check ([.github/workflows/vale.yml](../.github/workflows/vale.yml)) was advisory. It
ran `vale-cli/vale-action` with `fail_on_error: false`, so an error-severity alert produced a
review comment and a green check. [docs/maintenance/release-operations.md](../docs/maintenance/release-operations.md)
recorded that plainly: "a red `review` or vale annotation is not a merge blocker."

It was also scoped. [ADR 01089](01089-vale-changed-files-as-json-array.md) wired
`tj-actions/changed-files` into the action as a JSON array, so a PR linted only the Markdown files
it touched. That scoping existed for one reason. The repository carried pre-existing
error-severity findings in untouched files, and a whole-repo lint turned unrelated PRs red.

Both constraints are now gone. Every tracked `.md`, `.mdx`, and `.txt` file in the repository is
Vale-clean at error severity, including the 283 decision records under [adrs/](.). The question is
what the check should do now that a clean tree makes a hard gate affordable.

## Decision Drivers

* A style gate that cannot fail is documentation, not a gate. Prose quality regressions currently
  merge with a green check.
* Scoping to changed files leaves the rest of the tree unwatched. A file can regress through a
  refactor, a generated-page rebuild, or a merge, and nothing notices until someone edits it.
* The changed-file plumbing is the single most fragile part of the workflow. ADR 01089 documents a
  silent fallback that shipped broken for months, and its `escape_json: false` coupling is still
  one edit away from re-breaking.
* A gate must be honest about what it measured. Reporting only alerts on added lines, then claiming
  the whole repository passed, is worse than not gating.

## Considered Options

* **A. Lint the whole repository and fail on any error** (chosen). Drop the changed-file plumbing,
  pass `files: all`, and set `fail_on_error: true` with `filter_mode: nofilter` and
  `--minAlertLevel=error`.
* **B. Keep changed-file scoping, add `fail_on_error: true`.** A smaller change that gates only
  what a PR touched.
* **C. Keep the workflow advisory.** Rely on authors and reviewers to read the annotations.

## Decision Outcome

Chosen option: **A**. Option **B** gates half the tree and keeps the plumbing that failed silently
once already, so a regression in an untouched file still merges green. Option **C** is the status
quo the clean tree was bought to replace.

Five inputs carry the decision, and each is load-bearing:

* **`files: all`** is vale-action's sentinel for `.`, so there is no changed-file list to marshal.
  The `tj-actions/changed-files` step, its `json`/`escape_json` coupling, and the
  `if: any_changed == 'true'` guard all come out. The failure mode ADR 01089 documents cannot
  recur, because there is no list to mis-parse.
* **`fail_on_error: true`** turns an error-severity alert into a failed check.
* **`filter_mode: nofilter`** is what makes the previous input mean anything. reviewdog's default
  filter is `added`, which reports only alerts on lines the PR added. Under a whole-repo lint that
  would silently discard every alert in an untouched file, and `fail_on_error` would never trip.
  The pair is the gate; either one alone is theatre.
* **`--minAlertLevel=error`** in `vale_flags` is what keeps `nofilter` survivable.
  `docs/.vale.ini` sets `MinAlertLevel = suggestion`, which is right for a local run and was
  harmless while scoping and the `added` filter kept the volume down. Under whole-repo plus
  `nofilter` it would hand reviewdog roughly 4,200 warnings and suggestions from across the tree to
  post as PR comments. Emitting only errors keeps the comment volume to exactly what the gate
  fails on. Warnings stay available to anyone who runs Vale locally.
* The **`pull_request` trigger loses its `paths:` filter.** A check that is skipped on some PRs
  cannot be a required status check, and the job is seconds of runner time.

The glob excludes two trees. The generated schema reference pages stay excluded, as before. Those
are generated from JSON Schema descriptions, and mdx2vast has produced a hard `E100` parse error on
their tables that `fail_on_error` cannot downgrade. `docs/.vale.ini` already clears every style for
them; the glob keeps them out of the parse as well.

`docs/.vale/**` is new, and whole-repo scope is what makes it necessary. That directory is Vale's
own `StylesPath`. Invoked from the repo root against `.`, Vale walks it as ordinary content and
lints the vocabulary word lists, where `Direct.Length` reads
`docs/.vale/styles/config/vocabularies/Docs/accept.txt` as one 252-word sentence. Those files are
machine-managed config, not prose. Changed-file scoping never reached them, so this hazard only
appears once the lint covers the repository.

### Consequences

* Good: a prose regression anywhere in the repository fails the PR that introduced it, instead of
  waiting for someone to edit that file.
* Good: the workflow drops a third-party action, an ~30-line comment about its input quirks, and a
  conditional. What remains is a checkout, an mdx2vast install, and one Vale run.
* Good: the check now runs on every PR, so it can be adopted as a required status check.
* Bad, and accepted: an error the PR under review did not introduce still fails that PR. It might
  arrive through a merge from `main`, or through a regenerated page. The tree is clean at this
  decision, so the first such failure is a real regression rather than inherited debt.
* Bad, and accepted: whole-repo linting is slower than changed-file linting. Measured locally, one
  pass over all 550 tracked `.md`, `.mdx`, and `.txt` files takes seconds, which is noise against
  the checkout and the mdx2vast install.
* Neutral: reviewdog can only post inline review comments on lines in the PR's diff. Alerts
  elsewhere land in the check output rather than as comments. The check still fails.
* Neutral: warning and suggestion alerts no longer appear as PR comments. Under changed-file
  scoping they did, for the handful of files a PR touched. Whole-repo scope makes that volume
  untenable, so warnings move to the local `vale` run.
* **Supersedes [ADR 01089](01089-vale-changed-files-as-json-array.md) in full.** That decision
  existed to make changed-file scoping work. This one removes changed-file scoping.

### Confirmation

* The whole tree is clean, verified against a pristine export rather than the working tree. Extract
  `git archive HEAD` into a scratch directory, so there is no `node_modules` to confuse the walk,
  then run the workflow's exact command from its root. It reports **0 errors** in 445 files. That's
  the precondition the gate depends on, and it is what the rest of this change delivered.
* The `docs/.vale/**` exclusion is red→green against that same export. Without it the run reports
  **2 errors**, both `Direct.Length` on vocabulary word lists, which is exactly how the check failed
  on ba882f8c. With it the run is clean. Linting a filtered file list from the working tree hid
  this, because the filter dropped `docs/.vale/` and `node_modules` was present. Reproduce the CI
  invocation, not an approximation of it.
* [test/vale-workflow.test.js](../test/vale-workflow.test.js) pins the new contract. It asserts
  `files: all`, `fail_on_error: true`, `filter_mode: nofilter`, and `--minAlertLevel=error` on the
  "Run vale" step. It also asserts that no `changed-files` step or `separator` input survives, and
  that the `pull_request` trigger carries no `paths:` filter. Finally, it re-implements
  vale-action's `lib/input.js` resolution to show that `all` resolves to `.`, the whole-repo
  argument.
* Post-merge, the "Run vale" step log shows a single `.` argument and no
  `falling back to 'all'` warning. A deliberately introduced error-severity alert in a file the PR
  does not touch fails the check.

## Pros and Cons of the Options

### A. Whole repository, fail on error (CHOSEN)

* Good: nothing in the tree is unwatched, and nothing merges past an error.
* Good: it deletes the workflow's most fragile machinery rather than hardening it.
* Bad: a PR can fail for an error it did not introduce, if one arrives through a merge or a
  regenerated page.

### B. Changed-file scoping, fail on error

* Good: a failing check always names something the PR touched.
* Bad: it gates only the diff. A regression in an untouched file merges green, which is the gap
  this decision exists to close.
* Bad: it keeps the `changed-files` plumbing, whose silent fallback ADR 01089 documents.

### C. Stay advisory

* Good: zero risk of a surprising red check.
* Bad: the clean tree it would sit on has no way to stay clean. The next error-severity alert
  merges, and the one after that, until scoping is the only thing keeping PRs green.
