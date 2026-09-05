# Release & repository operations

Maintainer-facing operational knowledge: how merges actually gate, how to recover stuck releases,
and recipes for branch promotion and lockfile regeneration. Release *mechanics* (semantic-release,
channels, commit types) are documented in [../../CLAUDE.md](../../CLAUDE.md) and
[../../src/common/AGENTS.md](../../src/common/AGENTS.md); this file covers the operational
realities around them.

## Merge gating on `main`

- `main` has no classic branch protection. The gate is a repository **ruleset** ("main"). Its
  real blockers are `code_quality`, meaning CodeQL code scanning at severity=errors, plus a
  `pull_request` rule requiring 1 approving review. `require_code_owner_review` is vacuous, because
  there's no CODEOWNERS file. **CodeQL is the only CI signal that truly blocks merge.**
- Some checks look scary but don't block. The `review` check is the "Claude PR Review - Auto"
  workflow. It fails deterministically on very large pull requests. The prompt inlines the whole
  diff, so a PR with thousands of changed lines exceeds the model's input limit. The action then
  exits before any model call. The run reports `is_error: true` with `total_cost_usd: 0` and an
  empty `modelUsage`. GitHub renders that as "Claude encountered an error after 0s", with no
  diagnostic. So read the job log's result record before writing a red `review` off as a flake. It
  also fails on bot-authored head commits, because secrets aren't injected for bot-triggered runs.
  A red `review` check is not a merge blocker.
- **`vale` is a real gate.** It lints the whole repository on every PR, with `fail_on_error: true`
  and `filter_mode: nofilter`, per
  [ADR 01098](../../adrs/01098-vale-gates-the-whole-repo-and-fails-on-errors.md). So an
  error-severity alert anywhere in the tree turns the check red. It reports errors only, so run
  `vale --config=docs/.vale.ini <path>` locally to see warnings. Fix the prose, or add the term to
  the vocab below. The ruleset's blocker list omits it, so treat it as a blocker by convention.
- The repo owner (hawkeyexl) is admin: `gh pr merge <n> --merge --admin --delete-branch` bypasses
  the approval gate. `--delete-branch` prints a harmless "failed to delete local branch" when the
  branch is checked out in another worktree; the remote branch still gets deleted.
- Stale CodeQL on old branches clears by merging current `origin/main` into the branch.
  `reviewDecision: CHANGES_REQUESTED` persists even after fixes. Only an APPROVED review or a
  dismissal clears it. A later COMMENTED review does not.

## Promptless docs bot

- **The bot auto-resolves its own branch conflicts.** When `main` advances, `app/promptless`
  pushes a "Resolve base-branch merge conflicts" commit onto its own PR branch. Prefer waiting for
  the bot; if resolving manually, `git reset --hard origin/<branch>` first to absorb the bot's
  commit and avoid a push race.
- **PRs arrive as stacked chains.** Some Promptless PRs target another Promptless branch, not
  `main`; each child branch is cumulative (the top holds everything). Don't merge a stack
  bottom-up with squash. Instead: fix all issues on the top branch, retarget it
  (`gh api -X PATCH .../pulls/<top> -f base=main`), merge that one, and close the rest as "rolled
  up into #<top>".
- **Draft PRs usually document an unmerged feature PR.** Do not merge them until the feature
  lands. Documenting unmerged behavior is the #1 Promptless failure mode. Also watch for
  superseded drafts whose docs already shipped inside a feature PR, and close those.
- **Verify every concrete claim against source.** The bot hallucinates: wrong CLI subcommands,
  inverted precedence, non-existent shorthands, wrong output namespaces. Review the PR's net
  change against current main (`git diff origin/main...origin/<branch>`), not the whole file. Main
  often already moved ahead.
