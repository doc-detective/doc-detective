# Design: Doc Detective v5 rollout

Status: **proposed** (2026-11-02). This plan turns the November 2026 project review into a release
sequence across the CLI, the GitHub Action, Online, and agent-tools. Claims about today's behavior
were checked against the code or a run of published `doc-detective@4.41.5`. Anything only read, not
run, says so. Dates are proposals, and line references are a snapshot that will drift.

## Summary

- **5.0.0 has one breaking behavior: a failed test fails the run.** Everything else is additive. It
  ships on 4.x before the flip or 5.x after it, because nothing else needs a major version.
- **The GitHub Action gets a matching major.** Action v2 uses CLI 5, and Action v1 stays on CLI 4.
  In a sample of public workflows, 82 of 97 refs use `@v1`, so most Action users move only when they
  choose to.
- **The Action has to change first.** Today's Action loses its results, issue, and pull request
  steps whenever the CLI exits non-zero. Flipping the CLI first would break it.
- **Red has to be useful before it's the default.** Better failure messages and inline annotations
  land before the flip. Otherwise the first thing the change delivers is a wall of "No elements
  matched."
- **There's no long-lived v5 branch.** Main keeps shipping 4.x. The RC branch carries only the flip.
- **v4 users get told.** Two days after GA, a final 4.x update points to v5 and gives upgrade
  instructions on every run. On GitHub Actions, that includes the run page.
- **Online assumes v5.** It stays on Docker `latest` with no pin. The runner entrypoint in this repository
  keeps run statuses meaning what they mean today.

## Timeline

| Phase | Window | What ships | Channel |
|---|---|---|---|
| 0. Safety | Nov 2 to Nov 15 | Secret masking, runtime pins, auto-update guard, honest badges, trust model, package size | CLI 4.x |
| 1. Prepare | Nov 16 to Dec 11 | Failure help, run fingerprint, Action v1.7, upgrade notice, `4.x` release branch wiring, major-release guard | CLI 4.x, Action v1.7 |
| 2. RC | Dec 14 to Jan 8 | The flip, Action v2 RC, migration guide | `doc-detective@v5-rc` |
| 3. GA | Jan 12, 2027 | CLI 5.0.0, Action v2.0.0, docs. Final 4.x update on Jan 14 | `@latest`, `@v2`, `release-4.x` |
| 4. Build | Jan to Apr 2027 | Login, matrix, audit, run history, impact map | CLI 5.x, Action 2.x |
| 5. Bets | Apr 2027 onward | Capture once, verified answers | agent-tools, Online |

The notice window is eight weeks, from the Phase 1 warning to GA. GA lands in January, which keeps the
flip away from the holidays.

**Work-in-progress rule.** New surfaces wait until Phase 3 is done and login has shipped. That
parks Phase A8 of [native-app-surfaces.md](native-app-surfaces.md) (Linux investigation and remote
groundwork), Linux native apps, real devices, and cloud device farms.

## Settled decisions

1. **Inline and standalone tests have one trust level.** An inline test is another way of annotating
   a test, no different from a `*.spec.json`. Format never changes how a step is treated, and
   `unsafe` isn't applied because a step came from a comment. Running Doc Detective on a repository
   runs that repository's tests, like `npm test`. The trust boundary is who can trigger a run with
   secrets, and that belongs to the CI configuration.
2. **Fenced code stays gated.** Default markup marks detected code fences `unsafe: true`
   (`src/core/config.ts:368`) because nobody authored them as tests. That's unchanged by decision 1.
3. **An Action major pins a CLI major.** v1 uses `4`, v2 uses `5`. Users can still set `version`.
4. **Schema names stay `_v3`.** The flip changes a default, not a shape. Bumping them would force a
   migration with no user benefit.
