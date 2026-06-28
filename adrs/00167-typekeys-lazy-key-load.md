---
status: accepted
date: 2026-06-04
decision-makers: doc-detective maintainers
---

# typeKeys lazy Key load and $SUBTRACT$ alias

## Context and Problem Statement

The `typeKeys` step imports webdriverio's `Key` map to translate special-key tokens. After the
runtime lazy-install change, webdriverio may not be present in a lean install where no browser test
runs — yet a top-level `import { Key }` would crash the whole process at load. Separately, a legacy
special-key token `$SUBSTRACT$` (a misspelling of "subtract") was in use and renaming it outright
would break existing tests. How should `typeKeys` reference `Key` without coupling lean installs to
webdriverio, and how should the typo'd token be corrected without breaking compatibility?

## Decision Drivers

* Lean installs without webdriverio must still load and run non-browser steps.
* A failure to load `Key` should fail only the affected step, not abort the run.
* The corrected `$SUBTRACT$` token must be available without dropping the legacy `$SUBSTRACT$`.

## Considered Options

* **A. Lazy-load `Key` inside the `typeKeys` handler (load-failure → step FAIL, not abort) and add `$SUBTRACT$` as an alias for the legacy `$SUBSTRACT$`** (chosen).
* **B. Keep the top-level `Key` import and require webdriverio in every install.**
* **C. Rename `$SUBSTRACT$` to `$SUBTRACT$` outright (breaking).**

## Decision Outcome

Chosen option: **A**, because deferring the `Key` import keeps lean installs working and an alias
preserves backward compatibility. `typeKeys` now lazy-loads webdriverio's `Key`; if the load fails
(webdriverio absent) the step results FAIL rather than aborting the process, and `$SUBTRACT$` is
added as an alias for the legacy `$SUBSTRACT$` token (commit `366202e6`, `typeKeys.ts`).

### Consequences

* Good: lean installs load and run non-browser steps without webdriverio.
* Good: a missing-driver dependency degrades to a single step FAIL, not a crash.
* Good: `$SUBTRACT$` is the corrected spelling while `$SUBSTRACT$` keeps working.
* Neutral: both tokens are accepted indefinitely.
* Bad: two spellings for the same key persist as a small compatibility tail.

### Confirmation

`typeKeys.ts` lazy-loads `Key`, FAILs on load failure, and maps `$SUBTRACT$` to the legacy
`$SUBSTRACT$`. Shipped in `366202e6`.

## Pros and Cons of the Options

### A. Lazy `Key` + `$SUBTRACT$` alias
* Good: lean-install safe; non-aborting; backward compatible token.
* Bad: keeps a legacy misspelled alias around.

### B. Top-level import, require webdriverio
* Good: simplest code.
* Bad: breaks lean installs; couples every install to webdriverio.

### C. Rename token outright
* Good: one clean spelling.
* Bad: breaks existing tests using `$SUBSTRACT$`.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commit `366202e6`. Inventory ref:
BACKFILL-INVENTORY.md Seq 232. Related: `00164` (runtime lazy-install provisioning), `00169`
(lean-install browser detection).
