---
status: accepted
date: 2026-08-11
decision-makers: doc-detective maintainers
---

# Reconcile and verify the root lockfile as the last prepare step

## Context and Problem Statement

Two consecutive releases committed a root `package-lock.json` that does not install, breaking `main`
for every CI job and every contributor:

| release | symptom | repaired in |
|---|---|---|
| 4.37.4 | `npm ci` → `EUSAGE Missing: conventional-commits-filter@6.0.1` | #705 |
| 4.37.5 | identical | #707 |

Both times the same two `"optional": true, "peer": true` entries under
`@commitlint/read/node_modules/` were pruned from the tree.

[ADR 01091](01091-rebuild-the-common-lockfile-during-release.md) added a root reconcile and an
`npm ci --dry-run` backstop to [scripts/sync-common-version.js](../scripts/sync-common-version.js),
and 4.37.5 was the first release to run it. **It still shipped a broken lockfile**, and the
verification passed on the way through.

### Why the guard did not fire

semantic-release runs each plugin's `prepare` in plugin order. The relevant slice of
[.releaserc.json](../.releaserc.json) was:

```text
@semantic-release/changelog     prepare
@semantic-release/exec          prepare -> sync-common-version.js   <- reconcile + verify lived here
@semantic-release/npm           prepare -> npm version (root)       <- rewrites the lockfile again
@semantic-release/exec          publish
@semantic-release/git           prepare -> commits the assets
```

The reconcile and verification ran *before* `@semantic-release/npm` stamped the root version. That
stamp rewrites `package-lock.json` as a side effect, after the check had already passed. The
verification was structurally incapable of seeing the state that actually got committed.

A guard that runs before the last writer is not a guard.

## Decision Drivers

* Whatever verifies the lockfile must observe the exact bytes `@semantic-release/git` will commit.
* Prefer a structural fix over widening the earlier guard — any future plugin that stamps a version
  would defeat a guard placed before it.
* Keep the concerns separable: the `src/common` lockfile and the root lockfile fail for different
  reasons and are fixed by different commands.

## Considered Options

1. **Move root reconciliation into its own script, wired as the last `prepare` before
   `@semantic-release/git`.**
2. **Widen the existing `sync-common-version.js` guard** to also run after the npm plugin — not
   expressible; a plugin's `prepareCmd` runs once, at its position in the sequence.
3. **Drop `package-lock.json` from the `@semantic-release/git` assets** so releases never commit it.
   Leaves the committed lockfile permanently stale against released versions.
4. **Verify in a post-release CI job** and alert. Detects the breakage instead of preventing it;
   `main` is already broken by then — which is exactly the state this ADR exists to end.

## Decision Outcome

Chosen option: **1**. Root reconciliation and verification move to
[scripts/reconcile-root-lockfile.js](../scripts/reconcile-root-lockfile.js), wired as a `prepareCmd`
on the `@semantic-release/exec` entry that already sits between `@semantic-release/npm` and
`@semantic-release/git`. Nothing rewrites the lockfile after it runs.

`sync-common-version.js` keeps only what it can validly own: stamping the `src/common` version and
rebuilding that workspace's own lockfile. Its root-lockfile steps are removed rather than left as
dead weight that implies a guarantee it cannot provide.

The mechanics are unchanged from ADR 01091 — two `--package-lock-only` passes (the second drops the
platform-gated `"extraneous"` entries that fail `npm ci` with EBADPLATFORM elsewhere), then
`npm ci --dry-run` as a non-mutating backstop that stops the release rather than committing damage.

### Consequences

* Good: the committed root lockfile is verified in the state it is committed in.
* Good: robust against future plugin additions, as long as the reconcile stays last. A unit test
  asserts its position in `.releaserc.json` relative to the npm and git plugins, so reordering the
  plugin list fails the suite rather than silently reintroducing this bug.
* Neutral: a release can now fail at prepare. That is the intent; recovery is the regeneration
  recipe in [docs/maintenance/release-operations.md](../docs/maintenance/release-operations.md)
  followed by re-running the release.
* Bad: this is the second attempt at the same defect. The first shipped because it was validated in
  isolation — running the script by hand against a checkout — rather than against the real plugin
  sequence. The wiring test exists so the *ordering*, not just the script, is covered.

### Confirmation

* Unit tests in [test/reconcile-root-lockfile.test.js](../test/reconcile-root-lockfile.test.js)
  pin the command plan and assert the `prepareCmd` sits after `@semantic-release/npm` and before
  `@semantic-release/git` in `.releaserc.json`.
* [test/sync-common-version.test.js](../test/sync-common-version.test.js) asserts that script no
  longer issues any root-directory `install` or `ci`, so the responsibility cannot drift back.
* The repaired 4.37.5 lockfile installs under node:22 and node:24 Linux.
* Residual risk, stated plainly: the end-to-end behavior of the *new ordering* is only exercised by
  a real release. Local replays of the prepare sequence — including with `node_modules` present, as
  in the release job — did not reproduce the pruning, so the next release is the real test. The
  backstop is designed to fail the release rather than commit a bad lockfile if it recurs.
