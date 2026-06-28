---
status: accepted
date: 2022-05-17
decision-makers: doc-detective maintainers
---

# Browser options: headless, executable path, and viewport

## Context and Problem Statement

Driving a browser deterministically across machines requires control over whether it runs headless,
which browser binary to launch, and the viewport size used for screenshots and recordings. The runner
had no configurable surface for any of these. How should browser launch options be exposed, and what
should happen when the executable path is left empty?

## Decision Drivers

* CI runs need headless; local authoring often needs headed.
* Users may need to point at a specific browser binary.
* Screenshot/recording output depends on a known, configurable viewport.
* An unset executable path must do something sensible, not break the launch.

## Considered Options

* **A. `browserOptions{headless, path}` + viewport flags, with an empty-path default guard** (chosen).
* **B. Hardcode headless + bundled browser + fixed viewport.**

## Decision Outcome

Chosen option: **A**. A `browserOptions` config object exposes `{headless, path}` (where `path` is the
browser `executablePath`), and viewport dimensions are set via `--browserHeight`/`--browserWidth`.
Crucially, when `browserOptions.path` is empty, `setBrowserPath` short-circuits to the default
Chromium rather than resolving against the current working directory — preventing an empty value from
producing a broken cwd-relative path. This pair of decisions (the options object and the empty-path
guard) forms one coherent "how do we configure the browser launch" contract.

### Consequences

* Good: explicit control over headless/headed, binary, and viewport.
* Good: empty path degrades to the bundled default instead of failing.
* Neutral: viewport is flag-driven here; later schema work folds width/height into per-context
  `app.options` (Seq 91) and `context_v3` (Seq 142).

### Confirmation

Shipped 2022-05-17 (`6ce5ef9`, `34cf0a4`) for `browserOptions` + viewport flags, and 2022-09-21
(`1579e4b9`) for the `setBrowserPath` empty-path guard.

## Pros and Cons of the Options

### A. Configurable browserOptions + viewport + empty-path guard
* Good: covers the real launch knobs; safe default when path is blank.
* Bad: small surface to validate and document.

### B. Hardcoded launch
* Good: nothing to configure.
* Bad: no headed mode, no custom binary, no viewport control — unusable for varied environments.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits 6ce5ef9, 34cf0a4, 1579e4b9.
Inventory ref: BACKFILL-INVENTORY.md Seq 19, 35. Related: ADR 00061 (per-context browser app
options), ADR 00098 (context_v3 and browsers array redesign).
