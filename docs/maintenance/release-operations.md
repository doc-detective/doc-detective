# Release & repository operations

Maintainer-facing operational knowledge: how merges actually gate, how to recover stuck releases,
and recipes for branch promotion and lockfile regeneration. Release *mechanics* (semantic-release,
channels, commit types) are documented in [../../CLAUDE.md](../../CLAUDE.md) and
[../../src/common/AGENTS.md](../../src/common/AGENTS.md); this file covers the operational
realities around them.

## Merge gating on `main`

- `main` has no classic branch protection — the gate is a repository **ruleset** ("main"). Its
  real blockers: `code_quality` (CodeQL code scanning at severity=errors) plus a `pull_request`
  rule (1 approving review; `require_code_owner_review` is vacuous because there's no CODEOWNERS
  file). **CodeQL is the only CI signal that truly blocks merge.**
- Non-blocking checks that look scary but aren't: the `review` check is the "Claude PR Review -
  Auto" workflow, and `vale` runs reviewdog with `fail_on_error: false`. A red `review` or vale
  annotation is not a merge blocker.
- **A red `review` is not automatically a flake.** It fails deterministically once a PR collects a
  large automated-comment history. The run reports `is_error: true` with `duration_ms: 81`,
  `total_cost_usd: 0`, and an empty `modelUsage`, so it gives up before any model call. GitHub
  renders that as "Claude encountered an error after 0s" with no diagnostic. Tag mode reads PR
  comments, and on PR #713 those were 96% of a 166,450-character prompt. The action's own failure
  comments were part of it, so failures compounded. [ADR 01099](../../adrs/01099-keep-bot-chatter-out-of-the-review-prompt.md)
  excludes bot actors from that context. Read the job log's result record before assuming a flake.
  The prompt is printed between `===== FINAL PROMPT =====` and its closing rule.
- The repo owner (hawkeyexl) is admin: `gh pr merge <n> --merge --admin --delete-branch` bypasses
  the approval gate. `--delete-branch` prints a harmless "failed to delete local branch" when the
  branch is checked out in another worktree; the remote branch still gets deleted.
- Stale CodeQL on old branches clears by merging current `origin/main` into the branch.
  `reviewDecision: CHANGES_REQUESTED` persists even after fixes — only an APPROVED review or a
  dismissal clears it, a later COMMENTED review does not.

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
  lands — documenting unmerged behavior is the #1 Promptless failure mode. Also watch for
  superseded drafts whose docs already shipped inside a feature PR (close them).
- **Verify every concrete claim against source.** The bot hallucinates: wrong CLI subcommands,
  inverted precedence, non-existent shorthands, wrong output namespaces. Review the PR's net
  change vs current main (`git diff origin/main...origin/<branch>`), not the whole file — main
  often already moved ahead.
- **Vale vocab path (version-dependent):** with Vale 3.x pinned in `.github/workflows/vale.yml`,
  the active accepted-spelling list is `docs/.vale/styles/config/vocabularies/Docs/accept.txt`;
  terms added only to the legacy `docs/.vale/styles/Vocab/Docs/accept.txt` do nothing. Safest is
  to add new terms to both until the legacy dir is deleted. `docs/.vale.ini` (the config the
  workflow runs, via `--config=docs/.vale.ini`) exempts generated schema reference pages — fix
  prose flagged there at the JSON-schema source under `src/`, not the generated `.md`. Note reviewdog re-posts stale annotation batches per push; verify HEAD is
  actually clean before assuming a real miss.

## `next` → `main` promotion

- The commitlint workflow validates the **entire `base.sha..head.sha` range** on a PR, so a
  promotion PR re-lints every commit in `main..next`. Non-conventional direct commits (often made
  via the GitHub web UI) resurface as failures only at promotion time. Squash-merge bodies used to
  trip `body-max-line-length` too (GitHub concatenates the branch's commit messages into the
  squash body, never linted pre-merge) — `commitlint.config.cjs` now disables body/footer line
  length for this reason; don't re-enable.
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

- **Detect:** `npm view doc-detective dist-tags` — `latest` lagging behind a `staging-<version>`
  entry means the promote job failed. Read the failed run's smoke-test job log.
- **Recover:** fix the cause on `main`, then `gh workflow run promote.yml -f version=<X.Y.Z>` —
  the smoke→promote→docker chain re-runs and the promote step is an idempotent
  `npm dist-tag add`.
- Historical example: a committed screenshot baseline (`reference.png`) drifted from what headless
  Chrome captures on CI and blocked two releases; removed in #395. Keep smoke-test fixtures
  baseline-free — the smoke test's purpose is exercising the action end-to-end, not visual
  regression.

