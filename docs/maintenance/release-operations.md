# Release & repository operations

Maintainer-facing operational knowledge: how merges actually gate, how to recover stuck releases,
and recipes for branch promotion and lockfile regeneration. Release *mechanics* (semantic-release,
channels, commit types) are documented in [../../CLAUDE.md](../../CLAUDE.md) and
[../../src/common/AGENTS.md](../../src/common/AGENTS.md); this file covers the operational
realities around them.

## Merge gating on `main`

- `main` has no classic branch protection. The gate is a repository **ruleset** ("main"), so
  `gh api repos/:owner/:repo/branches/main/protection` answers "Branch not protected" and tells you
  nothing. Read `gh api repos/:owner/:repo/rulesets/13338220` instead. Its blockers are
  `code_quality` (CodeQL at severity=errors), a `pull_request` rule requiring 1 approving review,
  and a `required_status_checks` rule naming five contexts: `lint`,
  `test / Test (ubuntu-latest, node 22, shard 1)`,
  `test / Test (ubuntu-latest, node 22, shard 2)`,
  `test / Coverage ratchet (src/common)`, and
  `test / Coverage ratchet (root, cross-platform)`.
  `require_code_owner_review` is vacuous, because there's no CODEOWNERS file.
- **A required check that never reports blocks the PR with nothing failing.** `mergeStateStatus`
  reads `BLOCKED` while every check shown is green, `mergeable` is `MERGEABLE`, and
  `gh pr merge` refuses with "the base branch policy prohibits the merge". That is not a flake and
  not a stale review. It means one of the five contexts above is absent, not red. PR #729, a
  documentation-only change, hit this because `npm-test.yaml` was path-filtered to `src/**` and
  friends, so the four `test / …` contexts never existed.
  [ADR 01103](../../adrs/01103-required-test-contexts-report-on-every-pull-request.md) fixed it.
  The workflow now always runs. When the change set has no code in it, placeholder jobs report
  those four names. If this signature returns, compare the names the ruleset requires against
  `gh pr checks <n> --json name,state` before reaching for `--admin`.
- Some checks look scary but don't block. The `review` check is the "Claude PR Review - Auto"
  workflow. A red `review` never blocks merge. Treat it as a real signal anyway. It fails
  deterministically once a PR collects a large automated-comment history. The run reports
  `is_error: true` with `duration_ms: 81`, `total_cost_usd: 0`, and an empty `modelUsage`, so it
  gives up before any model call rather than timing out. `track_progress: true` runs the action in
  tag mode, which reads PR comments. On PR #713 those were 96% of a 166,450-character prompt. The
  action's own failure comments were part of it, so failures compounded. The diff is never
  inlined, so PR size is only an indirect correlation. See
  [ADR 01100](../../adrs/01100-keep-bot-chatter-out-of-the-review-prompt.md). GitHub renders the
  failure as "Claude encountered an error after 0s", with no diagnostic. So read the job log's
  result record before writing a red `review` off. The prompt is printed between
  `===== FINAL PROMPT =====` and its closing rule.
- **`vale` is a real gate.** It lints the whole repository on every PR, with `fail_on_error: true`
  and `filter_mode: nofilter`, per
  [ADR 01101](../../adrs/01101-vale-gates-the-whole-repo-and-fails-on-errors.md). So an
  error-severity alert anywhere in the tree turns the check red. It reports errors only, so run
  `vale --config=docs/.vale.ini <path>` locally to see warnings. Fix the prose, or add the term to
  the vocab below. The ruleset's blocker list omits it, so treat it as a blocker by convention.
- The repo owner (hawkeyexl) is admin: `gh pr merge <n> --merge --admin --delete-branch` bypasses
  the approval gate. `--delete-branch` prints a harmless "failed to delete local branch" when the
  branch is checked out in another worktree; the remote branch still gets deleted.
