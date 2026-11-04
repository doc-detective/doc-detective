---
status: accepted
date: 2026-11-04
decision-makers: doc-detective maintainers
---

# Prepare 4.x users for 5.0: upgrade warnings, an update guard, and a major-release guard

## Context and Problem Statement

[ADR 01146](01146-cli-v5-contract.md) makes 5.0 a single breaking release. Three things on 4.x would
make that release hurt:

- Auto-update re-execs onto whatever `latest` is, so 4.x users outside CI would land on 5.0 without
  choosing it.
- Nothing tells users that their usage will break. A run with failures exits `0` today and exits `1` on
  5.0, with no warning in between.
- `release.yml` promotes to `@latest` on its own, and squash bodies skip the commit-msg hook. A stray
  `BREAKING CHANGE:` footer on main would ship 5.0.0 by accident.

What must ship on 4.x so that 5.0 reaches users by choice, with warning?

## Decision Drivers

- Moving to a new major is the user's call.
- 4.x behavior doesn't change. Exit codes stay as they are, and a warning never fails a run.
- Warnings can't corrupt machine-readable output, so stdout stays clean for `--dry-run` JSON and LSP.
- A warning has to name what the user does next, and link the same page every time.
- The major-release check has to cover every route a footer can take to main.

## Considered Options

- **A. Warn on stderr for each affected usage, guard the update check, and guard the release type.**
- **B. A single notice on every run.**
- **C. Warn only about the exit code.**

## Decision Outcome

Chosen option: **A**.

### Update guard

`checkForUpdate` doesn't update across a major. When `latest` is a newer major, it logs the
`npm i doc-detective@<major>` command. It then updates through the `release-<major>.x` dist-tag if
that holds something newer in the current major. A tag holding another major is ignored. The
local-install message names the exact version, not `@latest`. Update notices move to stderr.

### Upgrade warnings

Each warning goes to stderr once per process, and links
`https://docs.doc-detective.com/docs/ci/upgrade-to-v5`.

| Trigger | 5.0 behavior |
|---|---|
| A run has failed specs and `exitOnFail` is unset | Exits `1` |
| A run tested nothing and `exitOnFail` isn't `false` | Exits `2` |
| `--output` or `output` names a folder | Needs `--output-dir` |
| `install-agents` | Removed; use `install agents` |
| `-a` or `-s` on the agents install command | Removed; use `--agent` and `--scope` |
| `install --silent` | Removed; use `--quiet` |
| `--concurrent-runners` with no value | Removed; use `--concurrent-runners true` |
| The `doc-detective-lsp` bin | Removed. `doc-detective-runner` doesn't warn, as only hosted images call it |

An output path names a folder when it ends in a slash, is an existing directory, or has no file
extension. 4.x itself treats that last case as a folder. It's stricter than 5.0's check, so
a first run to a new `--output results` warns too.

Warnings stay quiet at `logLevel: silent`, and when `DOC_DETECTIVE_META.dist_interface` is
`github-actions`, because Action v1.7 has its own notice.

### Unset `exitOnFail`

AJV fills schema defaults, which hid whether the user set `exitOnFail`. The default moves out of
`config_v3` to the consumption site. The exit gate in `src/cli.ts` already treats unset as false, so
the default stays exit `0` and stays documented in the field's description.

### Release wiring and major-release guard

`.releaserc.json` gains a `4.x` maintenance branch on channel `release-4.x`, and `release.yml` runs on
it. The branch itself is cut at GA. The channel has to be named, because the default of `4.x` parses as
a semver range and `scripts/publish-staged-release.js` refuses it.

`scripts/verify-major-release.js` runs as `verifyReleaseCmd`. It fails a `major` on a non-prerelease
branch unless `ALLOW_MAJOR_RELEASE` is `true`. That's a repository variable, passed from
`vars.ALLOW_MAJOR_RELEASE`, and unset is the normal, locked state. It reads the computed release type,
so it covers every route a footer can take. Prerelease channels are exempt, so `feat/v5-rc` keeps
releasing.

### Consequences

- Good: 5.0 reaches 4.x users only when they choose it, and they can still get 4.x fixes.
- Good: anything a user has to change gets named before it breaks.
- Good: our own callers (`postinstall`, hints, docs, agent error messages) moved to the forms that
  keep working, so we don't trigger our own warnings.
- Good: a stray footer stops the release before anything publishes.
- Neutral: `config.exitOnFail` is now `undefined` rather than `false` when unset. Programmatic readers
  that test truthiness see no change.
- Bad: `--output-dir` doesn't exist on 4.x, so a user with a folder `output` can't silence that warning
  until they upgrade.
- Bad: doc-detective.com runs set a folder `output`, and they aren't `github-actions`, so those warnings
  appear in platform run logs until the platform image moves.
- Bad: a real major needs a maintainer to set the variable first, then unset it afterward.

### Confirmation

- `test/upgrade-warnings.test.js` spawns the real CLI and bins, and asserts streams and exit codes for
  each trigger and each quiet path, including that `--dry-run` stdout parses as JSON.
- `test/runtime-helpers-coverage.test.js` covers same-major, newer-major with and without the tag, a
  tag holding another major, and prereleases.
- `test/release-config.test.js` asserts that no channel parses as a semver range. It also runs the guard
  for a major with the variable unset and set, a major on a prerelease channel, and a non-major.

## Pros and Cons of the Options

### A. Targeted warnings and guards

- Good: passing suites stay quiet unless they use something that's going away.
- Bad: more triggers to maintain, though all of them disappear with 4.x.

### B. A single notice on every run

- Good: reaches everyone, with one code path.
- Bad: it's noise during the preview, and it doesn't tell a user whether they're affected. The final
  4.x update carries this notice instead, once 5.0 exists.

### C. Exit code only

- Good: the smallest change.
- Bad: every other change in ADR 01146 would then break users with no warning.
