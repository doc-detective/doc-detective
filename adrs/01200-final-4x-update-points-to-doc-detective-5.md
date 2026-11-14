---
status: accepted
date: 2026-11-13
decision-makers: hawkeyexl
---

# The final 4.x update points every run to Doc Detective 5

## Context and Problem Statement

Doc Detective 5.0.0 is on `@latest`, the Docker `latest` tag, and Action `@v2`. People on 4.x don't
see that unless they read the announcement. Pinned installs, `doc-detective@4`, and Action `@v1` keep
running 4.x quietly. The 4.x warnings from ADR 01147 cover specific settings and failed runs only, so
a fully passing suite gets no word that 5 exists. How does a 4.x user learn that 5 is out and how to
move?

## Decision Drivers

- Reach every 4.x run, including CI and Action `@v1`, where the update check doesn't run.
- Don't break or slow a 4.x run. The notice changes no exit code and makes no network call.
- Make no promise about 4.x support. The maintainer decided not to commit to a security-support window.

## Considered Options

- Print a notice after every run from a final 4.x release on the `release-4.x` channel.
- Rely on the announcement and `npm deprecate`.
- Print the notice only when the registry shows a newer major.

## Decision Outcome

Chosen option: "Print a notice after every run", because it's the only option that reaches CI and
Action `@v1` runs, and it needs no registry check, since this release only exists once 5.0 does.

The notice prints once, on stderr, after the reporters and the hint, on every run except at
`logLevel: silent`. It also prints in the Action's legacy path, which the ADR 01147 warnings skip. It
names what changes, how to keep 4.x exit codes while triaging, the upgrade for npm, the Action, and
Docker, and the upgrade guide. It says nothing about how long 4.x gets fixes.

When `GITHUB_ACTIONS` is `true`, the run also prints one `::notice` workflow command on stdout, with
the first line and the guide link, so the notice shows on the run page at any Action version. The
Action reads results from its `--output` file, so the extra stdout line can't break it.

The release ships from the `4.x` branch as a `fix:` to the `release-4.x` dist-tag, so `@latest`
stays on 5.x and `doc-detective@4` resolves to it.

### Consequences

- Good, because every 4.x user who runs the CLI learns that 5 exists, in CI too.
- Good, because stdout, exit codes, and results files don't change.
- Bad, because a 4.x run's stderr always ends with the notice, until the user upgrades or sets
  `logLevel: silent`.

### Confirmation

`test/upgrade-warnings.test.js` covers the notice after passing and failing runs, in the Action's
legacy path, the `::notice` line in GitHub Actions, and its absence at `silent`. After release, `npm view doc-detective@4 version` returns
the new patch and `npm view doc-detective dist-tags.latest` is still 5.x.

## Pros and Cons of the Options

### Print a notice after every run

- Good, because it reaches every run, with no network call.
- Bad, because it adds lines to every run's stderr.

### Rely on the announcement and `npm deprecate`

- Good, because 4.x output stays unchanged.
- Bad, because CI logs and Action `@v1` runs never show it, and `npm deprecate` says nothing about how
  to move.

### Print only when the registry shows a newer major

- Good, because it would stay quiet if 5 didn't exist.
- Bad, because 5 does exist, and the check doesn't run in CI, where most 4.x runs happen.