- **What counts as approval.** A review from the Claude review bot (`claude[bot]`, the "Claude PR Review -
  Auto" workflow) counts when it's on the PR's current head. Its state must be `APPROVED`, or `COMMENTED`
  with nothing marked blocking. That review, or the maintainer's own approval, is what this file calls a
  qualifying review.
  - The bot rarely returns `APPROVED`, and every push sets the layers above it back to unreviewed. So
    requiring `APPROVED` on every layer at once never converged.
  - Check that the review's `commit_id` matches the head SHA:
  `gh api repos/:owner/:repo/pulls/<n>/reviews --jq '.[] | select(.user.login=="claude[bot]") | {state, commit_id}'`.
  The maintainer's own approval also counts. Other bots, including CodeRabbit, never do. Agents earn the
  approval by fixing the review's findings and pushing, and they carry their PRs through to merge. On `main`,
  merge a single PR with `gh pr merge <n> --merge --admin --delete-branch --match-head-commit <sha>` once
  the approval is there. `<sha>` is the head the approval and checks cover, so a push that lands in between
  makes the merge fail instead of merging unreviewed code.
  `--admin` bypasses every rule in the ruleset, not just the approval. So before each use, confirm with
  `gh pr checks <n> --json name,state,workflow`:
  - each of the five required contexts above has reported and passed, since a green list can hide one
    that never reported;
  - CodeQL (the `code_quality` rule) passed. Two checks are named `Analyze (javascript-typescript)`, so tell
    the CodeQL and Code Quality ones apart by `workflow`.
- **An approval covers only the commit it reviewed.** Any push, including a `gh stack` rebase, moves the head.
  The bot then reviews again, and the PR needs a fresh qualifying review on the new head before it merges.
  - Rebases get no exception, on purpose. The bot reviews every push on its own, so the strict rule costs
    only a wait.
  - It also means nobody has to judge whether a rebase changed the PR's diff.
- Stacked PRs (see `CLAUDE.md`) merge with `gh stack merge <pr> --merge`, which has no `--admin`. Every
  layer must meet the trunk's ruleset, so a stack into `main` needs a formal approving review. A stack into
  `feat/v5-rc` has no ruleset to enforce approval. It merges once every layer being merged has green checks
  and its own qualifying review on its current head: `APPROVED`, or `COMMENTED` with nothing blocking. An approval on the top PR doesn't approve the layers
  below it.
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

## Major releases

A `major` on main fails in `scripts/verify-major-release.js`, before anything publishes, unless the
`ALLOW_MAJOR_RELEASE` repository variable is `true`, in any case ([ADR 01147](../../adrs/01147-prepare-4x-users-for-5-0.md)).
Unset is the normal state. Prerelease channels are exempt.

- **Intended major:** set the variable to `true`, rerun the release, then unset it.
- **Stray `BREAKING CHANGE:` footer or `!`:** `git revert` the commit on main. The next release is then
  an ordinary patch.

## Roll back a major release

Fix forward first. Land a `fix:` on main, and the normal pipeline ships a 5.0.x and promotes it.

Roll back only when 5.0 is unusable and no quick fix exists. `promote.yml` refuses to move `@latest`
to an older version, so you do these steps by hand, in this order:

1. **Stop main from releasing, and settle the runs already going.** Merge nothing to main until the
   rollback is done. Then list every run that hasn't completed, in each unfinished status. That
   includes `pending` runs waiting on a concurrency group. `--status` filters on GitHub's side, so
   the limit counts only matching runs:

   ```bash
   for wf in release.yml promote.yml docker-build.yml; do
     for s in requested waiting pending queued in_progress; do
       gh run list --workflow "$wf" --status "$s" --limit 100
     done
   done
   ```

   A Release run includes the promote and Docker jobs it calls. Wait for each run to finish, or stop
   it with `gh run cancel <run-id>`. Once a Release run's `release` job has started its `Release`
   step, let it finish. That step publishes `doc-detective` and `doc-detective-common` to npm, and
   cancelling it between the two leaves them at different versions. Cancel a Release run only before
   that step starts. The three workflows' concurrency groups key on the ref or version
   (`release-<ref>`, `promote-<version>`, `docker-build-<ref>-<version>`), so nothing queues them
   behind your rollback. A 5.x Docker job that finishes after step 5 moves `latest` back to 5.x.
2. **If the final 4.x update already shipped, remove its notice.** That notice tells users to move
   to 5, the release you're pulling. Revert it on the `4.x` branch as a `fix:` commit, so the
   release publishes a 4.x patch without it. Wait for that release to finish. Its patch is now the
   last 4.x.
3. **Pin Online to the last 5.0.x image.** Set Online's `RUNNER_IMAGE` environment variable to
   `docdetective/docdetective:<last-5.0.x>`. Online's entrypoint runs `doc-detective runner`, which
   fails on 4.x images, so do this before Docker's `latest` moves.
4. **Move npm `@latest` back.** With an npm login that can publish both packages, run:

   ```bash
   npm dist-tag add doc-detective@<last-4.x> latest
   npm dist-tag add doc-detective-common@<last-4.x> latest
   ```

5. **Rebuild Docker's floating tags from the 4.x tag.** `--ref` runs the workflow and Dockerfile from
   that release:

   ```bash
   gh workflow run docker-build.yml --ref v<last-4.x> -f version=<last-4.x> -f publish_latest_tags=true
   ```

6. **Verify.** `gh run watch <run-id> --exit-status` on the Docker build exits 0. The Windows job
   pushes its tags separately from Linux and can fail on its own. Then check:

   - `npm view doc-detective dist-tags` and `npm view doc-detective-common dist-tags` show `latest`
     on `<last-4.x>`.
   - `docker buildx imagetools inspect` shows `docdetective/docdetective:latest` with the same digest
     as `docdetective/docdetective:<last-4.x>`.
   - It shows `docdetective/docdetective:latest-windows` and `docdetective/docdetective:windows` with
     the same digest as `docdetective/docdetective:<last-4.x>-windows`.

7. **After the fix ships, unpin Online.** While `latest` is on 4.x, every release from main promotes
   again, because any 5.0.x is newer than 4.x. Merge only the fix that makes 5.0 usable. Its release
   moves npm, then Docker, back to 5. Wait until that Release run finishes green, including its
   Docker job. Then check that `docdetective/docdetective:latest` has the same digest as
   `docdetective/docdetective:<fixed-5.0.x>`. Only then set Online's `RUNNER_IMAGE` back to
   `latest`, since a 4.x `latest` breaks Online's runner.

Action v1 pins CLI `4`, so the rollback doesn't affect it. The 4.x upgrade notice goes quiet once
`latest` is 4.x again.

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

## Failed npm publishes

The release job publishes during semantic-release's `prepare` step, before it commits or tags
anything ([ADR 01145](../../adrs/01145-publish-before-tagging-the-release.md)). A failed publish
that reached nothing leaves no `vX.Y.Z` tag, release commit, or GitHub release behind.

- **Detect:** the Release run's `release` job fails, and its log shows
  `publish-staged-release.js` with an `npm error code`.
- **Recover:** fix the cause, then re-run the Release workflow on the branch that failed
  (`gh workflow run release.yml --ref <branch>`). It retries the same version.
- If one package reached npm before the failure, the log says the version is "partly on npm".
  npm never accepts a version twice, so the release tags it anyway, fails at its publish step, and
  the next release moves past it. Nothing is promoted. Re-running doesn't cut that next release,
  because no releasable commit follows the new tag. Fix the cause, then merge a `fix:` or `feat:`
  commit.
- If the log says `publish failed` but `npm view doc-detective@X.Y.Z` lists the version, the
  registry was still propagating when the release checked. Re-running the release in CI is safe:
  it reuses a published version only when npm's `gitHead` matches the commit being released. Don't
  publish that version by hand from a different commit, because a manual run skips that check.
- `E404` on the publish `PUT` means npm rejected `NPM_TOKEN`. npm reports a bad publish token as
  404, not 401. Replace the token.
- `EOTP` means the token authenticates but isn't allowed to skip 2FA. Use a granular access token
  with **Bypass two-factor authentication** checked and read-write access to both
  `doc-detective` and `doc-detective-common`. Also check that neither package's **Publishing
  access** setting disallows tokens.
- `E403` with `You may not perform that action with these credentials` usually means the token
  works but has no write access to that package. Create a token with read-write access to both
  packages and update the repository's `NPM_TOKEN` secret. If the token already has that, check
  its 2FA bypass and the package's **Publishing access** setting, as for `EOTP`.
- Tags `v4.38.2` through `v4.41.3` predate ADR 01145 and never reached npm. Leave them alone. The
  next release moves past them.

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
