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
| The `doc-detective-lsp` bin | Removed. Only this bin warns, because hosted images are the only callers of `doc-detective-runner` |
| `-r` with several values, or `-t` or `-s` given twice | One comma-separated value; a repeat is a usage error |
| A `config` object in `DOC_DETECTIVE` | Deprecated; use `DOC_DETECTIVE_CONFIG` |
| A `container` key in `DOC_DETECTIVE` outside the official images, and `allowUnsafeSteps` unset | Doesn't allow unsafe steps |
| A boolean `DOC_DETECTIVE_*` env var whose meaning flips, or that 5.0 doesn't accept | One grammar for every boolean env var |
| Browsers load from a `browser-snapshots` folder | Ignored |
| A `reporters` name that isn't exact | Exits `2` |
| Spec content that 5.0 rejects or reads differently | Exits `2`, fails the step, or skips it |
| A context that names no browser ran on Firefox | Uses Chrome first |
| `autoScreenshot` is unset, and a step that drives a browser, app, or device ran | Saves a screenshot after every such step, in a run folder |
| `autoRecord` is unset, and a step that drives a browser, app, or device ran | Records browser, app, and device tests, including headless Chrome by tab capture |
| The run substituted a `$NAME` or loaded variables, and `publicVariables` is unset | Masks environment variable values in logs, reports, saved output, and browser captures |

An output path names a folder when it ends in a slash, is an existing directory, or has no file
extension. 4.x itself treats that last case as a folder. It's stricter than 5.0's check, so
a first run to a new `--output results` warns too.

Spec rows come from `runTests` right after it resolves tests, so they print before any step runs,
in a dry run too. They and the run rows below are the only rows a programmatic `runTests` call can
print. Each names
the spec file, not the line, and a file gets one warning per row. A row about a value, such as a URL,
names the first one and counts the rest. The once-per-process rule matches exact messages. A later
`runTests` call in the same process warns about a new file, but not again about the same file. They
read resolved steps, which keep the values as written, so a `"click": true` still reads as a boolean.
Inline steps in Markdown get the same checks.
Every check is a key lookup on a step, a test, or its routing entries, plus one scan for negative
`timeout`, `duration`, `delay`, and `wait` values. That scan skips user data, such as request bodies
and element attributes. No row runs another schema validation.

Spec rows print at the effective log level, after the `DOC_DETECTIVE` override applies. A dry run
forces silent for stdout's sake, so there they use the caller's level unless that override sets one.
A check that throws logs at debug level and never fails the run.

Run rows, for the browser, capture, and masking defaults, come from `runTests` right after a local
run, so they describe what ran. A dry run, a skipped context, and a run dispatched to the API stay
quiet. They follow the same log-level and error rules as spec rows.

- **What counts as a UI step.** A step that wasn't skipped, and that drives a browser, app, or device.
  That's the same test 5.0 uses for automatic capture, so `runShell`, `httpRequest`, `wait`, and
  process surfaces don't count.
- **Which browser.** The report's `browser.name`, so a fallback counts as the engine that ran. The
  resolver marks a browser the author named with `browser.explicit`.
- **Unset.** The key is undefined at the test, the spec, and the config, read from the resolved tests
  because a report doesn't carry them. `true` and `false` both silence a row, since either one means
  the user chose.
- **Variables.** `replaceEnvs` and `loadEnvs` set a flag in `upgradeNotice.ts`. A `$NAME` with no value
  and an empty `.env` don't set it. The row reads and clears the flag, so a later `runTests` call in the
  same process starts clean. `publicVariables` at any level silences the row for the whole run, because
  5.0 reads the levels as one list.

The official images set `DOC_DETECTIVE` themselves, with a `container` value that starts with
`docdetective/docdetective:`. The `container` row skips that value, because the 5.0 images allow unsafe
steps in their own config. A test checks that the Dockerfiles still set it.

There's no row for `beforeAny`. 4.x rejects `beforeAll`, so a user can't act on it, and 5.0 still reads
`beforeAny` with its own warning. The upgrade page lists the rename.

Warnings stay quiet at `logLevel: silent`, and when `DOC_DETECTIVE_META.dist_interface` is
`github-actions`, because Action v1.7 has its own notice. The runner sets neither, so the
`doc-detective` run it starts can still print the other warnings to hosted run logs.

### Unset `exitOnFail`, `autoScreenshot`, and `autoRecord`

AJV fills schema defaults, which hid whether the user set these keys. Each default moves out of
`config_v3` to the consumption site. The exit gate in `src/cli.ts` already treats unset as false, so
the default stays exit `0`. The capture resolvers read `Boolean(test ?? spec ?? config)`, so unset stays
off. Each default stays documented in the field's description.

### `publicVariables` on 4.x

4.x accepts `publicVariables` on the config, a spec, and a test, in the shape 5.0 reads. A user can
then act on the masking row before upgrading. 4.x doesn't mask values, so the key has no effect yet.
Its schema description says only what 4.x does, because interfaces describe the present. The upgrade
guide explains what 5.0 does with it. Specs accept unknown keys already. Declaring it there gives a
malformed value the error it gets on 5.0.

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
  that test truthiness see no change. A reader that tests `config.exitOnFail === false` now gets
  `false` for an unset value too, so it should test `!config.exitOnFail` instead.
- Neutral: the same holds for `config.autoScreenshot` and `config.autoRecord`, and a dry-run plan no
  longer lists them when they're unset.
- Bad: a passing run that drives a UI on defaults now warns, though nothing in it is wrong. Setting
  each key, either way, silences its row.
- Bad: `--output-dir` doesn't exist on 4.x, so a user with a folder `output` can't silence that warning
  until they upgrade.
- Bad: doc-detective.com runs set a folder `output`, and they aren't `github-actions`, so those warnings
  appear in platform run logs until the platform image moves.
- Bad: a real major needs a maintainer to set the variable first, then unset it afterward.

### Confirmation

- `test/upgrade-warnings.test.js` spawns the real CLI and bins, and asserts streams and exit codes for
  each trigger and each quiet path, including that `--dry-run` stdout parses as JSON. The run rows
  also run against a real browser.
- `src/common/test/validate.test.js` and `test/utils.test.js` check that `autoScreenshot` and
  `autoRecord` stay unset, and that `publicVariables` is accepted and checked on each level.
- `test/runtime-helpers-coverage.test.js` covers same-major, newer-major with and without the tag, a
  tag holding another major, and prereleases.
- `test/release-config.test.js` asserts that no channel parses as a semver range. It also runs the guard
  for a major with the variable unset and set, a major on a prerelease channel, and a non-major.

## Pros and Cons of the Options

### A. Targeted warnings and guards

- Good: passing suites stay quiet unless they use something that's going away, or rely on a default
  that's changing.
- Bad: more triggers to maintain, though all of them disappear with 4.x.

### B. A single notice on every run

- Good: reaches everyone, with one code path.
- Bad: it's noise during the preview, and it doesn't tell a user whether they're affected. The final
  4.x update carries this notice instead, once 5.0 exists.

### C. Exit code only

- Good: the smallest change.
- Bad: every other change in ADR 01146 would then break users with no warning.
