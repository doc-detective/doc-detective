---
status: accepted
date: 2026-08-10
decision-makers: doc-detective maintainers
---

# Rebuild src/common/package-lock.json during the release prepare step

## Context and Problem Statement

`src/common/package-lock.json` is tracked in git and listed in the
`@semantic-release/git` assets in [.releaserc.json](../.releaserc.json), so every release commits
it. But the only thing that ever *wrote* to it was `npm version --workspace src/common` (via
[scripts/sync-common-version.js](../scripts/sync-common-version.js)), which rewrites the two
`version` fields and nothing else.

The dependency tree therefore never moved. Every `chore(release)` commit faithfully stamped a fresh
version onto a lockfile whose dependencies no longer satisfied its own `package.json`, and the file
accumulated drift release after release. On `main` at 4.37.4, `npm ci` inside `src/common` fails:

```text
npm error code EUSAGE
npm error Invalid: lock file's @apidevtools/json-schema-ref-parser@15.3.5 does not satisfy @apidevtools/json-schema-ref-parser@15.5.1
npm error Invalid: lock file's @types/node@25.9.2 does not satisfy @types/node@26.2.0
npm error Invalid: lock file's c8@11.0.0 does not satisfy c8@12.0.0
npm error Invalid: lock file's esbuild@0.28.0 does not satisfy esbuild@0.28.2
```

Nothing caught it because **CI never reads this file**.
[.github/workflows/test.yml](../.github/workflows/test.yml) runs `npm ci` at the repo root, with
`cache-dependency-path: package-lock.json`. It then runs the `src/common` scripts with
`working-directory: src/common`, against the hoisted workspace `node_modules`. The standalone
lockfile is a trap for anyone who runs `cd src/common && npm ci`. It looks maintained, because it
changes on every release.

### The npm workspace hazard

The obvious fix is to run `npm install --package-lock-only` inside `src/common`. It does the opposite
of what it appears to. npm walks up from the working directory, finds `workspaces: ["src/common"]` in
the root manifest, and treats the invocation as a workspace operation. It rewrites the **root**
`package-lock.json`, and leaves `src/common/package-lock.json` byte-identical. Measured on npm 10,
under node 22, the release job's runtime:

| invocation (cwd `src/common`) | root lockfile | common lockfile |
|---|---|---|
| `npm install --package-lock-only` | **rewritten** | unchanged |
| `npm install --package-lock-only --no-workspaces` | unchanged | **rebuilt** |

Since `@semantic-release/git` commits both files, the naive version would ship a root lockfile
silently rewritten by a step that was supposed to touch only `src/common`.

### The root lockfile is collateral

`npm version --workspace src/common` does not only stamp versions. It rewrites the **root**
`package-lock.json` as a side effect, and `@semantic-release/git` commits that too, unverified.

This is not hypothetical. The 4.37.4 release emitted a root lockfile missing
`conventional-commits-filter@6.0.1` and `conventional-commits-parser@7.1.2`. That broke `npm ci` on
`main` for every CI job, every contributor, and the release job itself. It was repaired by hand in
#705. Bisection put the breakage squarely on the `chore(release)` commit, rather than on the
dependency refresh that preceded it:

| commit | `npm ci` |
|---|---|
| `87786b2a`, `ci(vale): …` | OK |
| `b887754d`, `fix(lsp): … (#703)` | OK |
| `4bdbe34c`, `chore(release): 4.37.4` | **fails** |

A release step that rewrites a lockfile and commits it without ever checking that it installs is the
underlying defect, and it predates this ADR.

## Decision Drivers

* The committed lockfile should agree with the manifest beside it, or it should not be committed.
* The fix must not perturb the root lockfile, which gates `npm ci` for the whole repo and all of CI.
* Prefer self-healing over a one-time repair. A manual regeneration rots again by the next
  dependency bump.
* Keep the release pipeline's existing shape; this is a release-operations concern.

## Considered Options

1. **Rebuild the lockfile in the release prepare step**, in `sync-common-version.js`, immediately
   after the version stamp, using `--no-workspaces`.
2. **Delete `src/common/package-lock.json`** and drop it from the `@semantic-release/git` assets.
3. **Regenerate it by hand now** and add a CI job that runs `npm ci --no-workspaces` in
   `src/common` to keep it honest.

## Decision Outcome

Chosen option: **1**. `sync-common-version.js` now returns an ordered command plan from a pure
exported `buildSyncCommands(version, repoRoot)` and executes it:

1. `npm version <v> --workspace src/common --no-git-tag-version --allow-same-version` from the root.
2. `npm install --package-lock-only --ignore-scripts --no-audit --no-fund --no-workspaces` with cwd
   `src/common`.
3. `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` from the root, **twice**.
4. `npm ci --dry-run --ignore-scripts --no-audit --no-fund` from the root.

Order matters. Stamping first means the rebuilt lockfile carries the release version rather than
the previous one. The verification runs last, so it sees the final state.