- **Vale vocab path (version-dependent):** with Vale 3.x pinned in `.github/workflows/vale.yml`,
  the active accepted-spelling list is `docs/.vale/styles/config/vocabularies/Docs/accept.txt`;
  terms added only to the legacy `docs/.vale/styles/Vocab/Docs/accept.txt` do nothing. Safest is
  to add new terms to both until the legacy dir is deleted. `docs/.vale.ini` (the config the
  workflow runs, through `--config=docs/.vale.ini`) exempts generated schema reference pages. Fix
  prose flagged there at the JSON-schema source under `src/`, not the generated `.md`. Note that
  reviewdog re-posts stale annotation batches per push. Verify HEAD is actually clean before
  assuming a real miss.

## `next` → `main` promotion

- The commitlint workflow validates the **entire `base.sha..head.sha` range** on a PR, so a
  promotion PR re-lints every commit in `main..next`. Non-conventional direct commits (often made
  via the GitHub web UI) resurface as failures only at promotion time. Squash-merge bodies used to
  trip `body-max-line-length` too, because GitHub concatenates the branch's commit messages into
  the squash body, which is never linted pre-merge. `commitlint.config.cjs` now disables body and
  footer line length for this reason. Don't re-enable it.
- Pre-check before opening the PR: `npx commitlint --from origin/main --to origin/next`. Fix
  headers by rewording in place (`filter-branch --msg-filter` keyed on `$GIT_COMMIT` preserves
  bodies byte-for-byte) and force-pushing.
- `next` is routinely rewritten/force-pushed and its prerelease tags can be orphaned — rewording
  its history doesn't worsen tag state. A ruleset ("must be a PR") fires on force-push and is
  bypassed with admin rights. The CLA check flags `semantic-release-bot` commits; a promotion PR
  typically needs an admin merge.

## Stuck `@latest` releases

The release pipeline promotes `@latest` only after `promote.yml`'s "Smoke-test staged release" job
passes. If that job fails, the version is published to `staging-<version>` (and `@next`) but
`@latest` silently stays behind.

- **Detect:** run `npm view doc-detective dist-tags`. `latest` lagging behind a `staging-<version>`
  entry means the promote job failed. Read the failed run's smoke-test job log.
- **Recover:** fix the cause on `main`, then run `gh workflow run promote.yml -f version=<X.Y.Z>`.
  The smoke→promote→docker chain re-runs, and the promote step is an idempotent
  `npm dist-tag add`.
- One historical example: a committed screenshot baseline (`reference.png`) drifted from what
  headless Chrome captures on CI, and blocked two releases. It was removed in #395. Keep smoke-test
  fixtures baseline-free. The smoke test's purpose is exercising the action end-to-end, not visual
  regression.

## Promoting stale `claude/*` feature branches

