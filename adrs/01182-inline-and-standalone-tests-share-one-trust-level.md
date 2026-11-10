---
status: accepted
date: 2026-11-09
decision-makers: doc-detective maintainers
---

# Inline and standalone tests share one trust level

## Context and Problem Statement

Doc Detective runs tests from two kinds of source. Standalone tests live in `*.spec.json` (or YAML)
files. Inline tests live in comments inside documentation source files. Both can hold any step,
including `runShell`, `runCode`, and `httpRequest`, so both can run arbitrary commands on the
machine that runs Doc Detective.

The November 2026 project review asked whether an inline test deserves less trust than a spec file,
because it hides in a doc comment. If so, it would be marked `unsafe` and skipped unless the user
opts in. The same review asked what protects a CI workflow from tests that a pull
request adds. The [v5 rollout plan](../docs/design/v5-rollout.md) settled both questions (settled
decisions 1 and 2, item 0.5). This ADR records them.

A third source exists. Default markup also detects tests from prose and code fences. A fenced
`bash`, `python`, or `javascript` block becomes a `runCode` step. The matcher also captures `py` and
`js` fences, but `runCode` doesn't accept those names, so detection skips them. An `http` fence, or
an unlabeled fence that starts with a request line such as `GET https://api.example.com/items`,
becomes an `httpRequest` step. Nobody wrote those blocks as tests. They're examples for readers.

## Decision Drivers

* A test is code the repository's authors wrote to run, whatever file format holds it.
* Format must never change how a step is treated. Otherwise, moving a test between a spec and a
  comment changes what it can do.
* Shell commands and code that nobody authored as a test must not run without an opt-in. Running
  the official Docker image counts as one.
* The real risk is untrusted changes running with secrets, and the CI configuration controls that,
  not Doc Detective.
* No code change and no new flag. Today's behavior already matches the decision.

## Considered Options

* **A. One trust level for authored tests, code fences stay `unsafe`, CI owns the boundary**
  (chosen).
* **B. Mark inline tests `unsafe` by default.**
* **C. Treat every shell, code, and HTTP step as `unsafe`, whatever its source.**

## Decision Outcome

Chosen option: **A**.

1. **Inline and standalone tests have one trust level.** An inline test is another way of writing a
   test, no different from a `*.spec.json`. Doc Detective doesn't apply `unsafe` because a step came
   from a comment. The `unsafe` gate in `src/core/tests.ts` reads the step's own `unsafe` field and
   the run's `allowUnsafeSteps`, and never the source format.
2. **Code fences stay gated.** The `runCode` markup in the default file types
   (`src/common/src/fileTypes.ts`) marks detected `bash`, `python`, and `javascript` fences
   `unsafe: true`, because nobody authored them as tests. A run skips those steps unless unsafe steps
   are allowed, through `allowUnsafeSteps`, `--allow-unsafe`, or the official Docker image. The image
   allows them by default, and `allowUnsafeSteps: false` turns that off. Decision 1 doesn't change
   any of this.

   The gate covers only those fences. The `httpRequestFormat` markup turns a detected HTTP request
   fence into an `httpRequest` step without `unsafe`, so a run sends that request by default.
   Steps detected from prose, such as links and UI text, aren't `unsafe` either. This ADR records
   that behavior as it stands and doesn't change it. `detectSteps: false` turns all detection off.
3. **Running Doc Detective on a repository runs that repository's tests**, the same way `npm test`
   runs its test suite. Whoever can change the tests can change what runs.
4. **The trust boundary is who can trigger a run with secrets.** That belongs to the CI
   configuration. On GitHub Actions, run tests on `pull_request`, which by default gives fork pull
   requests no secrets and a read-only token. A private repository, or its organization, can change
   that under **Fork pull request workflows** by sending write tokens or secrets to those runs. With
   either setting on, `pull_request` no longer keeps them from a contributor's tests. Never check
   out and run a pull request's code in a `pull_request_target` workflow. That trigger runs with the
   base repository's secrets and read/write `GITHUB_TOKEN`, even when no step uses a secret.
   `actions/checkout` also persists that token in the Git config by default.

### Consequences

* Good, because a test behaves the same wherever it's written.
* Good, because shell and code examples written for readers still can't run by accident outside
  the official Docker image.
* Bad, because the official Docker image allows unsafe steps by default. Detected code examples run
  there and can change mounted files, unless `allowUnsafeSteps` is `false`.
* Bad, because a detected HTTP request example still sends its request by default. One aimed at a
  real API with a write method changes that API on every run, unless detection is off.
* Good, because the advice users need is the same advice they already follow for `npm test`, and it
  lives where the risk is: the workflow trigger.
* Bad, because Doc Detective can't protect a workflow that hands secrets to untrusted code. The docs
  have to say so plainly.
* Neutral, because existing recipes already use `pull_request`, and no docs recipe or workflow in
  this repository uses `pull_request_target`.

### Confirmation

* No code changes. The `unsafe` check in `src/core/tests.ts` and the `runCode` markup's
  `unsafe: true` in `src/common/src/fileTypes.ts` already implement decisions 1 and 2.
* The GitHub Action guide (`docs/fern/pages/docs/ci/github-action.mdx`) has a "Tests are code"
  section with decisions 3 and 4. A reviewer confirms it names `pull_request` and warns against
  running pull request code in a `pull_request_target` workflow.
* Detected `runCode` fences are the one source whose steps default to `unsafe`. Adding another,
  such as HTTP request fences, needs a new ADR that supersedes this one.

## Pros and Cons of the Options

### A. One trust level, code fences gated, CI owns the boundary

* Good, because it matches how every test runner works. Nobody sandboxes `npm test` by file type.
* Good, because it needs no change to the runner or the schema.
* Bad, because the safety of a CI setup depends on the user's workflow, which Doc Detective can
  document but not enforce.

### B. Mark inline tests `unsafe` by default

* Good, because a test hidden in a comment couldn't run shell commands without an opt-in.
* Bad, because it doesn't protect anything. An attacker who can edit a doc comment can edit a
  `*.spec.json`, a config's `beforeAny`, or the workflow file itself.
* Bad, because every inline test author would have to set `allowUnsafeSteps`. That allows fenced
  code too, which removes the one gate that protects something.
* Bad, because format would change behavior, so moving a test from a spec into a doc would break
  it.

### C. Treat every shell, code, and HTTP step as `unsafe`

* Good, because no step could touch the system without an opt-in.
* Bad, because nearly every useful suite needs those steps, so everyone would turn the gate off,
  and it would stop meaning anything.
* Bad, because, as with B, the opt-in sits in files the same untrusted change can edit.
