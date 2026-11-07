---
status: accepted
date: 2026-11-07
decision-makers: doc-detective maintainers
---

# One config env var and one precedence order

## Context and Problem Statement

[ADR 01146](01146-cli-v5-contract.md) § "Configuration and environment" names a precedence order: flags, the
shell's environment, a project `.env`, the project config, then the user config. The 5.0 release candidate
still broke it in several places:

- `DOC_DETECTIVE`, an older JSON variable, was merged by the runner *after* the flags, so
  `DOC_DETECTIVE='{"config":{"logLevel":"silent"}}' doc-detective -l info` ran silent. A bad value only
  warned, and an invalid `config` object printed its error twice.
- `DOC_DETECTIVE.container` turned on unsafe steps, so the Docker images couldn't be told otherwise
  except through a key nobody documented.
- `DOC_DETECTIVE_CACHE_DIR` beat `--cache-dir`, and `install` ignored the config's `cacheDir`, so a run
  and an `install` could use different caches.
- A config-level `loadVariables` file replaced shell variables and printed dotenv's banner even under `-q`.
- The CLI merged layers shallowly, so a user config's `telemetry.send` vanished when the project config
  set `telemetry.userId`.
- A config file's `output` resolved against the working directory, while its `outputDir` resolved against
  the file.
- Each boolean variable had its own parser. `DOC_DETECTIVE_SKIP_AUTO_UPDATE=0` skipped the update check,
  and `DOC_DETECTIVE_ALLOW_LOCAL_URLS=1` didn't allow anything.
- The runtime still installed browsers into a `./browser-snapshots/` folder from 4.x when it found one.

Which order is the contract, and what happens to the variables that break it?

## Decision Drivers