## Promoting stale `claude/*` feature branches

Feature branches forked before major `main` work landed will silently **delete** that work if you
promote them with `git reset --soft main` + commit (it snapshots the branch's stale tree).

Correct flow: `git branch backup <tip>` → `git reset --hard main` → `git merge --squash backup` →
resolve conflicts → build/test → one clean conventional commit. This 3-way merges the feature onto
main and preserves everything the branch predates.

To force a non-major release when a branch carries `refactor!:`/`fix!:` commits, squash into a
single non-`!` commit — semantic-release reads every commit merged to main, so the `!` history
must not survive.

Windows gotcha: `npm run build:common` rewrites generated schema/type files with CRLF. Harmless —
`core.autocrlf=true` normalizes on `git add`; verify with
`git diff --cached --stat --ignore-cr-at-eol`.

## Cross-platform lockfile regeneration

`package-lock.json` must contain the full cross-platform optional-dep tree or CI's `npm ci` fails
with `EUSAGE … Missing: <pkg> from lock file`. A Windows `npm install` prunes platform-inapplicable
optionals (consistently `appium` and `proxy-agent`, plus other platforms' nested `@img/sharp-*`
binaries) — the lockfile looks fine locally but breaks Linux CI.

Before regenerating anything: **`git diff origin/main -- package.json` first.** A stale branch
manifest (e.g. a dependency line main deliberately moved to `ddRuntimeDependencies`) masquerades as
a lockfile break; main's lockfile may never have been wrong.

Regeneration recipe (Docker, repo mounted; on Windows Bash prefix commands with
`MSYS_NO_PATHCONV=1`):

1. Start from a complete base (`git checkout origin/main -- package-lock.json`).
2. In a **`node:22`** container (CI's setup-node bundles npm 10; npm 11 builds a different ideal
   tree), copy `package.json` + `src/common` to a scratch dir and run
   `npm install --package-lock-only --ignore-scripts --no-audit --no-fund` **twice** — the second
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

This broke `main` three times — 4.37.4, 4.37.5, and 4.38.0 — with the same two
`"optional": true, "peer": true` entries under `@commitlint/read/node_modules/` pruned each time.
`@semantic-release/git` committed the result unverified, and `npm ci` failed for every job and every
contributor.

4.37.4 was repaired by hand in #705. 4.37.5 was repaired by *accident*: #702, an unrelated reporters
feature, happened to carry a lockfile regenerated from a healthy tree, and merging it restored the
entries. That merge is also what triggered the 4.38.0 release, which pruned them again about four
hours later — the accidental repair and the next breakage were the same event.

**If you find `main` red this way, regenerate deliberately using the recipe above.** Waiting for
another PR to carry a healthy lockfile is not a plan; it happened once, by chance, and it did not
last a day.

[scripts/reconcile-root-lockfile.js](../../scripts/reconcile-root-lockfile.js) reconciles (two
`--package-lock-only` passes) and then verifies (`npm ci --dry-run`) as the **last** prepare step
before `@semantic-release/git` commits. **If you ever run `npm version --workspace` by hand, run the
two-pass reconcile afterward and verify with `npm ci` before committing.**

That ordering is load-bearing, and getting it wrong is how 4.37.5 broke despite a guard being in
place (ADR 01093): the reconcile originally lived in `sync-common-version.js`, which runs *before*
`@semantic-release/npm` stamps the root version — so the check passed and the lockfile was rewritten
afterward. **Any new lockfile check must be wired after every plugin that stamps a version.** A unit
test asserts that position in `.releaserc.json`, so reordering the plugin list fails the suite.

### The src/common lockfile is release-managed

`src/common/package-lock.json` is rebuilt on every release by
[scripts/sync-common-version.js](../../scripts/sync-common-version.js) (ADR 01091), so you normally
don't touch it — bump `src/common/package.json` and the lockfile catches up at the next release.

If you must regenerate it by hand, run npm from inside `src/common` **with `--no-workspaces`**:

```bash
cd src/common && npm install --package-lock-only --ignore-scripts --no-audit --no-fund --no-workspaces
```

Without `--no-workspaces` npm walks up, finds `workspaces: ["src/common"]` in the root manifest, and
rewrites the **root** `package-lock.json` while leaving `src/common`'s byte-identical — the inverse
of what you asked for. Same trap when verifying: `npm ci` inside `src/common` validates the *root*
lockfile unless you pass `--no-workspaces`.

## Working in git worktrees

Worktrees have no `node_modules`, so the husky `commit-msg` hook's `npx commitlint` fails ("npx
canceled … commitlint") even on a conventional message. Run `npm i` in the worktree (restore any
`package-lock.json` drift afterward). Never use `--no-verify`.
