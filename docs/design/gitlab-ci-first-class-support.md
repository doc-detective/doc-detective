# First-class GitLab CI support

**Status:** accepted as a component-first design, with the key decisions settled in §9. **Phase 1, `exitOnFail` and `--exit-on-fail`, is implemented** and disabled by default. Phases 2–4 are pending. Per-primitive ADRs follow at implementation
**Date:** 2026-07-15
**Owners:** doc-detective maintainers
**Related:** [GitHub Action](https://github.com/doc-detective/github-action), `docs/fern/pages/docs/ci/github-action.mdx`, `docs/fern/pages/docs/ci/reporters-and-artifacts.mdx`, `docs/content-strategy/information-architecture.md` (Priya track, CUJ P1)

> This is a **roadmap/design** document (per `CLAUDE.md`: *Roadmaps and design → `docs/design/`*). Each
> behavior-changing primitive it proposes gets its **own ADR + feature fixtures + docs** at implementation
> time. Numbers for those ADRs are assigned at merge (see [[adr-number-collisions]]); this doc does not
> reserve them.

## 1. Goal

Give GitLab CI the same first-class treatment the GitHub Action gives GitHub. That means a drop-in
pipeline gate that installs Doc Detective, **fails the job when tests fail**, and renders results
**natively in the GitLab UI**. It can also **open a merge request or issue**, and **hand a failure off
to an AI integration**. All of that without the user hand-rolling a `--reporters json` and `node -e`
summary parse.

Today GitLab is a second-class citizen. `docs/ci/overview.mdx` and `reporters-and-artifacts.mdx` tell
GitLab users to "parse the JSON `summary` yourself." That works, but it exposes none of GitLab's native
CI surfaces, notably the MR test-report widget. It also duplicates logic the GitHub Action gets for
free.

## 2. The parity target: what the GitHub Action actually does

From `action.yml` and `docs/ci/github-action.mdx`:

| Capability | Action input(s) | Notes |
|---|---|---|
| **Fail the job on test failure** | `exit_on_fail` | The headline feature. The CLI **exits 0 on test failure by default**, and you opt in with `--exit-on-fail`. The Action's `exit_on_fail` delegates to that flag. |
| Open a PR when files change | `create_pr_on_change`, `pr_branch/title/body/labels/assignees/reviewers` | Commits refreshed screenshots/recordings to a branch. |
| Open an issue on failure | `create_issue_on_fail`, `issue_title/body/labels/assignees` | `$RESULTS`/`$RUN_URL`/`$PROMPT` template vars. |
| **Hand off to an AI integration** | `integrations`, `prompt` | `@`-mentions / assigns / labels a GitHub-app bot in the created issue. |
| Expose results to later steps | output `results` (+ `pull_request_url`, `issue_url`) | JSON. |
| Version / working dir / config / input | `version`, `working_directory`, `config`, `input` | Plumbing. |
| iOS WDA + runtime caching | `ios`, `DOC_DETECTIVE_CACHE_DIR` | Build-speed; not result-facing. |

Notably the Action does **not** do PR comments, annotations, or step summaries. Those are therefore
*net-new* opportunities on GitLab, not parity requirements.

## 3. Key architectural fact

The GitHub Action lives in a **separate repo**, `doc-detective/github-action`, and consumes this
repo's CLI. This repo is entirely CI-agnostic. There's no `GITHUB_*` handling, and only four
reporters: `terminal`, `json`, `html`, and `runFolder`. There is **no JUnit output**, confirmed in the
`src/utils.ts` reporter registry and `config_v3.schema.json`'s `reporters`. Exit-on-fail, meaning
`--exit-on-fail` and `exitOnFail`, is implemented as Phase 1 and disabled by default.

Therefore "first-class GitLab" is **two layers**:

- **Layer 1, CLI primitives in this repo.** These are reusable, CI-agnostic building blocks. GitLab
  needs them, and every other CI benefits from them. The component is a thin consumer of these.
- **Layer 2, a GitLab CI/CD Component in a new, separate repo.** This is the GitLab analog of the
  github-action repo. It's a Component published to the
  [CI/CD Catalog](https://docs.gitlab.com/ee/ci/components/). It wires the primitives into
  GitLab-native surfaces, and does MR, issue, and integration handoff through the GitLab API.

```text
┌─────────────────────────────────────────────────────────────┐
│ Layer 2:  doc-detective/gitlab-component  (NEW separate repo)│
│  templates/doc-detective.yml  = CI/CD Component               │
│   • inputs mirror the Action                                  │
│   • artifacts: reports: junit          (GitLab-native)        │
│   • MR / issue creation + AI-integration handoff via API      │
└───────────────▲─────────────────────────────────────────────┘
                │ consumes (bare `npx doc-detective` + reporters + exit code)
┌───────────────┴─────────────────────────────────────────────┐
│ Layer 1:  doc-detective CLI  (THIS repo)                      │
│   • --exit-on-fail / exitOnFail          ← primitive #1       │
│   • junit reporter                        ← primitive #2       │
└──────────────────────────────────────────────────────────────┘
```

## 4. Layer 1: CLI primitives in this repo

Each follows the repo's **CLI flags to config** pattern from `CLAUDE.md`. That's a schema field first,
then a yargs flag, then a `setConfig` override, then a runtime helper, then reading from `config.*`.
Each is a red→green behavior change, with an ADR, `config_v3` positive and negative validation cases,
and PASS or SKIPPED-only feature fixtures.

### 4.1 `exitOnFail` and `--exit-on-fail` (primitive #1, ✅ implemented, default `false`)

**Closed gap in Phase 1, ✅ implemented, default `false`.** Before this primitive, `src/cli.ts` set
`process.exitCode = 1` only on a config or validation error, and never inspected `results.summary`.
Every non-GitHub CI, meaning GitLab, Jenkins, and CircleCI, needed a
`node -e "...summary.tests.fail > 0"` wrapper. This primitive adds the `shouldFailRun` helper and the
post-reporter gate in `cli.ts`. The component's `exit_on_fail` delegates to this flag, instead of
re-implementing the parse.

- **Schema:** add `exitOnFail`, a boolean defaulting to `false`, to `config_v3.schema.json`. That
  default preserves today's contract. The fixtures gate (`scripts/check-fixture-results.cjs`) and the
  Action's own `exit_on_fail: false` default both rely on exit 0.
- **Flag:** `.option("exit-on-fail", { alias: "e", type: "boolean", description: "…" })` in `buildYargs()` (yargs camelCases it to `args.exitOnFail`).
- **`setConfig` override:** `if (typeof args.exitOnFail === "boolean") config.exitOnFail = args.exitOnFail;`
- **Runtime:** a pure helper `shouldFailRun(results)` in `src/core/utils.ts`, returning
  `results.summary.specs.fail > 0`. That's the stable contract this repo's own gate already keys on,
  through `specs[].result === "FAIL"`. Read `config.exitOnFail` at the CLI's post-report site, and set
  `process.exitCode = 1`.

**Decided, on fail granularity:** fail on `FAIL` only. `WARNING` stays non-fatal, matching the
runner's current semantics and `check-fixture-results.cjs`. `shouldFailRun` keys on
`summary.specs.fail > 0`.

**Decided, on the exit code:** reuse `1` for both test failures and config or crash errors. A distinct
code, where `1` means test failures and `2` means a crash, is left as a later additive refinement, if
pipelines need to distinguish them.

### 4.2 `junit` reporter  (primitive #2)

Emit JUnit XML. GitLab renders it natively through `artifacts:reports:junit`. That's the **single
biggest GitLab UX win**, giving the MR "test summary" widget listing failed tests. It's equally useful
on GitHub, CircleCI, Jenkins, and Bitbucket.

- **Mapping**, walking the same tree as `reportResults` in `src/utils.ts`. A spec becomes a
  `<testsuite>`, and a test crossed with a context becomes a `<testcase>`. That name carries the
  platform and browser, so matrix legs are distinguishable. `FAIL` becomes
  `<failure message={resultDescription}>`, and `SKIPPED` becomes `<skipped>`. `WARNING` becomes a
  passing testcase with `<system-out>`, since JUnit has no "warning". Step-level `resultDescription`s
  go into the `<failure>` body, for triage.
- **Registration:** a new entry in the `reporters` map (`src/utils.ts:532`), the shorthand `junit` in
  the normalizer (`src/utils.ts:1227`), and an enum-description line in the `reporters` schema field.
- **Output path:** see §4.4. It writes `junit.xml` in the output dir by convention.
- **Empty-run behavior:** emit a valid `<testsuites tests="0">`, never a zero-byte file, so GitLab's
  parser doesn't choke. That's consistent with the "empty run never looks green" principle in
  `terminalReporter`.

### 4.3 Cross-cutting: reporter output path

Today there's a single global `output` in `config_v3`, and `json` and `html` branch on its extension.
JUnit needs a **fixed, well-known filename**, so the component's `artifacts:reports:junit` glob finds
it.

- **Option A, chosen and minimal:** the reporter writes a conventional filename, `junit.xml`, into the
  `output` directory. The component points `artifacts:reports:junit` at it. There's no schema change,
  and it matches how `runFolder` already owns its own path layout.
- **Option B:** add a per-reporter options object to `config_v3`, shaped
  `{ reporters: [{ name, output }] }`. That's more flexible, but a larger schema change and
  back-compat surface. Defer it unless a concrete need appears.

*Chosen:* **A.** Revisit B only if users need multiple JUnit files per run.

### 4.4 Considered and dropped: a GitLab Code Quality reporter

An earlier draft proposed a third primitive. It would emit [Code
Climate](https://docs.gitlab.com/ee/ci/testing/code_quality.html#implement-a-custom-tool)-format JSON
for `artifacts:reports:codequality`. That renders each failing step as an inline annotation on the MR
diff.

**Dropped.** Despite GitLab's naming, it has nothing to do with linting or static analysis. It's purely
a transport format for inline diff annotations. That naming reliably reads as "we're adding code
quality checks to the project", which is exactly the wrong idea. The `junit` reporter's MR
test-summary widget already answers the primary question, "which doc tests failed?". It isn't worth the
surface area for the delta. It was fully independent of the other phases, so nothing else changes.

Revisit it only if users ask for failures pinned to the exact doc line **in the diff view**. They'd
also have to say the test widget isn't enough. If it comes back, name it for what it does,
`gitlab-annotations`, rather than for GitLab's feature name.

## 5. Layer 2: the GitLab CI/CD Component, in a separate repo

New repo `doc-detective/gitlab-component`, published to the CI/CD Catalog. A consuming pipeline uses it as:

```yaml
include:
  - component: gitlab.com/doc-detective/gitlab-component/doc-detective@1
    inputs:
      exit_on_fail: true
      config: .doc-detective.json
```

### 5.1 Input surface (mirrors the Action)

| Action input | Component input | GitLab realization |
|---|---|---|
| `version` | `version` | npm version/tag; `''` → locally resolvable build (`npm link`). |
| `working_directory` | `working_directory` | `cd` before run. |
| `config` / `input` | `config` / `input` | passthrough flags. |
| `exit_on_fail` | `exit_on_fail` | It **delegates to the CLI `--exit-on-fail`**, per §4.1, with no bespoke parse. |
| `create_pr_on_change` | `create_mr_on_change` | POST `/projects/:id/merge_requests`. |
| `pr_branch/title/body/labels/assignees/reviewers` | `mr_*` | `$RUN_URL` → `CI_PIPELINE_URL`. |
| `create_issue_on_fail` | `create_issue_on_fail` | POST `/projects/:id/issues`. |
| `issue_title/body/labels/assignees` | `issue_*` | `$RESULTS`/`$RUN_URL`/`$PROMPT` template vars. |
| `integrations` / `prompt` | `integrations` / `prompt` | see §6. |
| output `results` | `results` (job artifact + dotenv) | JSON path exported for later jobs. |
| `ios` | n/a | Not applicable, since the standard GitLab.com fleet has no macOS runners by default. |

**GitLab-native additions beyond the Action** (cheap because the primitives exist):

- `artifacts: reports: junit: junit.xml` → MR test-summary widget.
- An optional **MR note**, meaning a comment, on failure, through `/merge_requests/:iid/notes`. The
  Action doesn't do this. Gate it behind a `comment_on_mr` input, defaulting to off, since the JUnit
  widget may make it redundant. `CI_MERGE_REQUEST_IID` is populated **only** in `merge_request_event`
  pipelines, so `comment_on_mr` requires one. On a branch or tag pipeline where the IID is absent, the
  component **skips the note with a logged notice**. It does not fail the job, and does not attempt a
  branch-to-MR lookup. That lookup is ambiguous, and silently guessing the wrong MR is worse than
  skipping. Document this precondition on the input, so users enable `comment_on_mr` only where it can
  work.

### 5.2 Token & permission model (the sharp edge)

GitLab's `CI_JOB_TOKEN` **cannot create MRs or issues, or post notes**, in the general case. Those need
a token with `api` scope, meaning a **Project or Group Access Token**, or a PAT. Surface it as a masked
CI/CD variable, such as `DOC_DETECTIVE_GITLAB_TOKEN`. This must be **loud** in the docs. The component
should fail with a clear message when a write feature is enabled without a usable token, rather than
silently no-op. We rely on these predefined vars: `CI_API_V4_URL`, `CI_PROJECT_ID`,
`CI_MERGE_REQUEST_IID`, `CI_PIPELINE_URL`, and `CI_COMMIT_REF_NAME`. `CI_MERGE_REQUEST_IID` is only
present in `merge_request_event` pipelines.

### 5.3 Implementation shape

A small POSIX script, or a `glab`-based one, invoked by the component template's `script:`. It runs
`npx doc-detective` with the reporters enabled. It then calls the GitLab REST API, based on the inputs
and the results JSON. Keeping the API logic in the component rather than the CLI mirrors the GitHub
split, and keeps this repo CI-agnostic.

## 6. The AI-integration handoff on GitLab (explicit requirement)

This is the subtle part. The Action's integrations are **GitHub-app bots** that react to the **created
issue** by one of three mechanisms (`docs/get-started/integrations.mdx`):

| Integration | GitHub mechanism | GitLab reality |
|---|---|---|
| `claude` | `@claude` mention in issue | Claude has GitLab support, through GitLab-Claude and pipeline flows. **Mention and label** are viable. |
| `copilot` | issue **auto-assigned** to Copilot | **GitHub-only.** There's no GitLab equivalent. |
| `cursor` | `@cursor` mention | A GitHub-centric background agent. GitLab support is limited and unofficial. |
| `dosu` | mention | **Dosu supports GitLab.** Mention and label are viable. |
| `promptless` | connected-repo webhook | **Promptless supports GitLab.** Label and event are viable. |
| `doc-sentinel` | mention | Doc Detective's own. Define its GitLab behavior. |
| `opencode` | mention | mention/label viable. |

So a 1:1 port is impossible. The design uses a **handoff-strategy abstraction**, with three composable
primitives the component applies to the created issue or MR note:

1. **mention** appends `@<bot>`, a collapsible `$RESULTS` block, and `$PROMPT` to the issue or note
   body. It's the default, and matches the Action's mention path.
2. **assign** hands the issue to a bot reviewer, the Action's Copilot path. On GitLab it's realized
   through a Duo quick action, `/assign_reviewer @GitLabDuo`, rather than a raw assignee API call.
   Direct assignment needs a resolvable reviewer identity. See the `duo` entry below.
3. **label** applies a label the integration's webhook subscribes to, in the Promptless and Dosu style.

A per-integration table maps `name → { strategy, gitlabSupported, setupDocUrl }`. Decisions:

- **The launch set, decided:** `claude`, `duo`, and `promptless`. That's the initial supported surface.
  The abstraction leaves room to add `dosu`, `doc-sentinel`, `cursor`, and `opencode` later, as each is
  verified on GitLab. Growing the set needs no schema or structural change.
  - `claude` uses the **mention** strategy, putting `@claude` in the issue or MR note, with `$RESULTS`
    and `$PROMPT`.
  - `duo` uses the **quick-action** strategy. It posts a `/assign_reviewer @GitLabDuo` quick action,
    falling back to an `@GitLabDuo` mention, in the issue or MR note. That's the GitLab-native analog
    of the Action's Copilot auto-assign. It's realized through a quick action or mention rather than a
    raw assignee API call, since direct assignment needs a resolvable reviewer identity.
    **Prerequisite:** GitLab Duo and its automated code-review feature must be enabled for the
    project, needing Premium or Ultimate plus the Duo add-on. The `@GitLabDuo` identity must also be
    resolvable. Where Duo isn't enabled, the component reports the same fail-fast guidance as an
    unsupported integration, rather than posting a mention nothing will answer.
  - `promptless` uses the **label** strategy, applying the label Promptless's GitLab webhook
    subscribes to.
- **Honesty over false parity.** Any integration name outside the launch set makes the component **fail
  fast with a helpful message**. `copilot` is the notable one, being GitHub-only. The message names the
  supported set and the GitLab-native alternative, `duo`. That beats silently mentioning a bot that
  will never answer.
- **`prompt` parity.** It's the same `prompt` input, carrying the same default string as the Action.
  That string reads, "Investigate potential causes of the failures reported in this Doc Detective test
  output and suggest fixes." It feeds into the mention, label, and note body identically.

## 7. Documentation impact

Per `CLAUDE.md` this feature has clear user-facing impact, so docs travel with it. The persona is
**Priya**, the CI and platform engineer, and the CUJ is **P1**. The IA already reserves the slot,
*"CI recipes: other platforms (new)"*. This work **promotes that into a dedicated GitLab page**.

- **New:** `docs/fern/pages/docs/ci/gitlab-component.mdx`, a mirror of `github-action.mdx`. It covers
  adding the component, gating the pipeline, and wiring the JUnit artifact. It also covers opening MRs
  and issues, handing off to integrations, and the token and permission caveat. Register it in
  `information-architecture.md`'s content-set map, under the CI track.
- **Update:** `docs/ci/overview.mdx`. Promote GitLab from "roll your own", under "Scale beyond a single
  GitHub repo", to a first-class entry under "Add the gate to your pipeline."
- **Update:** `docs/ci/reporters-and-artifacts.mdx`. Add `junit` to the reporter table. Add
  **`--exit-on-fail`** as a third and simplest way to "fail CI when tests fail", alongside the Action
  and the JSON-parse recipe.
- **Update:** `docs/get-started/integrations.mdx`. It's currently GitHub-issue-specific. Generalize it
  to a per-platform support matrix, document the GitLab handoff strategies, and call out `copilot` as
  GitHub-only and `duo` as GitLab-native.
- **Update the source-of-truth row:** `information-architecture.md`'s "Reporters and artifacts →
  `src/reporters/`" stays accurate once the `junit` reporter lands there.

## 8. Sequencing / roadmap

| Phase | Deliverable | Repo | Depends on |
|---|---|---|---|
| **0** | This design, plus alignment | this repo (`docs/design/`) | n/a |
| **1** ✅ | `--exit-on-fail` and `exitOnFail`, with an ADR, fixtures, and docs | this repo | 0 |
| **2** | The `junit` reporter, with an ADR, fixtures, and docs | this repo | 0 |
| **3** | GitLab CI/CD Component: inputs, artifact wiring, MR and issue creation, and the **integrations handoff** | new repo `doc-detective/gitlab-component` | 1–2 |
| **4** | Docs: a new GitLab page, plus overview, reporters, and integrations updates | this repo | 1–3 |

Phase 1, `--exit-on-fail`, is the chosen first primitive. It's the smallest change that buys the most.
It unblocks gating on *every* non-GitHub CI, and the component's `exit_on_fail` is a thin delegation
to it.

## 9. Decisions & remaining questions

**Decided:**

1. **exit-on-fail** fails on `FAIL` only, keeping WARNING non-fatal, and reuses exit code `1`. (§4.1)
2. **The integration launch set** is `claude` (mention), `duo` (Duo quick action, GitLab-native), and
   `promptless` (label). Any other name, including GitHub-only `copilot`, fails fast with
   guidance. (§6)
3. **No Code Quality reporter.** GitLab's `codequality` artifact is an inline-annotation transport,
   not linting. But the name misleads, and the JUnit test widget already covers the need. (§4.4)
4. **The reporter output path** follows Option A, a conventional fixed filename, `junit.xml`, in the
   `output` dir. No schema change. (§4.3)
5. **The component repo** is a new separate repo, `doc-detective/gitlab-component`, on the CI/CD
   Catalog. It mirrors github-action, and is created outside this repo when Phase 3 begins. (§5)
6. **The MR note on failure** ships behind an input, `comment_on_mr`, defaulting to off. The JUnit
   widget is the primary surface. (§5.1)

**Still open (can be settled at their phase, not blocking Phase 1):**

- Whether Phase 3 later promotes `dosu`/`doc-sentinel`/`cursor`/`opencode` from "future" to "supported"
  once verified on GitLab. (§6)
