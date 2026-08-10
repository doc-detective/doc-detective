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

```
npm error code EUSAGE
npm error Invalid: lock file's @apidevtools/json-schema-ref-parser@15.3.5 does not satisfy @apidevtools/json-schema-ref-parser@15.5.1
npm error Invalid: lock file's @types/node@25.9.2 does not satisfy @types/node@26.2.0
npm error Invalid: lock file's c8@11.0.0 does not satisfy c8@12.0.0
npm error Invalid: lock file's esbuild@0.28.0 does not satisfy esbuild@0.28.2
```

Nothing caught it because **CI never reads this file**. [.github/workflows/test.yml](../.github/workflows/test.yml)
runs `npm ci` at the repo root with `cache-dependency-path: package-lock.json`, then runs the
`src/common` scripts with `working-directory: src/common` against the hoisted workspace
`node_modules`. The standalone lockfile is a trap for anyone who runs `cd src/common && npm ci`,
while looking maintained because it changes on every release.

### The npm workspace hazard

The obvious fix — run `npm install --package-lock-only` inside `src/common` — does the opposite of
what it appears to. npm walks up from the working directory, finds `workspaces: ["src/common"]` in
the root manifest, and treats the invocation as a workspace operation: it rewrites the **root**
`package-lock.json` and leaves `src/common/package-lock.json` byte-identical. Measured on npm 10
(node 22, the release job's runtime):

| invocation (cwd `src/common`) | root lockfile | common lockfile |
|---|---|---|
| `npm install --package-lock-only` | **rewritten** | unchanged |
| `npm install --package-lock-only --no-workspaces` | unchanged | **rebuilt** |

Since `@semantic-release/git` commits both files, the naive version would ship a root lockfile
silently rewritten by a step that was supposed to touch only `src/common`.

## Decision Drivers

* The committed lockfile should agree with the manifest beside it, or it should not be committed.
* The fix must not perturb the root lockfile, which gates `npm ci` for the whole repo and all of CI.
* Prefer self-healing over a one-time repair — a manual regeneration rots again by the next
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
exported `buildSyncCommands(version)` and executes it: stamp the version, then
`npm install --package-lock-only --ignore-scripts --no-audit --no-fund --no-workspaces` with cwd
`src/common`. Order matters — stamping first means the rebuilt lockfile carries the release version
rather than the previous one.

The file is already in the `@semantic-release/git` assets, so no `.releaserc.json` or workflow
change was needed; the release job already invokes this script.

This makes the lockfile self-healing: a dependency bumped in `src/common/package.json` is reconciled
at the next release instead of waiting for someone to notice.

### Consequences

* Good: the committed lockfile matches its manifest from the next release onward; `cd src/common &&
  npm ci --no-workspaces` works.
* Good: no new workflow, job, or minutes — one extra npm resolve inside an existing step.
* Neutral: the first release after this lands carries a large one-time catch-up diff in
  `src/common/package-lock.json` (roughly 800 lines), including major transitive moves such as
  `@types/node` 25→26 and `undici-types` 7→8, that accumulated while the file was frozen.
* Neutral: the lockfile is only guaranteed correct *as of each release*. Between releases a fresh
  dependency bump leaves it stale until the next one. Acceptable: nothing in CI consumes it, and it
  self-corrects.
* Bad: preserves a file that arguably should not exist (option 2). If `doc-detective-common` is only
  ever installed as a workspace of the root package, this lockfile has no consumer and the honest
  fix is deletion. Option 1 was chosen because that call depends on whether standalone installs are
  meant to be supported — a product question this ADR does not settle.

### Confirmation

* Red→green integration check in a `node:22` container against the tree as shipped on `main`:
  `npm ci --ignore-scripts --no-workspaces` inside `src/common` fails with the EUSAGE above before
  running the prepare step, and succeeds after.
* Isolation check: after the prepare step, the root `package-lock.json` is byte-identical apart from
  the reconciliation `npm version` already performed (release 4.37.4 shows this pre-existing churn
  at 3250/273 lines, independent of this change).
* Unit tests in [test/sync-common-version.test.js](../test/sync-common-version.test.js) pin the
  command plan, including a dedicated case asserting `--no-workspaces` is present — the flag whose
  omission silently corrupts the root lockfile.

## Pros and Cons of the Options

### Option 1 — rebuild in the release prepare step

* Good: self-healing; no new CI surface; the file is already a release-committed asset.
* Good: the `--no-workspaces` hazard is captured in a regression test rather than tribal knowledge.
* Bad: keeps a lockfile whose necessity is unproven.

### Option 2 — delete the lockfile

* Good: removes the trap outright and is the simplest honest answer if standalone installs aren't
  supported.
* Bad: forecloses publishing/installing `doc-detective-common` standalone without a follow-up.
* Bad: a larger, more opinionated change than the reported problem warrants.

### Option 3 — hand-regenerate plus a CI guard

* Good: the CI guard proves the file stays valid, which option 1 only implies.
* Bad: costs a job and minutes to protect a file nothing consumes.
* Bad: still needs a human to regenerate on every `src/common` dependency bump.
