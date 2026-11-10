---
status: accepted
date: 2026-11-10
decision-makers: doc-detective maintainers
---

# One path rule for every config source

Amends [ADR 01165](01165-one-config-env-var-and-one-precedence-order.md), and resolves its R6.

## Context and Problem Statement

ADR 01165 made a relative `output` or `cacheDir` resolve against the source that set it. Every other config path
key kept its old rule, which depended on the key:

- `input`, `outputDir`, `loadVariables`, `beforeAll`, `afterAll`, `configPath`, `descriptionPath`, and a nested
  `path` resolved after the merge, against the project config's folder. A value from the user config or the
  environment landed in a folder it never named.
- `apiKeyFile` and `apiTokenFile` always resolved against the current directory, even in a config file.
- A user config with `relativePathBase: "cwd"` resolved its `output` and `cacheDir` against the current
  directory, where ADR 01165 says its own folder.

One config could hold paths with three different bases. Which base does a relative path use?

## Decision Drivers

- A path means what it means where it's written. Moving a config file, or setting a key from another source,
  never changes another source's paths.
- One rule for every path key, so nobody has to know which key is special.
- `-` and a trailing separator on `output` keep their meaning (ADR 01146).

## Considered Options

- **A. Resolve each source's paths before the merge, against that source's base.**
- **B. Keep resolving after the merge, and record each key's source to pick its base.**
- **C. Resolve every relative path against the current directory.**

## Decision Outcome

Chosen option: **A**. A relative path resolves against the source that set it:

| Source | Base |
|---|---|
| Project config | Its folder. The current directory with `relativePathBase: "cwd"`, or for a URL config |
| User config | Its folder, whatever its `relativePathBase` |
| `DOC_DETECTIVE_CONFIG`, `DOC_DETECTIVE` | The current directory |
| Flags and single-purpose variables | The current directory |

Each source resolves in its reader, before the merge. `anchorPaths` keeps its own loop for `output` and
`cacheDir`, which guards `-` and a trailing separator. It then runs `resolvePaths` on the rest, with
`relativePathBase: "file"` and the source's base. `resolvePaths` gains `beforeAny`, `apiKeyFile`, and
`apiTokenFile`, and loses `output`, which only `anchorPaths` resolves.

The call after the merge stays. Every source's paths are absolute by then, so it resolves only what no source set,
such as the default `input` and `outputDir` of `.`. Those resolve as before.

A URL, such as `https://…` or `heretto:…`, is never resolved.

### Consequences

- Good: a user config or `DOC_DETECTIVE_CONFIG` that sets `input` works from any project.
- Good: a credential file sits beside the config that names it.
- Bad: a setup that relied on the old bases finds its paths moved. The upgrade guide lists the three cases.
- Neutral: `readLegacyEnvConfig` is async, since `resolvePaths` is.

### Confirmation

- `test/config-precedence.test.js`, "one path rule": each key from each source, with a project config present so a
  wrong base shows. The keys are `input`, `outputDir`, `loadVariables`, `beforeAll`, `beforeAny`, `afterAll`,
  `descriptionPath`, a nested `path`, `apiKeyFile`, and `apiTokenFile`. The sources are the project config,
  with and without `relativePathBase: "cwd"`, the user config, `DOC_DETECTIVE_CONFIG`, and `DOC_DETECTIVE`. Also
  flags, a URL, and a user config's `relativePathBase: "cwd"`.
- Fixtures: `cli/path-rule.spec.json`, through `cli/precedence.cjs`, one case per source.

## Pros and Cons of the Options

### A. Resolve each source before the merge

- Good: each source knows its own base, so no bookkeeping survives the merge.
- Bad: every source runs `resolvePaths`, which costs a few milliseconds per run.

### B. Track each key's source through the merge

- Good: one resolution pass.
- Bad: the merge has to carry provenance for every nested key, and arrays replace, which loses it.

### C. Resolve everything against the current directory

- Good: the simplest rule.
- Bad: a config file's paths break when a run starts in another folder, which is what `relativePathBase: "file"`
  exists to prevent.
