# First-class GitLab CI support

**Status:** accepted (design; component-first) — key decisions settled in §9. **Phase 1 (`exitOnFail` / `--exit-on-fail`) is implemented** and disabled by default; Phases 2–4 are pending. Per-primitive ADRs follow at implementation
**Date:** 2026-07-15
**Owners:** doc-detective maintainers
**Related:** [GitHub Action](https://github.com/doc-detective/github-action), `docs/fern/pages/docs/ci/github-action.mdx`, `docs/fern/pages/docs/ci/reporters-and-artifacts.mdx`, `docs/content-strategy/information-architecture.md` (Priya track, CUJ P1)

> This is a **roadmap/design** document (per `CLAUDE.md`: *Roadmaps and design → `docs/design/`*). Each
> behavior-changing primitive it proposes gets its **own ADR + feature fixtures + docs** at implementation
> time. Numbers for those ADRs are assigned at merge (see [[adr-number-collisions]]); this doc does not
> reserve them.

## 1. Goal

Give GitLab CI the same first-class treatment the GitHub Action gives GitHub: a drop-in pipeline gate
that installs Doc Detective, **fails the job when tests fail**, renders results **natively in the GitLab
UI**, and can **open a merge request or issue** and **hand a failure off to an AI integration** — without
the user hand-rolling a `--reporters json` + `node -e` summary parse.

Today GitLab is a second-class citizen: `docs/ci/overview.mdx` and `reporters-and-artifacts.mdx` tell
GitLab users to "parse the JSON `summary` yourself." That works, but it exposes none of GitLab's native
CI surfaces (notably the MR test-report widget) and duplicates logic the GitHub Action gets for free.

## 2. The parity target — what the GitHub Action actually does

From `action.yml` and `docs/ci/github-action.mdx`:

| Capability | Action input(s) | Notes |
|---|---|---|
| **Fail the job on test failure** | `exit_on_fail` | The headline feature. The CLI **always exits 0 on test failure**; the Action reads results and exits non-zero. |
| Open a PR when files change | `create_pr_on_change`, `pr_branch/title/body/labels/assignees/reviewers` | Commits refreshed screenshots/recordings to a branch. |
| Open an issue on failure | `create_issue_on_fail`, `issue_title/body/labels/assignees` | `$RESULTS`/`$RUN_URL`/`$PROMPT` template vars. |
| **Hand off to an AI integration** | `integrations`, `prompt` | `@`-mentions / assigns / labels a GitHub-app bot in the created issue. |
| Expose results to later steps | output `results` (+ `pull_request_url`, `issue_url`) | JSON. |
| Version / working dir / config / input | `version`, `working_directory`, `config`, `input` | Plumbing. |
| iOS WDA + runtime caching | `ios`, `DOC_DETECTIVE_CACHE_DIR` | Build-speed; not result-facing. |

Notably the Action does **not** do PR comments, annotations, or step summaries — so those are *net-new*
opportunities on GitLab, not parity requirements.

## 3. Key architectural fact

The GitHub Action lives in a **separate repo** (`doc-detective/github-action`) and consumes this repo's
CLI. This repo is entirely CI-agnostic: no `GITHUB_*` handling, no exit-on-fail, and only four reporters
(`terminal`, `json`, `html`, `runFolder`) — **no JUnit output** (confirmed in `src/utils.ts` reporter
registry, `config_v3.schema.json` `reporters`).

Therefore "first-class GitLab" is **two layers**:

- **Layer 1 — CLI primitives (this repo).** Reusable, CI-agnostic building blocks that GitLab needs and
  that every other CI benefits from. The component is a thin consumer of these.
- **Layer 2 — GitLab CI/CD Component (a new, separate repo).** The GitLab analog of the github-action
  repo: a Component published to the [CI/CD Catalog](https://docs.gitlab.com/ee/ci/components/), wiring
  the primitives into GitLab-native surfaces and doing MR/issue/integration handoff via the GitLab API.

```text
┌─────────────────────────────────────────────────────────────┐
│ Layer 2:  doc-detective/gitlab-component  (NEW separate repo)│
│  templates/doc-detective.yml  — CI/CD Component               │
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

## 4. Layer 1 — CLI primitives (this repo)

Each follows the repo's **CLI flags ↔ config** pattern (`CLAUDE.md`): schema field first → yargs flag →
`setConfig` override → runtime helper → read from `config.*`. Each is a red→green behavior change with an
ADR, `config_v3` positive/negative validation cases, and PASS/SKIPPED-only feature fixtures.

### 4.1 `exitOnFail` / `--exit-on-fail`  (primitive #1 — ✅ implemented, default `false`)

**The foundational gap.** `src/cli.ts` sets `process.exitCode = 1` only on config/validation error; it
never inspects `results.summary`. Every non-GitHub CI (GitLab, Jenkins, CircleCI) currently needs the
`node -e "...summary.tests.fail > 0"` dance. The component depends on this primitive.

- **Schema:** add `exitOnFail` (boolean, default `false`) to `config_v3.schema.json`. Default `false`
  preserves today's contract — the fixtures gate (`scripts/check-fixture-results.cjs`) and the Action's
  own `exit_on_fail: false` default both rely on exit 0.
- **Flag:** `.option("exit-on-fail", { alias: "e", type: "boolean", description: "…" })` in `buildYargs()` (yargs camelCases it to `args.exitOnFail`).
- **`setConfig` override:** `if (typeof args.exitOnFail === "boolean") config.exitOnFail = args.exitOnFail;`
- **Runtime:** a pure helper `shouldFailRun(results)` in `src/core/utils.ts` returning
  `results.summary.specs.fail > 0` (the stable contract this repo's own gate already keys on:
  `specs[].result === "FAIL"`). Read `config.exitOnFail` at the CLI's post-report site and set
  `process.exitCode = 1`.

**Decided (fail granularity):** fail on `FAIL` only. `WARNING` stays non-fatal, matching the runner's
current semantics and `check-fixture-results.cjs`. `shouldFailRun` keys on `summary.specs.fail > 0`.

**Decided (exit code):** reuse `1` for both test failures and config/crash errors. A distinct code
(`1` = test failures, `2` = crash) is left as a later additive refinement if pipelines need to
distinguish them.

### 4.2 `junit` reporter  (primitive #2)

Emit JUnit XML. GitLab renders it natively via `artifacts:reports:junit` — the **single biggest GitLab
UX win** (MR "test summary" widget listing failed tests) — and it's equally useful on GitHub, CircleCI,
Jenkins, Bitbucket.

- **Mapping** (walks the same tree as `reportResults` in `src/utils.ts`): spec → `<testsuite>`;
  test × context → `<testcase>` (name carries platform/browser so matrix legs are distinguishable);
  `FAIL` → `<failure message={resultDescription}>`; `SKIPPED` → `<skipped>`; `WARNING` → passing testcase
  with `<system-out>` (JUnit has no "warning"). Step-level `resultDescription`s go into the `<failure>`
  body for triage.
- **Registration:** new entry in the `reporters` map (`src/utils.ts:532`), shorthand `junit` in the
  normalizer (`src/utils.ts:1227`), and an enum-description line in the `reporters` schema field.
- **Output path:** see §4.4 — writes `junit.xml` in the output dir by convention.
- **Empty-run behavior:** emit a valid `<testsuites tests="0">` (never a zero-byte file) so GitLab's
  parser doesn't choke, consistent with the "empty run never looks green" principle in `terminalReporter`.

### 4.3 Cross-cutting: reporter output path

Today there's a single global `output` (`config_v3`); `json`/`html` branch on its extension. JUnit needs a
**fixed, well-known filename** so the component's `artifacts:reports:junit` glob finds it.

- **Option A (chosen, minimal):** the reporter writes a conventional filename into the `output`
  directory — `junit.xml`. The component points `artifacts:reports:junit` at it. No schema change;
  matches how `runFolder` already owns its own path layout.
- **Option B:** add a per-reporter options object to `config_v3` (`{ reporters: [{ name, output }] }`).
  More flexible, larger schema change and back-compat surface. Defer unless a concrete need appears.

*Chosen:* **A.** Revisit B only if users need multiple JUnit files per run.

### 4.4 Considered and dropped: a GitLab Code Quality reporter

An earlier draft proposed a third primitive emitting [Code
Climate](https://docs.gitlab.com/ee/ci/testing/code_quality.html#implement-a-custom-tool)-format JSON for
`artifacts:reports:codequality`, which would have rendered each failing step as an inline annotation on
the MR diff.

**Dropped.** Despite GitLab's naming, it has nothing to do with linting or static analysis — it is purely
a transport format for inline diff annotations. But that naming reliably reads as "we're adding code
quality checks to the project," which is exactly the wrong idea, and the `junit` reporter's MR
test-summary widget already answers the primary question ("which doc tests failed?"). Not worth the
surface area for the delta. It was fully independent of the other phases, so nothing else changes.

Revisit only if users ask for failures pinned to the exact doc line **in the diff view** and say the test
widget isn't enough. If it comes back, name it for what it does (`gitlab-annotations`), not for GitLab's
feature name.

## 5. Layer 2 — the GitLab CI/CD Component (separate repo)

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
| `exit_on_fail` | `exit_on_fail` | **delegates to the CLI `--exit-on-fail`** (§4.1) — no bespoke parse. |
| `create_pr_on_change` | `create_mr_on_change` | POST `/projects/:id/merge_requests`. |
| `pr_branch/title/body/labels/assignees/reviewers` | `mr_*` | `$RUN_URL` → `CI_PIPELINE_URL`. |
| `create_issue_on_fail` | `create_issue_on_fail` | POST `/projects/:id/issues`. |
| `issue_title/body/labels/assignees` | `issue_*` | `$RESULTS`/`$RUN_URL`/`$PROMPT` template vars. |
| `integrations` / `prompt` | `integrations` / `prompt` | see §6. |
| output `results` | `results` (job artifact + dotenv) | JSON path exported for later jobs. |
| `ios` | — | n/a (no macOS runners in the standard GitLab.com fleet by default). |

**GitLab-native additions beyond the Action** (cheap because the primitives exist):

- `artifacts: reports: junit: junit.xml` → MR test-summary widget.
- Optional **MR note** (comment) on failure via `/merge_requests/:iid/notes` — something the Action
  doesn't do. Gate behind an input (`comment_on_mr`), default off; the JUnit widget may make it redundant.
  `CI_MERGE_REQUEST_IID` is populated **only** in `merge_request_event` pipelines, so `comment_on_mr`
  requires one. On a branch or tag pipeline where the IID is absent, the component **skips the note with a
  logged notice** — it does not fail the job and does not attempt a branch→MR lookup (that lookup is
  ambiguous, and silently guessing the wrong MR is worse than skipping). Document this precondition on the
  input so users enable `comment_on_mr` only where it can work.

### 5.2 Token & permission model (the sharp edge)

GitLab's `CI_JOB_TOKEN` **cannot create MRs/issues or post notes** in the general case — those need a
token with `api` scope (a **Project/Group Access Token** or a PAT), surfaced as a masked CI/CD variable
(e.g. `DOC_DETECTIVE_GITLAB_TOKEN`). This must be **loud** in the docs and the component should fail with
a clear message when a write feature is enabled without a usable token, rather than silently no-op. The
predefined vars we rely on: `CI_API_V4_URL`, `CI_PROJECT_ID`, `CI_MERGE_REQUEST_IID` (only present in
`merge_request_event` pipelines), `CI_PIPELINE_URL`, `CI_COMMIT_REF_NAME`.

### 5.3 Implementation shape

A small POSIX script (or a `glab`-based one) invoked by the component template's `script:`. It runs
`npx doc-detective` with the reporters enabled, then, based on inputs and the results JSON, calls the
GitLab REST API. Keeping the API logic in the component (not the CLI) mirrors the GitHub split and keeps
this repo CI-agnostic.

## 6. The AI-integration handoff on GitLab (explicit requirement)

This is the subtle part. The Action's integrations are **GitHub-app bots** that react to the **created
issue** by one of three mechanisms (`docs/get-started/integrations.mdx`):

| Integration | GitHub mechanism | GitLab reality |
|---|---|---|
| `claude` | `@claude` mention in issue | Claude has GitLab support (GitLab⇄Claude / pipeline flows) — **mention/label** viable. |
| `copilot` | issue **auto-assigned** to Copilot | **GitHub-only.** No GitLab equivalent. |
| `cursor` | `@cursor` mention | GitHub-centric background agent; GitLab support limited/unofficial. |
| `dosu` | mention | **Dosu supports GitLab** — mention/label viable. |
| `promptless` | connected-repo webhook | **Promptless supports GitLab** — label/event viable. |
| `doc-sentinel` | mention | Doc Detective's own — define GitLab behavior. |
| `opencode` | mention | mention/label viable. |

So a 1:1 port is impossible. The design uses a **handoff-strategy abstraction** — three composable
primitives the component applies to the created issue/MR note:

1. **mention** — append `@<bot>` + a collapsible `$RESULTS` block + `$PROMPT` to the issue/note body
   (the default; matches the Action's mention path).
2. **assign** — hand the issue to a bot reviewer (the Action's Copilot path). On GitLab this is realized
   through a Duo quick action (`/assign_reviewer @GitLabDuo`) rather than a raw assignee API call, because
   direct assignment needs a resolvable reviewer identity (see the `duo` entry below).
3. **label** — apply a label the integration's webhook subscribes to (Promptless/Dosu style).

A per-integration table maps `name → { strategy, gitlabSupported, setupDocUrl }`. Decisions:

- **Launch set (decided):** `claude`, `duo`, and `promptless`. This is the initial supported surface;
  the abstraction leaves room to add `dosu`, `doc-sentinel`, `cursor`, and `opencode` later as each is
  verified on GitLab — no schema/structural change needed to grow the set.
  - `claude` — **mention** strategy (`@claude` in the issue / MR note, with `$RESULTS` + `$PROMPT`).
  - `duo` — **quick-action** strategy: post a `/assign_reviewer @GitLabDuo` quick action (falling back to
    an `@GitLabDuo` mention) in the issue or MR note — the GitLab-native analog of the Action's Copilot
    auto-assign, but realized through a quick action/mention rather than a raw assignee API call, since
    direct assignment needs a resolvable reviewer identity. **Prerequisite:** GitLab Duo and its automated
    code-review feature must be enabled for the project (Premium/Ultimate + the Duo add-on), and the
    `@GitLabDuo` identity must be resolvable. Where Duo isn't enabled, the component reports the same
    fail-fast guidance as an unsupported integration rather than posting a mention nothing will answer.
  - `promptless` — **label** strategy (applies the label Promptless's GitLab webhook subscribes to).
- **Honesty over false parity.** Any integration name not in the launch set (notably `copilot`, which is
  GitHub-only) makes the component **fail fast with a helpful message** naming the supported set and the
  GitLab-native alternative (`duo`) — rather than silently mentioning a bot that will never answer.
- **`prompt` parity.** Same `prompt` input, same default string as the Action ("Investigate potential
  causes of the failures reported in this Doc Detective test output and suggest fixes."), fed into the
  mention/label/note body identically.

## 7. Documentation impact

Per `CLAUDE.md` this feature has clear user-facing impact; docs travel with it. Persona **Priya**
(CI/platform engineer), CUJ **P1**. The IA already reserves the slot: *"CI recipes: other platforms
(new)"* — this work **promotes that into a dedicated GitLab page**.

- **New:** `docs/fern/pages/docs/ci/gitlab-component.mdx` — mirror of `github-action.mdx` (add component,
  gate the pipeline, wire the JUnit artifact, open MRs/issues, hand off to integrations, the
  token/permission caveat). Register it in `information-architecture.md`'s content-set map under the CI
  track.
- **Update:** `docs/ci/overview.mdx` — promote GitLab from "roll your own" (§"Scale beyond a single
  GitHub repo") to a first-class entry under "Add the gate to your pipeline."
- **Update:** `docs/ci/reporters-and-artifacts.mdx` — add `junit` to the reporter table; add
  **`--exit-on-fail`** as a third (and simplest) way to "fail CI when tests fail", alongside the Action
  and the JSON-parse recipe.
- **Update:** `docs/get-started/integrations.mdx` — currently GitHub-issue-specific; generalize to a
  per-platform support matrix, document the GitLab handoff strategies, and call out `copilot` as
  GitHub-only + `duo` as GitLab-native.
- **Update source-of-truth row:** `information-architecture.md` "Reporters & artifacts → `src/reporters/`"
  stays accurate once the `junit` reporter lands there.

## 8. Sequencing / roadmap

| Phase | Deliverable | Repo | Depends on |
|---|---|---|---|
| **0** | This design + alignment | this repo (`docs/design/`) | — |
| **1** | `--exit-on-fail` / `exitOnFail` (ADR + fixtures + docs) | this repo | 0 |
| **2** | `junit` reporter (ADR + fixtures + docs) | this repo | 0 |
| **3** | GitLab CI/CD Component: inputs, artifact wiring, MR/issue creation, **integrations handoff** | new repo `doc-detective/gitlab-component` | 1–2 |
| **4** | Docs: new GitLab page + overview/reporters/integrations updates | this repo | 1–3 |

Phase 1 (`--exit-on-fail`) is the chosen first primitive: smallest change, highest leverage, unblocks
gating on *every* non-GitHub CI, and the component's `exit_on_fail` is a thin delegation to it.

## 9. Decisions & remaining questions

**Decided:**

1. **exit-on-fail** — `FAIL` only (WARNING non-fatal); reuse exit code `1`. (§4.1)
2. **Integration launch set** — `claude` (mention), `duo` (Duo quick action, GitLab-native), `promptless` (label);
   fail-fast-with-guidance on any other name including GitHub-only `copilot`. (§6)
3. **No Code Quality reporter** — dropped; GitLab's `codequality` artifact is an inline-annotation
   transport, not linting, but the name misleads and the JUnit test widget already covers the need. (§4.4)
4. **Reporter output path** — Option A: conventional fixed filename (`junit.xml`) in the `output` dir;
   no schema change. (§4.3)
5. **Component repo** — a new separate repo `doc-detective/gitlab-component` on the CI/CD Catalog, mirroring
   github-action (created outside this repo when Phase 3 begins). (§5)
6. **MR note on failure** — ship it behind an input (`comment_on_mr`, default off); the JUnit widget is
   the primary surface. (§5.1)

**Still open (can be settled at their phase, not blocking Phase 1):**

- Whether Phase 3 later promotes `dosu`/`doc-sentinel`/`cursor`/`opencode` from "future" to "supported"
  once verified on GitLab. (§6)
