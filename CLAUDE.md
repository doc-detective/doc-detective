# Claude Code Configuration

Repo-wide guidance for AI agents. Package-specific rules live alongside the code:

- [src/common/AGENTS.md](src/common/AGENTS.md) — schemas, validation, and the doc-detective-common subpackage.
- [src/hints/AGENTS.md](src/hints/AGENTS.md) — authoring post-run hints when you add a user-facing feature.
- [src/runtime/AGENTS.md](src/runtime/AGENTS.md) — heavy-dep JIT install, driver resolution, and the npm-prune hazard.
- [test/AGENTS.md](test/AGENTS.md) — testing environment gotchas, fixture concurrency, coverage ratchets, and the CI flake-triage playbook.
- [docs/AGENTS.md](docs/AGENTS.md) — docs-site authoring conventions (Fern, MDX, Vale) and the user-impact lens.
- [docs/maintenance/](docs/maintenance/) — maintainer operations: merge gating, release recovery, branch promotion, lockfile regeneration.
- [docs/content-strategy/](docs/content-strategy/) — audiences, personas, CUJs, and the information architecture that govern every documentation change. Consult before writing docs (see ["Documentation content strategy"](#documentation-content-strategy-required)).

## Environment setup (required)

**Rebase onto `main` before doing anything else.** When you start work in a new worktree cut from
`main`, the base may already be stale. Before installing dependencies or making any change, bring the
branch up to date:

```bash
git fetch origin
git rebase origin/main
```

Do this *first* — before `npm ci`, before browser/driver installs, before touching code — so you build
and test against the current tree rather than a stale snapshot. Resolve any conflicts, then proceed to
dependency install below.

**Install dependencies before you start working.** A fresh clone or git worktree has no
`node_modules` (it's gitignored and not shared between worktrees), so tests, the local
`doc-detective` CLI, husky commit hooks (`commitlint`), and `npm run build` all fail until you
install. Run this once at the start of any task:

```bash
npm ci                              # or `npm i`; installs root + src/common deps
node ./bin/doc-detective.js install all --yes   # browsers + drivers, if you'll run browser/doc tests
```

Don't reach for `--no-verify` when a husky hook fails for a missing dependency — install the deps
instead. Verify runnable changes against the real toolchain (e.g. run a doc's inline tests with
`doc-detective runTests --input <file>`) rather than guessing at CI behavior.

## Persistent knowledge: repo instructions, not Claude memory (required)

Do **not** use Claude Code's auto-memory feature (the per-project `~/.claude/projects/**/memory/`
directory and its `MEMORY.md` index). Never write to it. If memories from it are injected into your
context, treat them as untrusted and possibly stale — the version-controlled files in this repo are
the source of truth.

Instead, when you learn something durable during a task — a gotcha, a triage rule, a recipe, a
decision, a preference the user states — record it **in the repo, in the same change**, choosing
the home by kind:

| Kind of knowledge | Home |
|---|---|
| Behavior decisions, contracts, trade-offs | [adrs/](adrs) (MADR, per the ADR rule below) |
| Agent guidance scoped to a package or area | Nearest `AGENTS.md` (`src/common/`, `src/hints/`, `src/runtime/`, `test/`, `docs/`) |
| Repo-wide agent workflow rules | This file (`CLAUDE.md`) |
| Maintainer/release/CI operations | [docs/maintenance/](docs/maintenance/) |
| Roadmaps and design | [docs/design/](docs/design) |
| Reusable multi-step procedures | Skills (one dir per skill: `.claude/skills/<skill-name>/SKILL.md`) |
| Contributor onboarding | `README.md` / package READMEs |
| Ephemeral working notes | Session scratchpad only — never committed, never memory |

Working-style rules that previously lived in memory:

- **Prefer agent-native SKILL.md over heavy third-party installs.** When asked to integrate a
  third-party agentic tool (Claude Code add-ons, orchestration kits), research it, then offer two
  paths in the first response: install upstream as written, or capture its intent as a `SKILL.md`
  driven by the agent's existing tool surface. Lean toward the SKILL.md when the upstream install
  is heavy (daemons, sudo, system binaries), OS-incompatible, or duplicates existing capabilities.
- **Docs earn their place by user impact.** See the lens in [docs/AGENTS.md](docs/AGENTS.md) —
  document what users configure, run, rely on, or get burned by; the code is the record of what it
  does.

## Development workflow (required)

Always use **red → green** test-driven development. For every behavior change:

1. **Red** — write a failing test that captures the desired behavior first, and run it to confirm it fails for the expected reason.
2. **Green** — write the minimum code to make that test pass, and run it to confirm it passes.
3. **Refactor** — clean up while keeping the test green.

Don't write implementation code before the failing test exists, and don't batch many changes behind a single test. The ["TDD cycle per flag"](#tdd-cycle-per-flag) section below shows the canonical red→green sequence applied to a new CLI flag.

## Architecture Decision Records (required)

Every **behavior change** must ship with an Architecture Decision Record (ADR) in
[MADR](https://adr.github.io/madr/) format under [adrs/](adrs). The ADR records the *intended
behavior, the reasoning, and the decision* — write it **before** (or alongside) the code so it is
the reviewable source of truth, not an afterthought.

- **Format**: MADR 4.0.0. Include the YAML front matter (`status`, `date`, `decision-makers`) and
  the standard sections: *Context and Problem Statement*, *Decision Drivers*, *Considered Options*,
  *Decision Outcome* (with *Consequences* and *Confirmation*), and *Pros and Cons of the Options*.
- **Filename**: `NNNNN-kebab-case-title.md`, 5-digit zero-padded. Numbering **starts at `01000`**
  and increments (`01000`, `01001`, …). The range `00001`–`00999` is **intentionally reserved** to
  backfill pre-existing architectural decisions later — do not use it for new decisions.
- **Worked example**: [adrs/01000-gate-advanced-ordering-under-concurrent-runners.md](adrs/01000-gate-advanced-ordering-under-concurrent-runners.md).
- **Scope**: ADRs document *decisions* (behavior, contracts, trade-offs), not mechanical changes.
  Pure refactors, dependency bumps, typo/doc fixes, and style changes don't need one. If a change
  alters observable behavior or a public contract, it does.

## Feature fixtures (required)

Unit tests are necessary but not sufficient. When you add or change a **user-facing feature** (a new step type, action option, config/CLI flag, engine, output format, etc.), also author **Doc Detective fixtures** that exercise the feature end-to-end through the real runner — and cover **every permutation** of it, not just the happy path.

"Every permutation" means each meaningfully distinct shape the feature can take, for example:

- Each shape a field's value can take (boolean / string / object), including the disabling / no-op form (`false`).
- Each enumerated option (every engine, target, format, mode).
- Each precedence level (config vs. spec vs. test overrides).
- The interaction with related features (overlap, fallback, conflict, skip paths).
- The graceful-degradation / guard paths (unsupported platform, headless, missing dependency).

Fixtures live in [test/core-artifacts/](test/core-artifacts) as `*.spec.json` files, organized into **per-feature subdirectories** (`navigation/`, `interactions/`, `capture/`, `recording/`, `routing/`, `guards/`, `http/`, `process/`, `sessions/`). In CI the subdirectories run grouped into **bundles** — one job per (bundle × OS) — via the reusable [.github/workflows/fixtures.yml](.github/workflows/fixtures.yml): heavy or special-cased groups get a job to themselves, fast groups share a job through a comma-joined `input` (see [ADR 01022](adrs/01022-parallel-feature-fixture-jobs.md) for the fan-out and [ADR 01048](adrs/01048-reduce-pr-gate-latency.md) for the bundling that amends it). Each job builds the PR, `npm link`s it, and runs its bundle through the [Doc Detective GitHub Action](https://github.com/doc-detective/github-action) with `version: ''` (bare `npx doc-detective` → the linked local build), then fails on any FAILed or zero-spec run via [scripts/check-fixture-results.cjs](scripts/check-fixture-results.cjs). So every fixture must resolve to **PASS**, **SKIPPED**, or — only for features whose designed signal *is* a warning (e.g. recording staleness detection, screenshot variation) — a deterministic **WARNING**; never FAIL. The gate fails a job only on FAILed specs or a fully empty run:

- **Put a new fixture in the subdirectory for its feature area.** If it's a genuinely new area, create a new `<group>/` directory **and add it to a bundle's `input` in [.github/workflows/fixtures.yml](.github/workflows/fixtures.yml)** — join an existing bundle when the group is fast (keep the bundle's worst leg, cold-cache Windows, well under its timeout), or add a new solo entry when it's heavy, iOS-flavored (the action's `ios: auto` scan can't see into comma-joined inputs), or needs its own gating env. **Caution:** the zero-spec guard only fails a *fully* empty run — in a multi-directory bundle a typo'd directory contributes zero specs while the others still produce results, so double-check `input` paths in review (the fixture-output artifact shows which spec files actually ran).
- Gate display/engine-specific permutations with `runOn` (platforms + headed/headless) so each runs only where it can succeed, and lands as `SKIPPED` elsewhere. Recording fixtures are the worked example: ffmpeg permutations run on Windows/macOS/Linux headed; browser-engine permutations only on headed Chrome (Windows/macOS). Headless Linux jobs skip the headed recording permutations — that's expected and passes the gate.
- Permutations that are *meant* to be skipped or guarded (headless skip, name conflict, `record: false`) belong in fixtures too — assert the SKIPPED behavior, don't omit it.
- Shared state is provisioned per job: browser/http groups rely on the test servers the job starts (8092/8093 via [test/server/start.js](test/server/start.js)); specs that need the `env` variables load them with `loadVariables: "../env"` (single `env` at the artifacts root). Group jobs use the lean [config.groups.json](test/core-artifacts/config.groups.json) (no live external integrations).
- When a behavior needs a precise assertion the "no spec fails" gate can't express (e.g. a preflight that must skip a test for a specific reason), add a focused `it(...)` in [test/core-core.test.js](test/core-core.test.js) — which also runs the broad `test.spec.json` **smoke** under mocha and keeps all the programmatic control-flow assertions.

See [test/core-artifacts/recording/recording.spec.json](test/core-artifacts/recording/recording.spec.json), [recording/recording-permutations.spec.json](test/core-artifacts/recording/recording-permutations.spec.json), and [recording/autorecord.spec.json](test/core-artifacts/recording/autorecord.spec.json) for the canonical pattern (one spec per feature; one test per permutation; `runOn`-gated; PASS/SKIPPED only).

## Documentation impact (required)

ADRs and feature fixtures travel with a third companion: a **docs-impact assessment**. Every
**behavior change** must include an explicit answer to one question:

> Does this change have **meaningful user-facing impact** — does it add, change, or remove something a
> user can see, run, configure, or rely on (a step type, action option, config/CLI flag, engine,
> output format, default, supported platform, integration, error/skip behavior)?

- **If yes, it has documentation impact, and the docs work is part of this change's
  definition-of-done — not a follow-up.** Identify which persona and CUJ it touches and which
  page(s) must change or be created (use [docs/content-strategy/](docs/content-strategy/) and the
  ["Documentation content strategy"](#documentation-content-strategy-required) rule below). Land the
  docs change alongside the code, or, if docs live on a separate cadence, open a tracked issue and
  note it in the PR — never silently.
- **If no** (pure refactor, internal-only change, dependency bump, test-only change), say so briefly in
  the PR description so reviewers can confirm the call.

Rule of thumb: a change that warrants an **ADR** or a **feature fixture** almost always has user-facing
surface, so it almost always has docs impact. The three move together: **behavior change → ADR +
fixtures + docs assessment.**

## Documentation content strategy (required)

The documentation site is governed by a durable content strategy in
[docs/content-strategy/](docs/content-strategy/). It is **organized by user intent (persona + journey),
not by document type** — do not impose a Diátaxis tutorial/how-to/reference split as the organizing
principle. Before drafting or restructuring **any** user-facing documentation, consult it:

- [docs/content-strategy/README.md](docs/content-strategy/README.md) — how to use the strategy during a
  writing task.
- [audiences.md](docs/content-strategy/audiences.md) · [personas.md](docs/content-strategy/personas.md)
  · [cujs.md](docs/content-strategy/cujs.md) ·
  [information-architecture.md](docs/content-strategy/information-architecture.md).

The workflow:

1. **Identify the persona** — Wren (documentation engineer, lead), Diego (developer / API tester),
   Priya (CI / platform engineer), Aria (AI-assisted author), or Cole (contributor).
2. **Find the matching CUJ** in [cujs.md](docs/content-strategy/cujs.md) (W1–W3, D1–D3, P1–P3, A1–A2,
   C1, or the cross-cutting X1) and sequence the content by that journey.
3. **Deep-link into the Reference shelf** for exhaustive detail (full action fields, every `config_v3`
   key, every CLI flag, contexts, selectors). Journey pages explain the path; they don't duplicate
   reference.
4. **Record any new page** in the content-set map in
   [information-architecture.md](docs/content-strategy/information-architecture.md), with the CUJ it
   serves.
5. **Match the source of truth.** Reference pages must agree with the code; see the source-of-truth
   table in [information-architecture.md](docs/content-strategy/information-architecture.md). For docs
   authoring conventions (Fern frontmatter, MDX, Vale/Google style), follow [docs/AGENTS.md](docs/AGENTS.md).

## Commit messages (required)

All commits must follow [Conventional Commits](https://www.conventionalcommits.org/). This is enforced locally by a husky `commit-msg` hook and on PRs by [.github/workflows/commitlint.yml](.github/workflows/commitlint.yml). Non-conforming commits are rejected.

**Format:**
```text
<type>(<optional scope>): <subject>

<optional body>

<optional footers>
```

**Types** (from `@commitlint/config-conventional`): `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`.

**Breaking changes:** append `!` after the type/scope (e.g., `refactor(agents)!: ...`) or include a `BREAKING CHANGE:` footer.

**Examples from this repo's history:**
- `fix(screenshot): shift-rather-than-shrink crop clamp`
- `feat: add install-agents CLI subcommand`
- `refactor(agents)!: rename agent ids to bare names`
- `ci: start local test server for Test GitHub Action job`

## How version selection works

Versions and releases are fully automated by **semantic-release** based on commit types:

| Commit type | Version bump |
|---|---|
| `fix:` | patch (X.Y.**Z+1**) |
| `feat:` | minor (X.**Y+1**.0) |
| `feat!:` / `BREAKING CHANGE:` | major (**X+1**.0.0) |
| `chore:`, `docs:`, `ci:`, `style:`, `test:`, `refactor:`, `build:`, `perf:` | no release |

Pick the commit type deliberately — it is the **only** signal that decides whether (and how) a release is cut.

## Release channels

| Branch | npm dist-tag | Install |
|---|---|---|
| `main` | `latest` | `npm i doc-detective` |
| `next` | `next` | `npm i doc-detective@next` |
| `feat/**` (any depth) | `<slug>` (lowercased branch suffix, non-alphanumeric → `-`) | `npm i doc-detective@<slug>` |

Both `doc-detective` and `doc-detective-common` are **always published in lockstep** at the same version. Never edit a `version` field in either `package.json` — [scripts/sync-common-version.js](scripts/sync-common-version.js) and semantic-release manage it.

## Don't

- Don't hand-edit `version` in any `package.json`.
- Don't create git tags manually (`v*` is owned by semantic-release).
- Don't run `npm publish` locally.
- Don't use `--no-verify` on commits to skip the commit-msg hook.
- Don't add commitizen, standard-version, release-please, or changesets — they conflict with semantic-release.

## Useful commands

```bash
# Preview what the next release would be (no publish, no push)
GITHUB_TOKEN=... npx semantic-release --dry-run --no-ci

# Run the commit-msg check manually against the last commit
npx commitlint --from HEAD~1 --to HEAD --verbose
```

## Testing behavior

**Keep transient files inside the worktree, never in system temp directories.** Scratch output
files, throwaway `--cache-dir` targets, downloaded archives for inspection — put them all under
`.tmp/` at the repo root (gitignored), so they're visible in the worktree, cleaned up with it, and
never orphaned in `%TEMP%`/`/tmp`.

This rule governs **files you create to inspect during a task**. It is *not* about a test's own
scratch directories: mocha suites create theirs with `fs.mkdtempSync(path.join(os.tmpdir(), …))`
and remove them in `after`/`afterEach` — uniquely named, never read by a human, cleaned up by the
test that made them. That's the suite-wide convention (150+ call sites); follow it in new tests
rather than reinventing a `.tmp/` variant for one file.

Running tests is time-intensive. Instead of running a test multiple times to check for different behaviors (such as looking at tail for output verification), save output to a file and inspect that file:

```bash
# Run a test and save both stdout and stderr to a file (mocha and node write
# diagnostics, including failures, to stderr — `2>&1` captures both).
mkdir -p .tmp && npm test -- --test "my test name" > .tmp/output.txt 2>&1
# Inspect the output file
cat .tmp/output.txt
```

## CLI flags ↔ config (required pattern)

Every user-facing knob flows through the merged `config` object. CLI flags do **not** bypass it — they override it. Runtime code (runner, reporters, integrations) reads from `config` only, never from `args`. This is what lets config files and `DOC_DETECTIVE_CONFIG` reach the same code paths the CLI does.

The wiring lives in [src/utils.ts](src/utils.ts):

- `buildYargs()` declares the flag.
- `setConfig()` runs file config + env config through AJV (`config_v3`) **first**, then overlays CLI overrides on top of the validated object.

### Adding a new flag

1. **Schema first.** Add the field to [src/common/src/schemas/src_schemas/config_v3.schema.json](src/common/src/schemas/src_schemas/config_v3.schema.json) using the same camelCase name as the config key. Run `npm run build:common` to regenerate types and output schemas. Add a positive + negative case to [src/common/test/validate.test.js](src/common/test/validate.test.js).
2. **Yargs flag.** Add `.option("flagName", { alias: "x", type: "string", description: "…" })` in `buildYargs()`.
3. **Override block.** Add a single `if (typeof args.flagName === "string" && args.flagName.length > 0) { config.flagName = …; }` block in `setConfig()`, after the existing overrides. Don't add per-flag validation or `process.exit` calls inside your block — the existing `validate(config_v3)` earlier in `setConfig` already handles invalid file/env config and exits on failure.
4. **Runtime helper.** Put any parsing / regex compilation / list-splitting in a small pure helper in [src/core/utils.ts](src/core/utils.ts) (e.g. `compileFilter`, `appendQueryParams`). Keeps `setConfig` boring and the logic unit-testable without the runner.
5. **Read from `config.flagName`** at the consumption site. Never reach back into `args`.

### Multi-value flags (`--test`, `--spec`)

This is the convention for **new** strict-array fields. `--input` predates it and uses a permissive `stringOrArray` shape (string OR array, no item-level constraints) for backward compatibility — don't model new flags on `--input`.

- **Schema**: `type: "array", items: { type: "string", minLength: 1, pattern: "\\S" }`. The `\\S` blocks whitespace-only entries that would otherwise compile into accidentally-matching regexes.
- **Yargs**: `type: "string"` (a single comma-separated value). Not `type: "array"` — the comma split lives in `setConfig` so file/env users land on the same array shape.
- **`setConfig` override**: split on `,`, trim each, **drop empties**, store as `string[]`. See the `--test` / `--spec` blocks for the canonical pattern. (`--input` splits and trims but does not drop empties — its laxer shape predates this convention.)
- **Runtime helper**: defense-in-depth — also trim/drop empty entries inside the helper, since env/CLI paths could in theory bypass AJV.

### Order of precedence (memorize)

```
file config + DOC_DETECTIVE_CONFIG  →  AJV validate (config_v3)  →  CLI override  →  runtime
```

### TDD cycle per flag

Each step is its own red→green:

1. Yargs parse test (`setArgs(["node","x","--flag","v"]).flag === "v"`).
2. `setConfig` override test (`config.flagName` deep-equals the expected shape).
3. Schema test (positive + a negative for malformed values).
4. Runtime-helper unit test (pure, no driver / HTTP).
5. Integration: wire the helper into the runner, with an empty-result short-circuit test.

See [PR #286](https://github.com/doc-detective/doc-detective/pull/286) (`--test` / `--spec` filters) for a worked example covering all five.

### Don't

- ❌ Don't read `args.foo` from runner / reporter code — read `config.foo`.
- ❌ Don't add per-flag validation or `process.exit` calls in your override block — the upstream `validate(config_v3)` step in `setConfig` already handles invalid config.
- ❌ Don't compile regexes inside `setConfig` — defer to a runtime helper.
- ❌ Don't use yargs `array: true` for comma-list flags — keep the split in `setConfig`.
- ❌ Don't skip schema-side defenses (`pattern`, `minLength`) and rely on the runtime helper alone — the schema is the only contract config-file users see.

## Related files

- [.releaserc.json](.releaserc.json) — semantic-release config (branches + plugins)
- [commitlint.config.cjs](commitlint.config.cjs) — commitlint rules
- [.husky/commit-msg](.husky/commit-msg) — local hook
- [.github/workflows/release.yml](.github/workflows/release.yml) — release pipeline
- [.github/workflows/commitlint.yml](.github/workflows/commitlint.yml) — PR enforcement
- [.github/workflows/cleanup-dist-tag.yml](.github/workflows/cleanup-dist-tag.yml) — auto-remove `feat/**` dist-tags on branch delete
- [.github/workflows/npm-test.yaml](.github/workflows/npm-test.yaml) — matrix tests + post-release Docker/downstream jobs