Steps 3 and 4 address the root-lockfile collateral above. Measured on npm 10, under node 22, the
release job's runtime. Start from a root lockfile where `npm ci` passes. Running the step-1 stamp
*alone* leaves `npm ci` failing with `EBADPLATFORM`. The corruption is deterministic, not a one-off.
Without step 3, the repair in #705 would be undone by the very next release.

The two passes are the recipe already documented in
[docs/maintenance/release-operations.md](../docs/maintenance/release-operations.md). The second pass
drops the platform-gated `"extraneous"` entries that make `npm ci` fail on other OSes. Crucially
`--package-lock-only` resolves the tree *without* materializing `node_modules`, so it does not prune
the cross-platform optional set the way a plain `npm install` on a Linux runner would. Confirmed by
taking the Linux-produced lockfile and running `npm ci --dry-run` against it on Windows.

Step 4 is the backstop. `npm ci --dry-run` is the check every CI job performs, and it writes nothing.
It exits non-zero on any `Missing`, `Invalid`, or `EBADPLATFORM` entry. So if the reconcile ever
fails to produce an installable tree, the release stops rather than committing the damage.

The file is already in the `@semantic-release/git` assets, so no `.releaserc.json` or workflow
change was needed; the release job already invokes this script.

This makes the lockfile self-healing: a dependency bumped in `src/common/package.json` is reconciled
at the next release instead of waiting for someone to notice.

### Consequences

* Good: the committed lockfile matches its manifest from the next release onward; `cd src/common &&
  npm ci --no-workspaces` works.
* Good: a release now *repairs* the root lockfile instead of corrupting it. Verified end-to-end from
  the broken `main` state: `npm ci` fails with EUSAGE before the prepare step and passes after.
* Good: a release can no longer commit a root lockfile that fails to install. The class of failure
  that produced #705 stops the release, instead of landing on `main`.
* Neutral: step 4 can fail a release. That is the intent; the alternative is shipping the corruption.
  Recovery is the documented regeneration recipe, then re-running the release.
* Neutral: the root lockfile will now show real dependency churn in `chore(release)` commits rather
  than only version stamps. That churn was always happening, and was simply unverified.
* Good: no new workflow, job, or minutes. It's one extra npm resolve inside an existing step.
* Neutral: the first release after this lands carries a large one-time catch-up diff in
  `src/common/package-lock.json`, roughly 800 lines. It includes major transitive moves that
  accumulated while the file was frozen, such as `@types/node` 25→26 and `undici-types` 7→8.
* Neutral: the lockfile is only guaranteed correct *as of each release*. Between releases a fresh
  dependency bump leaves it stale until the next one. Acceptable: nothing in CI consumes it, and it
  self-corrects.
* Bad: it preserves a file that arguably should not exist, per option 2. If `doc-detective-common` is
  only ever installed as a workspace of the root package, this lockfile has no consumer and the
  honest fix is deletion. Option 1 was chosen because that call depends on whether standalone
  installs are meant to be supported. That's a product question this ADR does not settle.

### Confirmation

* A red→green integration check runs in a `node:22` container, against the tree as shipped on
  `main`. `npm ci --ignore-scripts --no-workspaces` inside `src/common` fails with the EUSAGE above
  before running the prepare step, and succeeds after.
* End-to-end from the broken `main` state (4bdbe34c), in the same container. `npm ci` at the root
  fails with EUSAGE before the prepare step, and passes after it. `npm ci --no-workspaces` in
  `src/common` passes too, with both manifests stamped to the release version.
* An isolation check on the step-2 flag. With `--no-workspaces` the root lockfile is untouched and
  `src/common`'s is rebuilt. Without it the two swap, which is the regression the unit test pins.
* Cross-platform check: the lockfile produced by the Linux reconcile passes
  `npm ci --ignore-scripts --dry-run` on a Windows host, confirming the optional-dependency tree
  survives the two passes.
* Unit tests in [test/sync-common-version.test.js](../test/sync-common-version.test.js) pin the
  command plan. That includes a dedicated case asserting `--no-workspaces` is present. Omitting that
  flag silently corrupts the root lockfile.

## Pros and Cons of the Options

### Option 1: rebuild in the release prepare step

* Good: self-healing; no new CI surface; the file is already a release-committed asset.
* Good: the `--no-workspaces` hazard is captured in a regression test rather than tribal knowledge.
* Bad: keeps a lockfile whose necessity is unproven.

### Option 2: delete the lockfile

* Good: removes the trap outright and is the simplest honest answer if standalone installs aren't
  supported.
* Bad: forecloses publishing/installing `doc-detective-common` standalone without a follow-up.
* Bad: a larger, more opinionated change than the reported problem warrants.

### Option 3: hand-regenerate plus a CI guard

* Good: the CI guard proves the file stays valid, which option 1 only implies.
* Bad: costs a job and minutes to protect a file nothing consumes.
* Bad: still needs a human to regenerate on every `src/common` dependency bump.