Feature branches forked before major `main` work landed will silently **delete** that work if you
promote them with `git reset --soft main` + commit (it snapshots the branch's stale tree).

Correct flow: `git branch backup <tip>` → `git reset --hard main` → `git merge --squash backup` →
resolve conflicts → build/test → one clean conventional commit. This 3-way merges the feature onto
main and preserves everything the branch predates.

To force a non-major release when a branch carries `refactor!:` or `fix!:` commits, squash into a
single non-`!` commit. semantic-release reads every commit merged to main, so the `!` history
must not survive.

Windows gotcha: `npm run build:common` rewrites generated schema and type files with CRLF. That's
harmless, because `core.autocrlf=true` normalizes on `git add`. Verify with
`git diff --cached --stat --ignore-cr-at-eol`.

## Cross-platform lockfile regeneration

`package-lock.json` must contain the full cross-platform optional-dep tree or CI's `npm ci` fails
with `EUSAGE … Missing: <pkg> from lock file`. A Windows `npm install` prunes platform-inapplicable
optionals, consistently `appium` and `proxy-agent`, plus other platforms' nested `@img/sharp-*`
binaries. The lockfile looks fine locally but breaks Linux CI.

Before regenerating anything, run **`git diff origin/main -- package.json` first.** A stale branch
manifest masquerades as a lockfile break. One example is a dependency line main deliberately moved
to `ddRuntimeDependencies`. Main's lockfile may never have been wrong.

Regeneration recipe (Docker, repo mounted; on Windows Bash prefix commands with
`MSYS_NO_PATHCONV=1`):

1. Start from a complete base (`git checkout origin/main -- package-lock.json`).
2. Work in a **`node:22`** container, because CI's setup-node bundles npm 10 and npm 11 builds a
   different ideal tree. Copy `package.json` and `src/common` to a scratch dir, then run
   `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` **twice**. The second
   reconcile pass drops platform-gated `"extraneous"` entries that make `npm ci` fail with
   EBADPLATFORM on other OSes. A reconcile-only pass over an incomplete lockfile is NOT
   sufficient.
3. Validate before committing: fresh-copy `npm ci --ignore-scripts` in Linux containers under
   node:22 AND node:24, plus `npm ci --ignore-scripts --dry-run` on the Windows host.

Local-dev workaround while a lockfile is broken: `npm install --no-save --package-lock=false`.
Commit only `package.json`/lockfile/src-common dep changes; discard generated-file CRLF churn.

### `npm version --workspace` corrupts the root lockfile

`npm version <v> --workspace src/common` rewrites the **root** `package-lock.json` as a side effect,
and the tree it emits does not install. Measured on npm 10 (node 22): from a root lockfile where
`npm ci` passes, the stamp alone leaves `npm ci` failing with `EBADPLATFORM`.

This broke `main` three times, at 4.37.4, 4.37.5, and 4.38.0. The same two
`"optional": true, "peer": true` entries under `@commitlint/read/node_modules/` were pruned each time.
`@semantic-release/git` committed the result unverified, and `npm ci` failed for every job and every
contributor.

4.37.4 was repaired by hand in #705. 4.37.5 was repaired by *accident*. #702, an unrelated reporters
feature, happened to carry a lockfile regenerated from a healthy tree, and merging it restored the
entries. That merge is also what triggered the 4.38.0 release, which pruned them again about four
hours later. The accidental repair and the next breakage were the same event.

**If you find `main` red this way, regenerate deliberately using the recipe above.** Waiting for
another PR to carry a healthy lockfile is not a plan; it happened once, by chance, and it did not
last a day.

[scripts/reconcile-root-lockfile.js](../../scripts/reconcile-root-lockfile.js) reconciles (two
`--package-lock-only` passes) and then verifies (`npm ci --dry-run`) as the **last** prepare step
before `@semantic-release/git` commits. **If you ever run `npm version --workspace` by hand, run the
two-pass reconcile afterward and verify with `npm ci` before committing.**

That ordering is load-bearing, and getting it wrong is how 4.37.5 broke despite a guard being in
place (ADR 01093). The reconcile originally lived in `sync-common-version.js`, which runs *before*
`@semantic-release/npm` stamps the root version. The check therefore passed, and the lockfile was
rewritten afterward. **Any new lockfile check must be wired after every plugin that stamps a version.** A unit
test asserts that position in `.releaserc.json`, so reordering the plugin list fails the suite.

### The src/common lockfile is release-managed

`src/common/package-lock.json` is rebuilt on every release by
[scripts/sync-common-version.js](../../scripts/sync-common-version.js) (ADR 01091), so you normally
don't touch it. Bump `src/common/package.json`, and the lockfile catches up at the next release.

If you must regenerate it by hand, run npm from inside `src/common` **with `--no-workspaces`**:

```bash
cd src/common && npm install --package-lock-only --ignore-scripts --no-audit --no-fund --no-workspaces
```

Without `--no-workspaces` npm walks up, finds `workspaces: ["src/common"]` in the root manifest, and
rewrites the **root** `package-lock.json` while leaving `src/common`'s byte-identical. That's the
inverse of what you asked for. The same trap applies when verifying. `npm ci` inside `src/common`
validates the *root* lockfile unless you pass `--no-workspaces`.

## Working in git worktrees

Worktrees have no `node_modules`, so the husky `commit-msg` hook's `npx commitlint` fails ("npx
canceled … commitlint") even on a conventional message. Run `npm i` in the worktree (restore any
`package-lock.json` drift afterward). Never use `--no-verify`.
