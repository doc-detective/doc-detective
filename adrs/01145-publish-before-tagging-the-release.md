---
status: accepted
date: 2026-10-30
decision-makers: doc-detective maintainers
---

# Publish to npm before tagging the release

## Context and Problem Statement

semantic-release runs `prepare`, then creates and pushes the release tag, then runs `publish`.
[.releaserc.json](../.releaserc.json) wired
[scripts/publish-staged-release.js](../scripts/publish-staged-release.js) as a `publishCmd`. By
the time `npm publish` ran, `@semantic-release/git` had already pushed the
`chore(release): X.Y.Z` commit, and semantic-release had pushed `vX.Y.Z`.

From 4.38.2 to 4.41.3, every release failed at that publish. First came `E404` from an expired
`NPM_TOKEN`. Then came `EOTP`: the replacement token still had to complete 2FA. The release
job went red each time, but git recorded every one of those versions as released. Their tags and
CHANGELOG entries exist, while npm stayed on 4.38.1. Rerunning the workflow can't recover any of
them. semantic-release finds the tag, sees no new commits, and releases nothing. The only ways
forward were to merge another `fix:` commit, which cut the *next* version, or to publish by hand.

A failed publish should leave the repository as if the release never started.

## Decision Drivers

* A failed publish must not push a release commit, tag, or GitHub release, so a rerun retries the
  same version.
* A lockfile that fails the [ADR 01093](01093-verify-the-root-lockfile-as-the-last-prepare-step.md)
  verification must still stop the release before anything reaches npm.
* Keep `publish-staged-release.js` unchanged. Its already-published path makes a retry of a
  partially published version safe.

## Considered Options

1. **Run the publish as a `prepareCmd` after the lockfile reconcile and before
   `@semantic-release/git`.**
2. **Keep the `publishCmd` and add a `verifyConditions` preflight** such as `npm whoami`.
3. **Keep the `publishCmd` and undo the release on failure**: delete the tag and revert the release
   commit from a `fail` step.
4. **Switch to npm trusted publishing (OIDC)** in place of `NPM_TOKEN`.

## Decision Outcome

Chosen option: **1**. The publish moves to its own `@semantic-release/exec` entry, placed right
after the reconcile entry and before `@semantic-release/git`. Plugin `prepare` steps run in list
order, so a failed publish fails `prepare` and semantic-release stops before it commits, tags, or
pushes.

Retrying is only safe while the version is unused on npm, which never accepts a version twice.
[scripts/publish-guard.js](../scripts/publish-guard.js) decides what a failure means:

* **Nothing reached npm:** `prepare` fails. No tag, and a rerun retries the same version.
* **Either package already holds the version:** the version is spent. `prepare` records the
  failure and exits 0, so semantic-release tags the version and the next release moves past it.
  The entry's `publishCmd` then fails the release. No GitHub release is created, and `promote`
  doesn't run.

Reusing an already-published version also requires npm's recorded `gitHead` to match
`GITHUB_SHA`. That's the commit a crash-interrupted release was building. Otherwise the script
refuses, and the version counts as spent.

### Consequences

* Good: a failed publish that reached nothing leaves no release commit, tag, or GitHub release.
  After fixing the cause, re-run the Release workflow on the failed branch, and it retries the
  same version.
* Good: a partly published version is never reused for a later commit, and never strands the
  pipeline on a version npm can't accept again.
* Good: a lockfile that fails verification still stops the release before npm sees it.
* Neutral: the job fails, but an `exec` failure isn't a semantic-release error, so
  `@semantic-release/github` opens no failure issue. The old `publishCmd` behaved the same way.
* Neutral: a spent version is tagged with only some of its packages on npm, as every failed
  release was before this change. It isn't promoted. Publish the missing package by hand only if
  that exact version matters.
* Bad: only a real release exercises the new ordering. The tests cover the configuration and the
  guard, not npm or git.

### Confirmation

* [test/release-config.test.js](../test/release-config.test.js) asserts that no `publishCmd` runs
  `publish-staged-release.js`, and that its `prepareCmd` sits after the reconcile and before
  `@semantic-release/git`, with `publish-guard.js` as its `publishCmd`. The test failed on the old
  wiring.
* [test/publish-guard.test.js](../test/publish-guard.test.js) covers the unused, spent, and
  `gitHead`-mismatch outcomes.
* `publish-staged-release.js` ran against a stubbed `npm` in five scenarios: nothing published,
  root published but common failed, reuse from another commit, reuse from the same commit, and
  success. Each produced the outcome above and restored `package.json`.
* semantic-release 25.0.9's `index.js` runs `plugins.prepare`, then `tag` and `push`, then
  `plugins.publish`. It calls `fail` plugins only for its own errors. That source, not the docs, is
  what this decision relies on.
* The release that ships this change is the first one to run the new ordering.

## Pros and Cons of the Options

### Option 1: Publish during prepare

* Good: fixes the ordering itself, so it covers every publish failure: auth, registry outage, or
  the script's own `optionalDependencies` guard.
* Neutral: needs the spent-version rule, because npm can now be ahead of git after a partial
  failure.

### Option 2: verifyConditions preflight

* Good: fails before anything is pushed when the token is invalid.
* Bad: `npm whoami` succeeds for a token that still needs an OTP to publish, so it would have
  missed the `EOTP` failure. It catches nothing outside authentication.

### Option 3: Undo the release on failure

* Bad: rewrites `main` and deletes a pushed tag after the fact, racing any merge that lands
  meanwhile.
* Bad: adds a second failure mode, an undo that itself fails partway.

### Option 4: Trusted publishing

* Good: removes the token, and with it the `E404` and `EOTP` failures.
* Bad: does nothing for publish failures unrelated to authentication.
* Bad: needs per-package setup on npmjs.com. It complements option 1 rather than replacing it.