- A flag always wins, because it's the most specific thing a person typed.
- A run and an `install` agree on every setting they share.
- A rename keeps a deprecated alias for the major (the plan's deprecated-alias contract).
- Image defaults must be overridable by any project, without a key only the runner knows.
- One grammar for every on-or-off variable, so `0` means off everywhere.

## Considered Options

- **A. Keep `DOC_DETECTIVE` as a deprecated alias, merged just below `DOC_DETECTIVE_CONFIG`.**
- **B. Remove `DOC_DETECTIVE` outright, and warn that it's no longer read.**
- **C. Keep today's behavior, and document it.**

## Decision Outcome

Chosen option: **A**, with the order below.

| # | Layer (highest first) | Merge |
|---|---|---|
| 1 | Flags (`--cache-dir`, `-l`, `-q`, `-d`, …) | replace |
| 2 | Shell env: `DOC_DETECTIVE_CONFIG`, then single-purpose vars (`DOC_DETECTIVE_CACHE_DIR`→`cacheDir`, `DOC_DETECTIVE_DEBUG`/`DEBUG`, `DO_NOT_TRACK`, `DOC_DETECTIVE_SKIP_AUTO_UPDATE`), which win over it | deep |
| 3 | Project `.env`: fills only unset vars; `--no-env-file` skips it | none |
| 4 | Project config (`-c`, or `.doc-detective.json\|.yaml\|.yml`), including a config-level `loadVariables`, which also fills only unset vars | deep |
| 5 | User config `$XDG_CONFIG_HOME/doc-detective/config.json` | deep |
| 6 | Schema defaults | none |

- **Deep merge.** Objects merge key by key, and arrays and scalars replace. The CLI's `setConfig` does all
  of the layering. The runner's `setConfig`, which the JS API calls, reads only the config it's given.
- **`DOC_DETECTIVE`** is a deprecated alias of `DOC_DETECTIVE_CONFIG`. Its `config` object merges just
  below `DOC_DETECTIVE_CONFIG`, so flags beat it. It's validated like any config source, and each run
  warns on stderr, unless `-q`:
  ``Warning: `DOC_DETECTIVE` is deprecated. Move its "config" object to `DOC_DETECTIVE_CONFIG`.``
  Its other keys do nothing. Invalid JSON warns and is ignored, as it was.
- **`.container` no longer turns on unsafe steps.** Only `allowUnsafeSteps` does. The Docker images
  write `{"allowUnsafeSteps": true}` to a user config at `/etc/doc-detective-xdg/doc-detective/config.json`
  (`C:\ProgramData\doc-detective-xdg` on Windows) and set `XDG_CONFIG_HOME` to its folder. That's the lowest
  layer, so a project can still turn it off, and pinning `XDG_CONFIG_HOME` keeps it working when a CI
  system moves `HOME`.
- **`loadVariables`.** The config-level file fills only unset variables. The `loadVariables` step still
  replaces them, because a step sets variables on purpose. Every dotenv load is quiet.
- **Paths.** A config file's relative `output` and `cacheDir` resolve against the config file, like its
  other paths. Flags and environment variables resolve against the working directory.
- **The cache.** `--cache-dir` beats `DOC_DETECTIVE_CACHE_DIR`, which beats config `cacheDir`. The CLI
  writes the resolved value back to `DOC_DETECTIVE_CACHE_DIR`. Every runtime lookup in the process then
  uses the same cache, including lookups that read only the environment. `install *` resolves it through the
  same `setConfig` as a run. Browsers always install into `<cacheDir>/browsers`. The `./browser-snapshots/`
  fallback is gone: a legacy folder costs one fresh download.
- **`envFlag()`** reads every `DOC_DETECTIVE_*` boolean. On: `1`, `true`, `yes`, or `on`. Off: unset, empty,
  or `0`, `false`, `no`, or `off`. Trimmed and case-insensitive. Anything else counts as off and warns once:
  `Warning: Ignoring DOC_DETECTIVE_REUSE_APPIUM="maybe". Use 1, true, yes, or on, or 0, false, no, or off.`
  Names stay as they are. `DOC_DETECTIVE_RUNTIME_DEBUG` becomes a deprecated alias of `DOC_DETECTIVE_DEBUG`,
  and warns ``Warning: `DOC_DETECTIVE_RUNTIME_DEBUG` is deprecated. Rename it to `DOC_DETECTIVE_DEBUG`.``
  `NO_COLOR`, `FORCE_COLOR`, `DO_NOT_TRACK`, and `TERM` keep their own conventions. The postinstall script
  keeps a copy, because it runs without `dist`.

Ladder (exit 0 unless noted):

```
doc-detective                                              # XDG cache
DOC_DETECTIVE_CACHE_DIR=/a doc-detective                   # /a
DOC_DETECTIVE_CACHE_DIR=/a doc-detective --cache-dir /b    # /b  ← changed
DOC_DETECTIVE_SKIP_AUTO_UPDATE=0 doc-detective             # checks for updates  ← changed
DOC_DETECTIVE='{"config":{"logLevel":"silent"}}' doc-detective -l info   # info wins, plus a deprecation warning ← changed
doc-detective --cache-dir 'a;b'                            # exit 2, existing metacharacter error
```

This amends ADR 01146 § "Configuration and environment".

### Consequences

- Good: a flag always wins, and the reference documents one table.
- Good: a run and `install` share one cache.
- Good: image defaults sit at the bottom, where any project can override them.
- Bad: a job that relied on `DOC_DETECTIVE_CACHE_DIR` beating `--cache-dir`, on a config-level
  `loadVariables` beating the shell, or on `DOC_DETECTIVE_SKIP_AUTO_UPDATE=0` skipping, behaves differently.
  The upgrade guide lists each.
- Bad: a custom image that set `DOC_DETECTIVE='{"container":…}'` to run unsafe steps no longer does. It
  has to set `allowUnsafeSteps`.
- Neutral: `install` now fails on an invalid config, like a run.

### Confirmation

- `test/config-precedence.test.js` covers the deep merge, `DOC_DETECTIVE`'s layer and warning, the cache
  and `output` paths, and `DOC_DETECTIVE_SKIP_AUTO_UPDATE`.
- `test/env-flag.test.js` holds the `envFlag` table and the `DOC_DETECTIVE_RUNTIME_DEBUG` alias.
- `test/cli-contract.test.js` covers `.env` and `loadVariables` against the shell, `DOC_DETECTIVE` below flags,
  `.container`, `--cache-dir` against the variable, and `install` reading config `cacheDir`.
- `test/misc-edge-branches-coverage.test.js` shows `getBrowsersDir()` ignores `./browser-snapshots`.
- `test/core-artifacts/cli/config-precedence.spec.json` runs the permutations through the fixture jobs.

## Pros and Cons of the Options

### A. A deprecated alias, below `DOC_DETECTIVE_CONFIG`

- Good: existing jobs keep working for the major, and say what to change.
- Good: flags beat it, which fixes the precedence break.
- Bad: one more layer to describe until 6.0.

### B. Remove it

- Good: one variable from day one.
- Bad: breaks with a warning instead of a migration period, against the deprecated-alias rule.

### C. Keep and document today's behavior

- Good: no change.
- Bad: a flag can lose to an environment variable, and a run and an install can disagree on the cache.