5. **Online assumes v5.** It moves when Docker `latest` does, with no pin and no Online-side rollout
   work. See [Online](#online).

## The 5.0.0 contract

| Run outcome | 4.x exit | 5.0 exit | 5.0 with `exitOnFail: false` |
|---|---|---|---|
| All specs PASS, WARNING, or SKIPPED | 0 | 0 | 0 |
| At least one spec FAIL | 0 | **1** | 0 |
| No specs found (subject to open decision 2) | 0 | **2** | 0 |
| Invalid config or crash | 1 | **2** | 2 |

- `WARNING` and `SKIPPED` never fail a run, matching `shouldFailRun` (`src/core/utils.ts:1167`).
- The way out already exists: `exitOnFail: false` or `--no-exit-on-fail`.
- Results are written before the exit code is set. I confirmed that `--exit-on-fail` on a failing run
  exits 1 and still writes the results file.
- An empty run fails because a mistyped `input` currently looks like success. It's the same gap
  `scripts/check-fixture-results.cjs` covers for this repository's own CI.
- An empty folder, a missing path, and a page with no tests all count as empty. I ran each on today's
  build. Each exited 0, logged "No tests detected.", and wrote `null` as its results.
- Exit 2 means the run tested nothing. Callers treat an empty run and a crash as the same fatal setup
  error, so the shared code is deliberate. The log says which one happened.

**Legacy Action shim.** When `DOC_DETECTIVE_META.dist_interface` is `github-actions` and the user
didn't set `exitOnFail`, it defaults to `false`. This protects pinned Actions at v1.6.1 or earlier,
which would otherwise break (see the [compatibility table](#compatibility)). It also prints a
`::notice` pointing to `@v2`, because these users reached CLI 5 without choosing it and their tests no
longer gate anything. Remove the shim in v6.

**Implementation note.** The Phase 1 notice and the shim both need to know whether the user set
`exitOnFail`. AJV fills schema defaults, so move the default out of `config_v3` and apply it at the
consumption site, keeping it in the field's description.

## GitHub Action plan

### Findings

From `doc-detective/github-action` `src/index.ts`, `action.yml`, and open issues:

| Finding | Effect |
|---|---|
| `exec(compiledCommand, [], options)` has no `ignoreReturnCode`, and `@actions/exec` rejects on non-zero | The `catch` calls `setFailed` and skips results, the `results` output, the issue, and the pull request. This already affects anyone with `exitOnFail: true` in their config (read, not run) |
| `version` defaults to `latest` | Every default install floats across majors the day v5 is promoted. CI runs skip auto-update, so an explicit pin holds |
| `exit_on_fail` defaults to `"false"` | A failing test leaves the job green |
| `createIssue(JSON.stringify(results, null, 2))` | The whole report goes into the issue, including unmasked values. GitHub masks secrets in logs, not issue bodies. It also overflows the 65,536-character limit ([github-action#80](https://github.com/doc-detective/github-action/issues/80)) |
| `issues.create` runs on every failing run | A daily schedule opens a new issue each day (read, not run) |
| PR base comes from `git rev-parse --abbrev-ref HEAD` | Returns `HEAD` on the detached checkout of `pull_request` events, so PR creation should fail (read, not run) |
| Branch is `doc-detective-${Date.now()}`, staged with `git add .` | Every run with changes opens another PR. `last-verified` changes with the date, so [ADR 01140](../../adrs/01140-last-verified-on-marker-writeback.md)'s write-back flow can produce one a day. Everything changed gets staged, including captured screenshots |
| `execSync("git status")` and related calls ignore `working_directory` | Change detection can inspect the wrong directory (read, not run) |
| Only `results` is declared as an output, and `issueUrl` duplicates `issue_url` | Undocumented interface |
| `ios` is a no-op, and `version.startsWith("2")` adds `runTests` | Dead code and a dead input |
| `--config ${config}` and `--input ${input}` are string concatenation | Paths with spaces break (read, not run) |
| No annotations or PR comment. Job summary is in open [github-action#81](https://github.com/doc-detective/github-action/pull/81) | Reviewers have to open the run to learn anything |
| No caching ([#77](https://github.com/doc-detective/github-action/issues/77), [#45](https://github.com/doc-detective/github-action/issues/45)) | Every run pays for the runtime and browser install |
| Dependabot majors are open for `@actions/core`, `@actions/github`, and `@actions/exec` | New tests should run against the final API |

### Compatibility

| Action | CLI | What happens when a test fails with `exit_on_fail` false or unset |
|---|---|---|
| v1.6.1 or earlier | 4.x | Exit 0, normal flow. Today's behavior |
| v1.6.1 or earlier | 5.x, through default `latest` | Without the shim: job red, no results, issue, or PR. With the shim: exit 0, normal flow |
| v1.7 | 4.x, the new default | Exit 0, normal flow |
| v1.7 | 5.x, set explicitly | The Action doesn't pass `exit_on_fail` to the CLI. The shim makes the CLI exit 0, so normal flow and the job stays green. If config sets `exitOnFail: true`, the CLI exits 1 and the job goes red after the results, issue, and PR steps, as that config asks |
| v2.0 | 5.x, the new default | Passes `--no-exit-on-fail`, and the Action makes the one failure decision |

### v1.7.0, the last planned v1 release (Phase 1)

Moves the floating `v1` tag, so most users get it without a change.

1. Merge the Dependabot majors in one PR, so the following tests run against the final API.
2. Pass `ignoreReturnCode: true`, and delete any stale output file first. `loadResults` already
   throws when the file is missing, so a real crash still fails the job. v1.7 doesn't change whether a
   job is red or green, only what happens first. A non-zero exit still fails the job whatever the input
   says, now after the results, issue, and PR steps. `exit_on_fail: true` keeps failing the job through
   the existing `setFailed` (`src/index.ts:226-228`), which reads the results. This matters because `v1`
   floats: someone with `exitOnFail: true` in their config would otherwise go green with no change on
   their side. Test exit 0 and exit 1 with `exit_on_fail` on and off, with and without failed specs.
3. Change the `version` default from `latest` to `4`.
4. Merge [#81](https://github.com/doc-detective/github-action/pull/81), the job summary.
5. Cap `$RESULTS` to fit the issue limit and link to the run. This closes
   [#80](https://github.com/doc-detective/github-action/issues/80).
6. Add failure annotations with `core.error(message, { file, startLine })`, on by default with an
   `annotations` input to turn off. Use `contentPath` and `step.location.line`. My probe confirmed
   that detected steps carry `location.line`. Standalone specs annotate the file only. GitHub limits
   annotations per step, so emit the first 10 and point to the summary for the rest.
7. Remove the `exit_on_fail` default from `action.yml` and treat an empty value as `false`. With the
   default in place, an unset input and an explicit `false` look the same. Add a `core.notice` when it's
   empty, saying v2 defaults it to `true`, and test both cases.

Annotations ship here, not in v2, so every user gets better failure feedback before the flip.

Pointing v1 users to v2 doesn't need another Action release. Action v1.7 resolves `doc-detective@4` on
every run, so the [final 4.x update](#final-4x-update) reaches them through the CLI.

### v2.0.0 (Phase 3)

Publish **after** `doc-detective@5` is on npm, or the default `version` won't resolve. Tag RCs as
`v2.0.0-rc.N`. `publish.yml` skips prereleases, so they don't move `v2`.

Breaking changes:

1. `exit_on_fail` defaults to `"true"`.
2. `version` defaults to `5`.
3. The default `issue_body` uses a new `$SUMMARY` token (the markdown reporter's output) instead of
   raw JSON. `$RESULTS` remains for custom bodies. Summaries suit agent handoffs better, since they
   name the failing step, its source line, and any near match.
4. `create_issue_on_fail` updates an open issue with the same title and label instead of opening a
   new one per run.
5. `create_pr_on_change` uses a stable default branch and updates its open PR. Base comes from
   `GITHUB_BASE_REF` or `GITHUB_REF_NAME`. Git commands honor `working_directory`. A new `pr_paths`
   input limits what gets staged, and the docs warn that captured screenshots can expose unreleased
   UI or customer data.
6. Remove the `ios` input, the `runTests` branch for CLI 2, and `issueUrl`.

Non-breaking changes in the same release:

- Pass arguments as an array, so paths with spaces work.
- Always pass `--no-exit-on-fail`, and move the decision into a pure `decideOutcome({ exitCode,
  results, exitOnFail })`, matching the style of `shouldSetUpAndroid`. Because that flag is always passed,
  failed tests and empty runs arrive as exit 0, and `decideOutcome` finds them in `results`. A failure
  is `summary.specs.fail` above 0, and an empty run is `results` being `null`. Both fail unless
  `exit_on_fail` is `false`. Any non-zero exit or missing results file then means a crash, and
  fails regardless of the input.
- Declare `results_path`, `summary_path`, `issue_url`, and `pull_request_url` as outputs.

Verification, red to green in the Action repository:

- A `decideOutcome` table test covering exit codes 0, 1, and 2 against `exit_on_fail` on and off. For
  exit 0, cover results with failures, results without them, and `null`.
- Tests for issue reuse, PR reuse, and base-branch resolution using mocked Octokit.
- `test-current-release.yml` pointed at `v5-rc` during Phase 2 and `5` after GA.

### v2.x (Phase 4)

| Release | Change | Notes |
|---|---|---|
| v2.1 | Sticky PR comment through `comment_on_pr`, off by default | Needs `pull-requests: write`. Fork PRs get a read-only token, so a 403 warns and continues. Summary and annotations need no extra permission |
| v2.2 | Runtime and browser caching ([#77](https://github.com/doc-detective/github-action/issues/77), [#45](https://github.com/doc-detective/github-action/issues/45)) | Key on CLI version and OS. Evaluate the Docker fast path ([#78](https://github.com/doc-detective/github-action/issues/78)) afterward |
| v2.3 | Mark failures as new or already failing | Compares against the base branch's last results. Needs the run fingerprint and 5.4 |
| v2.4 | Comment on product PRs with the docs they affect | Needs 5.5, plus a documented `repository_dispatch` recipe |

## Phase 0: safety on 4.x

Every item here is a `fix:` commit. `build:` and `perf:` don't cut a release, so they wouldn't reach
users.

### 0.1 Mask secrets ([#204](https://github.com/doc-detective/doc-detective/issues/204))

**Today:** A fake token appeared three times in the JSON report (resolved command, stdout, and
`Authorization` header) and three times in the terminal log. `replaceEnvs` writes resolved values
into the step (`src/core/tests.ts:5654`), and nothing masks them.

**Change:**

- Add a pure `maskSecrets(value, secrets)` helper in `src/core/utils.ts`. Steps keep real values; only
  output is masked.
- Apply it in `outputResults` (`src/utils.ts:1260`), which every reporter passes through, and in the
  `log` functions (`src/utils.ts:59`, `src/core/utils.ts:1886`). Audit `src/core` for raw
  `console.log` calls.
- Mask the values of environment variables whose names match a built-in list (`TOKEN`, `SECRET`,
  `PASSWORD`, `API_KEY`, `PRIVATE_KEY`, `CREDENTIAL`), of names in a new `secrets` config array, and of
  `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, and `X-Api-Key` headers.
- Skip values under 4 characters so `TOKEN=1` doesn't scrub every digit. Replace longest first, and
  also mask the URL-encoded form.

**Limits:** Screenshots and recordings can't be masked, and the docs should say so. Telemetry sends
only `results.summary` counts (`src/core/telem.ts`), so it needs no change.

**Verify:** A test that runs a fake token through every built-in reporter and the log, then searches
the output. Schema cases for `secrets`, following "Adding a new flag" in `CLAUDE.md`.

### 0.2 Pin runtime dependencies ([#722](https://github.com/doc-detective/doc-detective/issues/722))

**Today:** `ddRuntimeDependencies` (`package.json:104`) uses caret ranges, and the runtime install has
no lockfile. One upstream release broke every Chrome `find`.

**Change:** Exact versions for direct entries. Dependabot proposes bumps, and CI tests them before
users get them. Read [src/runtime/AGENTS.md](../../src/runtime/AGENTS.md) first for the prune hazard.
Transitive dependencies still float, so add a shrinkwrap only if that causes a real break.

**Verify:** A unit test that rejects `^` and `~` in `ddRuntimeDependencies`.

### 0.3 Stop auto-update from crossing a major

**Today:** `checkForUpdate` (`src/runtime/selfUpdate.ts:110`) treats any newer `latest` as an update.
Outside CI, global and npx installs re-exec onto it, so v4 users would land on v5 without choosing.

**Change:** When `latest` is a newer major:

- Don't update to it. Log the [upgrade notice](#the-notice) instead. The text ships now and stays
  dormant until `latest` is 5.x.
- Update within the major through the `release-<major>.x` dist-tag, if it holds something newer. The
  check otherwise reads only `latest`, so these installs would never receive the final 4.x update or a
  security backport.
- Name the exact version in the local-install message. It hard-codes `npm i doc-detective@latest`
  (`src/runtime/selfUpdate.ts:183`), which crosses the major.

**Timing:** This has to ship early. Active 4.x installs auto-update to the guarded release during the
window, so most are protected by GA. A bare `npx doc-detective` with an empty cache still resolves to
`latest`, so the migration guide tells those users to pin.

**Verify:** Unit tests for same-major, newer-major with and without `release-4.x`, and prerelease
cases.

### 0.4 Make `verification.write: true` honest

**Today:** I ran a page with an untested procedure and one external link. The link passed, and the page
received `verified-by` and `last-verified`.

**Change:** `applyVerifiedMarkers` (`src/core/utils.ts:2234`) and `applyBadgeAnchoredTests` (`:2342`) declare a
page only when its spec has a passing step beyond `checkLink` and `goTo`. Pages that declare their own
entry keep working, since the author made that claim. Log why a page was skipped.

`write: true` only landed on 2026-10-22, so this is a fix to new behavior. Measured coverage comes
with the audit in 5.3.

**Verify:** Temp-file tests, the pattern ADR 01140 uses for features that write to source files.

### 0.5 Record the trust model

Write an ADR for settled decisions 1 and 2, and add a docs section on running tests in CI. It says that
tests are code, to use `pull_request`, and not to combine `pull_request_target` with a PR-head checkout
and secrets.
Existing recipes already use `pull_request`, and `pull_request_target` appears in neither the docs nor
this repository's workflows. There's no code change.

### 0.6 Housekeeping

- **Package size.** `src/common/src/schemas/dereferenceSchemas.cjs:150-161` pretty-prints its output.
  In `doc-detective-common`'s tarball, `schemas.json` is 102.5 MB and minifies to 17.9 MB. The
  validator doesn't load it (ADR 01138). Then check whether the 60 MB `dist/index.cjs` still inlines
  it.
- **README.** Fix the Node versions, the reporting claim, and the old Core repository link.
- **Stale issues.** Confirm [#203](https://github.com/doc-detective/doc-detective/issues/203),
  [#209](https://github.com/doc-detective/doc-detective/issues/209),
  [#199](https://github.com/doc-detective/doc-detective/issues/199),
  [#207](https://github.com/doc-detective/doc-detective/issues/207), and
  [#214](https://github.com/doc-detective/doc-detective/issues/214) have shipped, then close them.
- **Docs publishing.** Confirm whether [#405](https://github.com/doc-detective/doc-detective/issues/405)
  still applies, because GA depends on `publish-docs.yml`.

### Phase 0 exit gate

Reports and logs pass the fake-token test, and a link-only page gets no badge. When a mock registry
reports 5.0.0, an installed 4.x stays on 4.x and logs the upgrade notice.

## Phase 1: prepare

### 1.1 Failure help (X1, A2)

**Today:** A failed `find` says "No elements matched selector or text."
(`src/core/tests/findElement.ts:291`, `:335`, `:344`). Nothing captures the page at failure.

**Change:**

- After a failed `find`, collect visible candidates and rank them by normalized text. Add the top three
  to the description and to `outputs.nearMatches`.
- Save a failure screenshot in the run folder.
- Add `failureClass` to failed steps: `environment` (DNS, driver, or page never loaded), `drift` (a
  near match exists), or `assertion` (everything else).
- Show all of it in the terminal and markdown reporters. Annotations and the agent fix loop read the
  same fields.

**Verify:** Focused `it(...)` cases in `test/core-core.test.js`, since fixtures must resolve to PASS or
SKIPPED and can't express these failures.

### 1.2 Run fingerprint

Add an `environment` object to `report_v3`: CLI version, OS, each context's browser version, and driver
versions. It's additive. It lets people separate drift from a browser update, and run history in 5.4
depends on it.

### 1.3 Upgrade notice

Log a warning just before the exit check at `src/cli.ts:275` when a run has failures and the user didn't set `exitOnFail`. It says
5.0 will exit 1 and links the preview page from 1.6. The legacy Action path stays quiet, because
Action v1.7 has its own notice. Detecting an unset value needs the default move in the
[implementation note](#the-500-contract), so that change lands in Phase 1.

Runs with no failures stay quiet on purpose, so a fully passing suite gets no warning here. The change
doesn't break it, and the announcement and the final 4.x update still reach it.

### 1.4 Action v1.7.0

See [v1.7.0](#v170-the-last-planned-v1-release-phase-1). Then update this repository's pins at
`.github/workflows/promote.yml:124` and `.github/workflows/fixtures.yml:342`.

### 1.5 Release wiring and major-release guard

The final 4.x update has to publish after main has moved to 5.x, which today's pipeline can't do. Land
this as a `ci:` commit on main, so the branch inherits it when it's cut at GA:

- Add `{ "name": "4.x", "range": "4.x", "channel": "release-4.x" }` to `.releaserc.json`. The channel
  has to be named. It otherwise defaults to `4.x`, a valid semver range, which
  `scripts/publish-staged-release.js` refuses. `@semantic-release/npm` would add the `release-` prefix
  itself, but this repository publishes with its own script.
- Add `4.x` to the `push` branches in `.github/workflows/release.yml`.
- Add a test to `test/release-config.test.js` that no branch's channel parses as a semver range.

The rest of the pipeline already fits. `promote` runs only on main, so a 4.x release can't move
`@latest` or Docker's floating tags. `@semantic-release/github` doesn't mark maintenance releases as
latest (read, not run). A sandbox dry run with semantic-release 25 and this entry gave:

| Commit | Result |
|---|---|
| `fix:` on `4.x` | `4.41.6` on `release-4.x` |
| `fix:` on main after `v5.0.0` | `5.0.1`, with no channel |
| `fix:` on main before `v5.0.0`, with `4.x` already cut | `4.41.6`, with no channel |

The last row means an early cut wouldn't block main. The two branches would then compete for the same
version, though, so the branch waits until GA.

**Major-release guard.** The same commit adds a `verifyReleaseCmd` that fails a `major` on main unless
`ALLOW_MAJOR_RELEASE` is `true`. It's a repository variable, not a secret, passed in `release.yml` from
`vars.ALLOW_MAJOR_RELEASE`, and unset is the normal, locked state. Squash bodies never reach the commit-msg hook, and `release.yml` promotes
to `@latest` on its own once the smoke test passes. A stray footer would otherwise reach users. The check
reads the computed release type, so it covers every route a footer can take, and prerelease channels are
exempt. Another sandbox dry run gave:

| Commit on main | Result |
|---|---|
| `docs:` with a `BREAKING CHANGE:` footer | Release fails before anything publishes |
| The same commit, with `ALLOW_MAJOR_RELEASE=true` | `5.0.0` |
| `git revert` of that commit | `4.41.6`, so main can release again |

Put the check in a small script, and cover it red to green in `test/release-config.test.js`. Test a major
with the variable unset and with it set, a major on a prerelease channel, and a non-major.

### 1.6 Docs and communications

- Publish a short preview on main at `docs/fern/pages/docs/ci/upgrade-to-v5.mdx`. Add it to
  `docs/fern/docs.yml` so it's served at `/docs/ci/upgrade-to-v5`, the route the notice links to, and
  record it in [information-architecture.md](../content-strategy/information-architecture.md). It
  says what's coming and how to try it now with `--exit-on-fail`. Without it, the 1.3 notice would link
  to a missing page for eight weeks, because the guide itself lands at GA. The full guide replaces it.
- Draft the migration guide on `feat/v5-rc`.
- Retitle `docs/fern/pages/docs/get-started/self-healing.mdx` to match what it does (open an issue and
  hand off to an agent), and adjust W2 and A2. Add a redirect.
- Add a rollback recipe to [release-operations.md](../maintenance/release-operations.md).
- Announce the date in a GitHub release note and discussion, and contact Promptless directly. Its repos
  are prominent in public Action usage, and `@promptless` is a built-in integration.

### Phase 1 exit gate

Action v1.7 is on `v1`. A failing run on v1.7 against CLI 4 and against a local build of the flip both produce results,
issue, and PR. Failure output shows a near match in a real run.

## Phase 2: release candidate

**Branch:** `feat/v5-rc`, published as `5.0.0-v5-rc.N` on the `v5-rc` dist-tag. `doc-detective-common`
publishes at the same version and tag, because `scripts/publish-staged-release.js` handles both packages.
The same applies to `release-4.x`.

- `feat/v5` won't work. `v5` is a valid semver range (`>=5.0.0 <6.0.0-0`), and npm rejects ranges as
  dist-tags. `v5-rc` isn't one.
- `next` is 944 commits behind main, last released `4.15.0-next.1`, and needs force-pushes and admin
  merges according to the release docs.
- `cleanup-dist-tag.yml` removes the tag when the branch is deleted.

**Contents:**

1. The flip, as a commit with this message. The footer is required, and it has to stay in history at
   merge (see the [GA runbook](#phase-3-ga-runbook)):

   ```text
   feat(cli)!: fail the run when tests fail

   BREAKING CHANGE: a failed test now fails the run with exit code 1.
   ```

   `.releaserc.json` uses commit-analyzer's default preset, which doesn't read `!`. Run against this
   repository's config, `feat(cli)!:` alone returns no release, and adding the footer returns `major`.
   Build the change red to green using the "TDD cycle per flag" in `CLAUDE.md`:
   - The default and exit codes in `src/cli.ts:40`, `:126`, `:273-276`, and `src/utils.ts:209`,
     `:236`, `:261`.
   - The empty-run rule and the legacy Action shim.
   - `bin/runner-entrypoint.js`: set `exitOnFail: false` in `buildEffectiveConfig` (`:398`), with the
     other platform-controlled overrides, and cover it in `test/runner-entrypoint.test.js`. Otherwise
     lines 747-753 report test failures as `failed` with `nonzero_exit`, the same as a crash. This is
     what lets Online assume v5: a run with failing tests still finalizes as `succeeded`.
   - Focused `it(...)` cases that spawn the CLI and assert each exit code in the contract table.
2. `docs:` the migration guide, plus `reference/cli.mdx`, `reference/schemas/config.mdx`, and every page
   in `docs/fern/pages/docs/ci/` that describes the exit default. Personas are Priya (P1) and Wren
   (W1). Docs land with the code, so they can't describe unreleased behavior.

**Migration guide advice:** Run once with `--no-exit-on-fail`, triage existing failures, then turn the
gate on. Pin `doc-detective@4` if you can't move yet.

**Branch rules:**

- Rebase on main weekly. The branch stays small.
- No `BREAKING CHANGE:` footer on main before GA, including in squash bodies. semantic-release would
  cut 5.0.0 immediately. The guard in 1.5 is the backstop.

**Soak:** This repository's fixtures and docs tests, the Action RC, and Promptless if willing. Also run
agent-tools' test suite with `doc-detective@v5-rc` installed in its checkout. Its bare `npx doc-detective`
calls then resolve to the RC, not `latest`. The window spans the holidays, so expect little outside
feedback from December 23 to January 2.

### Phase 2 exit gate

Two weeks of calendar time pass with no open blocker. All contract table rows are covered by tests, and
every Action compatibility row has been exercised. The migration guide has been followed end to end on a
real repository. If a blocker is open on January 8, GA moves a week, to January 19.

## Phase 3: GA runbook

Target: Tuesday, January 12, 2027. In order:

1. Confirm the Phase 2 gate, and that the auto-update guard has been out for at least eight weeks.
2. Set the `ALLOW_MAJOR_RELEASE` repository variable, then merge the `feat/v5-rc` PR with
   `gh pr merge --merge`, not the web UI. A squash could drop the footer and cut a patch instead.
   On the merge, semantic-release cuts 5.0.0 to `staging-5.0.0`, which publishes the docs. Unset the
   variable once `npm view doc-detective@5.0.0 version` returns, so a failed release can still be re-run.
3. `promote.yml` runs the smoke test, advances `@latest`, and builds Docker. Online moves here, because
   it runs Docker `latest`.
4. Publish Action v2.0.0, which moves `v2`.
5. Update agent-tools (see [Downstream](#downstream)).
6. Publish the announcement, led by what v5 means for users: a green result means something now. Include
   everything shipped since November.
7. Delete `feat/v5-rc`.
8. On Thursday, January 14, ship the [final 4.x update](#final-4x-update).

**Watch for two weeks:** new issues, the Action's `test-current-release.yml`, and PostHog runs by
`core_version` and `dist_interface` for adoption.

**Rollback:** Fix forward with 5.0.x first. If 5.0 is unusable, repoint `latest` to the last 4.x using
the new recipe and rebuild Docker with `publish_latest_tags`. `promote.yml` refuses to regress `@latest`,
so this path has to be documented in advance. If the final 4.x update is already out, revert its notice
on `4.x` first, because it tells people to move to the release being pulled. The notice from 0.3 goes
quiet on its own once `latest` is 4.x again. Action v1 stays safe throughout because it pins `4`.

**4.x support:** Security fixes only, as `fix:` commits on `4.x`, through the date from open decision 5.
When support ends, run `npm deprecate` on 4.x so installs say so.

### Final 4.x update

This release exists to tell v4 users that v5 is out and how to move. It waits two days after GA so that
nobody is sent to 5.0 during the riskiest window.

1. Cut `4.x` from the last 4.x tag and push it.
2. On `4.x`, land `fix(cli): point 4.x users to Doc Detective 5`, red to green. The release publishes the
   next patch to `release-4.x` and skips promotion.
3. Dispatch `docker-build.yml` with that version and `publish_latest_tags: false`, so a current 4.x image
   exists.
4. Check that `npm view doc-detective dist-tags` still shows `latest` on 5.x, and that
   `npm view doc-detective@4 version` returns the new patch. Then confirm that a test workflow on Action
   `@v1` shows the notice on its run page.

#### The notice

Print this after the reporters finish, next to `maybeShowHint` (`src/cli.ts:267`), on every run unless
`logLevel` is `silent`. It needs no registry check, because this release only exists once v5 does. That
also means it works in CI, where the update check doesn't run (`src/cli.ts:188`).

```text
Doc Detective 5 is available. 4.x now gets security fixes only, through <end-of-support date>.

What changes: a failed test now fails the run with exit code 1.
To keep today's behavior while you triage, use --no-exit-on-fail, or exit_on_fail: false in the Action.

Upgrade:
  npm            npm i doc-detective@5
  GitHub Action  change doc-detective/github-action@v1 to @v2
  Docker         use docdetective/docdetective:latest

Guide: https://docs.doc-detective.com/docs/ci/upgrade-to-v5
```

Fill in the date from open decision 5 before drafting this release's PR.

When `GITHUB_ACTIONS` is `true`, also print `::notice title=Doc Detective 5 is available::`, followed by
the first line and the guide link. The runner reads workflow commands from stdout, so it appears on the
run page at any Action version (read, not run). A passing job gives nobody a reason to open its log.
The Action reads results from the file it passes to `--output`, so the extra stdout lines can't break it.

#### Who it reaches

| User | How |
|---|---|
| Action v1.7 | Next run, on the run page. `doc-detective@4` resolves to the new patch |
| Global or npx install, outside CI | Next run. The update check from 0.3 logs the notice and updates to the new patch |
| Local dependency, outside CI | Next run, through the same check. The patch itself arrives with their next `npm update` |
| CI with a lockfile or exact pin | Their next bump, including Dependabot and Renovate PRs. Until then, only the announcement |
| Docker on an exact tag | Their next bump. There's no floating `4` tag. Until then, only the announcement |
| Action v1.6.1 or earlier on default `latest` | Already on CLI 5, so the shim's `::notice` points them to `@v2` |
| Unversioned `npx doc-detective` in CI | Already on CLI 5, so there's nothing to update from. The 1.3 notice warned them only if a test failed during the eight weeks |

### Phase 3 exit gate

Two weeks pass with no open blocker. `@latest`, Docker `latest`, and Action `v2` are all on the new major,
and `ALLOW_MAJOR_RELEASE` is unset. `doc-detective@4` resolves to the final 4.x update, and a real `@v1` run
shows its notice.

## Phase 4: build on 5.x

All additive and ordered by who's blocked and what later work depends on.

| Release | Work | Persona, CUJ | Plan |
|---|---|---|---|
| 5.1 | Login ([#307](https://github.com/doc-detective/doc-detective/issues/307)) | Wren, W1, W2 | `saveState` and `loadState` for cookies plus `localStorage`, building on `saveCookie` and `loadCookie`. A TOTP expression using `node:crypto`, with no new dependency. A documented `beforeAny` login pattern, and a stated limit for SSO |
| 5.1 | File upload and iframes | Wren, W2 | Both block real UI procedures, and both sit near the login work |
| 5.2 | Screenshot variants and reuse | Wren, W2, W3 | `locale`, `colorScheme`, `timezone`, and `deviceScaleFactor` on contexts. One generic `matrix` for user-defined dimensions, instead of a key per dimension. `include` for reusable steps |
| 5.3 | `doc-detective audit` | Wren, W1 | Read-only: broken links, screenshots no test produces, untested procedures, and a rot ranking. Gives value before any test is written. Adds a coverage figure that verification can report. Replaces the `runCoverage` leftovers |
| 5.4 | Source fidelity and run history | Wren, Diego, Priya; X1 | Resolve includes and conrefs in detection. Persistent `runShell` sessions so a documented `cd` or `export` carries over. More `runCode` languages ([#200](https://github.com/doc-detective/doc-detective/issues/200)). Compare runs through the existing run folder |
| 5.5 | Docs impact map | Priya, Wren; P1, W2 | Invert specs into an index from URL, selector, and endpoint to pages. `doc-detective impact --changed` reports affected pages. Also reports OpenAPI endpoints with no documented example |

This is where the gate moves to the repository that causes drift. A documented `repository_dispatch`
recipe can ship in Phase 1 as a stopgap, and 5.5 makes it precise.

## Phase 5: bets

Each one starts small and continues only if the first step earns it.

| Bet | First step | Depends on |
|---|---|---|
| Capture once ([#219](https://github.com/doc-detective/doc-detective/issues/219)) | Record a click-through into a spec. Decide whether to revive or retire `companion` | 5.1 |
| Verified answers for AI | Serve `last-verified` and coverage over MCP and `llms.txt` | 5.3 |
| Test what agents read | Run `AGENTS.md` and skills through detection in agent-tools | None |
| Synthetic monitoring | A recipe for production runs that alert, plus a known-issue banner | 5.4 |
| Rebuildable video | Captions from prose plus step timestamps | 5.2 |
| Accessibility on documented paths | An axe step along existing procedures | None |
| Semantic assertions | For nondeterministic LLM product docs | Demand |
| New markets | Compliance evidence, onboarding docs, and runbooks. Validate with users before building | 5.3 |

## Downstream

### Online

Online assumes v5 compatibility, so it has no rollout work beyond a dependency bump.

- **Runner:** `DEFAULT_RUNNER_IMAGE` stays `docdetective/docdetective:latest`
  (`src/lib/server/platform-constants.ts:47`), so Online moves at promotion. `RUNNER_IMAGE` remains an
  emergency override, not a planned step.
- **Run status:** The Phase 2 entrypoint change ships in the image. A run with failing tests still
  finalizes as `succeeded`, and a crash still finalizes as `failed`. An empty run also stays
  `succeeded`, as it does today, because `exitOnFail: false` relaxes it too (see open decision 2).
  Online's code doesn't read `exitOnFail`, so moving its default doesn't affect it.
- **`doc-detective-common`:** Pinned exactly at `4.41.5`. Bump it to 5 as a normal dependency update after
  GA. Schema names stay `_v3`, so no code change is expected.
- **New work:** Build against the 5.x contract from now on.
- **Product track, in its own plan in that repository's `plans/`:** Run history comes first, since it
  uses the fingerprint. Then come scheduled runs, PR checks through a GitHub App, organizations (RLS is
  currently scoped to `user_id`), billing, and an MCP tool that runs tests. These are what would make Online worth using
  beyond the free Action. Fixing the no-op rate limiter (Online #10) comes before opening the MCP further.

### agent-tools

- Unversioned `npx doc-detective` calls, 16 as of this plan, will move at GA with no pin. Skills must describe a
  non-zero exit as normal for failing tests. Update `doc-detective-test` and its fix loop to read the
  results after a non-zero exit instead of treating it as a crash.
- Update `doc-detective-init` and `doc-detective-project-bootstrap`, where `--exit-on-fail` is described as
  a `--ci` choice.
- Update `doc-detective-install-github-action` to `@v2` and its `exit_on_fail` default.
- After Phase 1, teach the fix loop to read `nearMatches` and `failureClass`.

### GitLab, Docker, and direct CLI use

- **GitLab:** Update exit behavior in the docs at GA. Build the component
  ([#685](https://github.com/doc-detective/doc-detective/issues/685)) in Phase 4 on the 5.x contract, with the same
  major-pinning rule as the Action.
- **Docker and direct CLI:** These get the flip with no shim. The migration guide covers them, and they're
  the main audience for the eight-week notice and the final 4.x update.

## Definition of done

Each behavior change ships with an ADR (next free number at merge), a red-to-green test, and a docs-impact
answer. Add fixtures where the gate can express them, and a hint where the feature warrants one.

## Coverage of review items

| Item | Where it lands |
|---|---|
| Failed tests exit 0 ([#674](https://github.com/doc-detective/doc-detective/issues/674)) | Phase 2, Action v2.0 |
| Docs can run code | Settled: no change, ADR and docs in 0.5 |
| Secrets unmasked | 0.1 |
| Secrets reaching issues and agents | 0.1, Action v1.7 cap, Action v2.0 summary |
| Badges overclaim | 0.4, then 5.3 |
| Login | 5.1 |
| PR feedback | Action v1.7 annotations, Action v2.1 comment |
| Why a test failed | 1.1 |
| Recorder | Phase 5, capture once |
| Screenshot variants | 5.2 |
| Includes and conrefs | 5.4 |
| Test coverage | 5.3 |
| File upload and iframes | 5.1 |
| `runCode` languages | 5.4 |
| Reusable steps and matrix | 5.2 |
| Shell state | 5.4 |
| Online gaps | Online product track |
| Agents can't run tests through MCP | Online product track |
| Gate in the wrong repository | Phase 1 recipe, 5.5, Action v2.4 |
| Four causes of a red test | 0.2, 1.1, 1.2, 5.4, Action v2.3 |
| Prose can be wrong while tests pass | 5.3 flags untested procedures. Judging the prose itself is out of scope (see [Not in v5](#not-in-v5)) |
| Tests know what readers don't | Out of scope (see [Not in v5](#not-in-v5)) |
| "Self-healing" overclaims | 1.6 |
| Screenshot PRs can leak | Action v2.0 `pr_paths` and docs |
| Time going to infrastructure | Work-in-progress rule |
| Docs-to-product map | 5.5 |
| No-tests audit | 5.3 |
| Synthetic monitoring, verified answers, testing agent docs, new markets, video | Phase 5 |
| Package size, README, stale issues | 0.6 |

## Not in v5

- **An agent as reader, and self-healing built on it.** Doc Detective is deterministic: the same docs and
  product give the same result. An agent judging whether a page can be followed can't promise that, so
  it's outside the project's scope in any version.
- **Raising the Node floor.** Node 22 reaches end of life around April 2027, and CI still runs it. Do that
  as its own major then. Once Action majors pin CLI majors, a later major costs far less.
- **Removing v2 specs.** They're under 1% of the schema bytes, so removal gains little and breaks authors.
  The LSP already warns.
- **Removing the deprecated `debug` key.** It's harmless, and removal makes old configs fail validation.
- **SARIF.** Annotations and the summary cover the need with no extra permissions. Add it when someone needs
  code-scanning integration.
- **A step-through debugger.** Failure artifacts come first.
- **RST, DOCX, more source integrations, Playwright, and cloud device farms.** Add on demand.

## Risks

| Risk | Effect | Mitigation |
|---|---|---|
| Users see a wall of red at the upgrade | They pin to 4 or remove the gate | Failure help first, an eight-week notice, and migration advice to triage before gating |
| A pinned old Action meets CLI 5 | Lost issue and PR flow | Legacy shim, tested in the compatibility matrix |
| A stray `BREAKING CHANGE:` lands on main | 5.0.0 is cut early | The guard in 1.5 fails the release before it publishes, and reverting the commit recovers. The flip stays on the RC branch |
| Masking misses a secret or over-masks | A false sense of safety, or noisy reports | Explicit `secrets` config, a documented built-in list, and stated limits for images |
| Solo-maintainer capacity | Dates slip | Phases 0 and 1 are valuable alone. Only the flip is date-bound, and it can move |
| Action and CLI publish out of order | `version: 5` doesn't resolve | Runbook order. v2 publishes only after step 3 |
| A 5.0 regression reaches Online at promotion | Hosted runs break with no soak | Accepted by decision 5. Entrypoint test, fix forward, and `RUNNER_IMAGE` as the emergency override |
| A fully passing suite gets no 1.3 notice | Its first failure after GA is a surprise | The change doesn't break it. The announcement and final 4.x update reach it, and the guide explains the new exit |
| Pinned CI users miss the final 4.x update | They find out about v5 late | They aren't broken, since a pin holds. The announcement and dependency-bump PRs reach them |

## Open decisions

1. **GA date.** Proposed January 12, 2027.
2. **Empty runs.** Proposed: exit 2 unless `exitOnFail: false`. That leaves a mistyped `input` on Online
   reporting `succeeded`, as it does today. Failing it there needs either an exit code that ignores
   `exitOnFail` or an entrypoint that reads the results, since it only sees the exit code.
3. **Badge rule.** Proposed: `goTo` and `checkLink` alone don't qualify under `write: true`.
4. **Issue reuse in Action v2.** Proposed: on by default.
5. **4.x end of support.** Proposed: July 12, 2027, six months after GA. The notice states the date, so
   it has to be settled before the January 14 release's PR is drafted. It doesn't block GA.
6. **What coverage measures.** Still being explored. Item 5.3 and verified answers both depend on the
   definition, and it has to stay deterministic.
