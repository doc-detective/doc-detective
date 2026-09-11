---
status: accepted
date: 2026-07-15
decision-makers: doc-detective maintainers
---

# `exitOnFail`, an opt-in CLI gate that exits non-zero on spec failures

## Context and Problem Statement

The `doc-detective` CLI **always exits `0` when tests fail**. It sets a non-zero exit code only on a
crash or invalid config, never because a spec's result is `FAIL`. This is deliberate and historical.
The "fail the build" decision has lived in CI wrappers, not in the runner. Chiefly that's the Doc
Detective GitHub Action's `exit_on_fail` input. The policy is spelled out in the header of
`scripts/check-fixture-results.cjs`.

The cost falls on every CI that is **not** the GitHub Action. To gate a build on GitLab CI, Jenkins,
CircleCI, or a bare shell, users must run `--reporters json`. They then hand-roll a
`node -e "process.exit(require('./results.json').summary.tests.fail > 0 ? 1 : 0)"` wrapper. That's
the first-class GitLab CI effort's foundational gap; see
[`docs/design/gitlab-ci-first-class-support.md`](../docs/design/gitlab-ci-first-class-support.md), Phase 1.
The planned GitLab CI/CD Component's `exit_on_fail` should be a thin delegation to the CLI, not a
re-implementation of the parse. How should the CLI let a user opt into failing the process on test
failures?

## Decision Drivers

* Any CI that reads an exit code must be able to gate on Doc Detective without a bespoke JSON parser.
* The default must not change. Existing pipelines, and this repo's own fixture gate, rely on exit `0`.
* It must flow through the merged `config` object like every other knob, per the repo's
  CLI-flags-to-config contract. Config files and `DOC_DETECTIVE_CONFIG` then reach the same code
  path as the flag.
* The fail condition must match the contract the rest of the system already trusts.

## Considered Options

* **A. Opt-in `exitOnFail` config + `--exit-on-fail` flag, default `false`** (chosen).
* **B. Make the CLI exit non-zero on failure by default** (breaking change).
* **C. Leave it to CI wrappers only**, the status quo, where a GitLab component re-implements the parse.

## Decision Outcome

Chosen option: **A**. It closes the gap for every CI while preserving the historical default. It gives
the GitLab component, and any pipeline, a single flag to delegate to, instead of a re-implemented parse.
B would silently break existing pipelines that expect exit `0`. C perpetuates per-platform wrapper
duplication, the exact thing first-class GitLab support exists to remove.

Behavior decided:

1. New boolean config field **`exitOnFail`**, default **`false`**, in `config_v3`.
2. New CLI flag **`--exit-on-fail`** (alias `-e`); `--no-exit-on-fail` overrides a config that enables it.
   It flows through `setConfig` onto `config.exitOnFail`, and runtime never reads `args`.
3. When `config.exitOnFail` is truthy and the completed run has **at least one spec with result `FAIL`**,
   the CLI sets `process.exitCode = 1` after reporters run.
4. **Granularity: `FAIL` only.** The gate keys on `summary.specs.fail > 0` via a pure helper
   `shouldFailRun(results)` in `src/core/utils.ts`. That's the same `specs[].result === "FAIL"` contract
   this repo's own CI gate (`scripts/check-fixture-results.cjs`) uses. `WARNING` and `SKIPPED` are non-fatal.
5. **Exit code: reuse `1`** for both test failures and config/crash errors. A distinct code (e.g. `2` for
   crashes) is left as a future additive refinement if pipelines need to distinguish them.
6. The gate never clobbers an already-set non-zero exit code, and does not run on `--dry-run` (which
   returns before reporters).

### Consequences

* Good: any exit-code-reading CI can gate on Doc Detective with one flag; the GitLab component's
  `exit_on_fail` becomes a pass-through, not a parse.
* Good: the default is unchanged. Existing pipelines and the GitHub Action's `exit_on_fail: false`
  default keep exiting `0`. So does this repo's `fixtures.yml` gate, which runs the CLI under
  `|| true` and gates through `check-fixture-results.cjs`.
* Good: `shouldFailRun` is pure and defensive (a missing/malformed summary yields `false`), so a report
  shape regression can't spuriously fail a passing build.
* Neutral: the gate keys on `specs.fail`, not `tests.fail`. A failing test always rolls up to a failing
  spec, so the two agree. `specs` is also the top-level contract the fixture gate already reads.

### Confirmation

Red→green across the five wiring steps. There's a `config_v3` positive/negative/default triple in
`src/common/test/validate.test.js`. There's a yargs parse test and a `setConfig` override test in
`test/utils.test.js`. There's a `shouldFailRun` unit test (fail>0, no-fail, warning-only, malformed
shape) in `test/core-utils-coverage.test.js`. And there are four end-to-end CLI process-exit
assertions in `test/cli-index-adapters-coverage.test.js`. Flag on plus FAIL → exit 1. Flag off plus
FAIL → exit 0, for back-compat. Flag on plus all-pass → exit 0. And `exitOnFail: true` through a
config file → exit 1, proving the file→config→runtime path. The end-to-end FAIL is produced offline and deterministically by an
`httpRequest` to a closed loopback port (`http://127.0.0.1:1`), so the tests need no browser or network.

**No `*.spec.json` feature fixture is added, by design.** The feature's only observable effect is the
process exit code on a `FAIL` run. The fixture gate (`scripts/check-fixture-results.cjs`) requires
every fixture to resolve to PASS or SKIPPED. A spec that FAILs to exercise the gate would fail the
gate itself. This is the documented exception in `CLAUDE.md`: "a precise assertion the 'no spec
fails' gate can't express". The four focused `it(...)` CLI integration tests above are the correct
coverage, driving the real `bin/doc-detective.js` end-to-end.

## Pros and Cons of the Options

### A. Opt-in flag + config, default false
* Good: closes the gap for all CI; no behavior change by default; single delegation point for wrappers.
* Bad: a user who wants gating must remember to set it. That's mitigated, since it's documented as
  the simplest of the three "fail CI" options.

### B. Non-zero on failure by default
* Good: no opt-in needed; "just works" for gating.
* Bad: it's a breaking change. It silently flips the exit code for every existing pipeline, including
  this repo's own fixture gate and the GitHub Action's default path.

### C. CI wrappers only (status quo)
* Good: zero CLI change.
* Bad: every non-GitHub CI re-implements the JSON parse. The GitLab component would duplicate logic
  the GitHub Action already owns, contrary to the first-class-GitLab goal.

## More Information

Part of the first-class GitLab CI initiative
([`docs/design/gitlab-ci-first-class-support.md`](../docs/design/gitlab-ci-first-class-support.md)),
Phase 1 of 4. Phase 2 adds a `junit` reporter; Phase 3 is the GitLab CI/CD Component (separate repo)
whose `exit_on_fail` delegates to this flag.

ADR number `01066` is provisional. ADR numbers are assigned at merge, and collide across concurrent
PRs; `01057` and `01061` already do. Renumber the later-merged file if it clashes.
