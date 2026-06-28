---
status: accepted
date: 2025-05-01
decision-makers: doc-detective maintainers
---

# --input / --output arg path resolution (and comma-separated multi-file --input)

## Context and Problem Statement

When `--input` and `--output` are passed as CLI arguments, the user types them relative to their current working directory — but Doc Detective resolves config-relative paths against the config file's base, so a relative `--input` could be interpreted against the wrong base and fail to find files. Separately, `--input` accepted only a single value, so testing several files meant several invocations, and remote `http(s)://` inputs must not be path-resolved at all. How should arg-supplied input/output paths resolve, and how should multiple inputs be expressed?

## Decision Drivers

* A relative `--input`/`--output` should resolve from the user's cwd, independent of the config base.
* Authors need to pass several input files in one invocation.
* Remote `http(s)://` inputs must be left untouched (not path-resolved).
* `loadVariables` (the renamed `envVariables`) path resolution must follow the same rules (resolve, recurse arrays, skip URLs).

## Considered Options

* **A. `path.resolve()` arg paths from cwd, accept a comma-separated multi-file `--input`, and apply matching resolution to `loadVariables` (skipping URLs)** (chosen).
* **B. Keep single-value `--input`; resolve only against the config base.**
* **C. Require absolute paths in CLI args.**

## Decision Outcome

Chosen option: **A**, because CLI args are typed relative to cwd and multi-file input is a common need. The contract evolved across three commits:

1. `--input`/`--output` args are **`path.resolve()`d from cwd**, so relative arg paths resolve independent of the config base — `config.input = path.resolve(args.input)` (commit `ae724ebf`, Seq 165).
2. `resolvePaths` applies to **`loadVariables`** (renamed from `envVariables`) as a config path, recurses into arrays, and **skips `http(s)` URLs** (commits `6e1121a4`, `3d0ce701`, `23d01926`, Seq 166).
3. `--input` accepts a **comma-separated multi-file** value: split, trim, and resolve each, leaving `http(s)://` entries unresolved; `filePath` defaults to `"."` when no config is present (commit `7cc139e3`, Seq 167).

### Consequences

* Good: relative `--input`/`--output` behave intuitively (resolve from cwd).
* Good: one invocation can test several files via comma-separated `--input`.
* Good: remote inputs and URL variables are correctly left unresolved.
* Neutral: this `--input` shape predates the strict-array `--test`/`--spec` convention (`00160`) and stays the permissive comma-split form.

### Confirmation

Shipped in `doc-detective` commits `ae724ebf` (Seq 165), `6e1121a4`/`3d0ce701`/`23d01926` (Seq 166), `7cc139e3` (Seq 167); cwd-relative arg resolution, comma-split multi-input, and URL-skipping are the confirming behavior.

## Pros and Cons of the Options

### A. cwd-resolve + comma multi-input + URL skip
* Good: intuitive relative paths; multi-file input; URLs safe.
* Bad: comma-split overloads one flag (permissive shape).

### B. Single value, config-base only
* Good: simplest.
* Bad: relative CLI args resolve against the wrong base; no multi-file.

### C. Require absolute paths
* Good: unambiguous.
* Bad: hostile ergonomics for everyday CLI use.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `ae724ebf`, `6e1121a4`, `3d0ce701`, `23d01926`, `7cc139e3`. Inventory ref: BACKFILL-INVENTORY.md Seq 165, 166, 167. Related: `00086` (`relativePathBase`/`resolvePaths`), `00160` (strict-array `--test`/`--spec` filters).
