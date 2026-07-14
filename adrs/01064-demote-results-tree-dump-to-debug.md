---
status: accepted
date: 2026-07-14
decision-makers: doc-detective maintainers
---

# Demote the full results-tree terminal dump from info to debug

## Context and Problem Statement

At the end of a run, `runTests` (`src/core/index.ts`) logged the entire results tree at **info**
level:

```ts
log(config, "info", "RESULTS:");
log(config, "info", results);   // pretty-printed JSON.stringify of the whole tree
```

`info` is the **default** log level, so every default run printed the complete, pretty-printed
results object to the terminal — a tree that, on a real suite, is hundreds to thousands of lines.
This duplicates what the reporters already render for the user: the terminal reporter prints a
human summary, and the json/runFolder reporters write the full tree to files with a "See results
at …" pointer. The raw info-level dump is therefore both **redundant** and a **terminal flood** that
buries the reporter summary the user actually reads (`docs/design/run-performance.md`, item 2.4a).

Because the default log level is `info`, changing where this dump appears is an **observable
terminal-output contract change**, so it warrants an ADR even though the code change is a one-word
level swap.

## Decision Drivers

* Stop flooding the default terminal with a duplicate of what the reporters already present.
* Keep the raw tree available for debugging — it is genuinely useful when diagnosing a run, just not
  at the default level.
* Don't touch the reporters' output or the file artifacts; the summary and the written JSON/HTML are
  the user-facing surfaces and must be unchanged.

## Considered Options

* **A. Demote the dump (label + tree) to `debug`** (chosen) — it prints under `--logLevel debug`
  (or `DOC_DETECTIVE_RUNTIME`/config equivalents), and is silent at the default `info`.
* **B. Delete the dump entirely** — the reporters already cover results; drop the raw tree.
* **C. Keep it at `info`** — status quo.

## Decision Outcome

Chosen option: **A**. Both `log(config, "info", "RESULTS:")` and `log(config, "info", results)`
become `log(config, "debug", …)`. At the default `info` level the terminal now shows the reporter
summary and the "See results at …" pointers without the raw-tree flood; the full tree remains one
`--logLevel debug` away for anyone diagnosing a run. The surrounding
`"Cleaning up and finishing post-processing."` and the support message stay at `info` (they are
short status lines, not the flood).

B was rejected: the raw tree is a real debugging aid (it shows the exact in-memory result shape,
including fields a reporter may summarize away), and moving it to `debug` keeps that value at zero
default-output cost — strictly better than deleting it.

### Consequences

* Good: the default terminal is no longer flooded by a full JSON dump duplicating the reporters; the
  human summary is what the user sees.
* Good: the raw tree is still available at `debug` for diagnosis.
* Observable change (the reason for this ADR): users who ran at the default level and *relied on*
  the `RESULTS:` + JSON block appearing in stdout will no longer see it there. The same data is in
  the json/runFolder report files (default reporters) and re-appears in the terminal at
  `--logLevel debug`. This is called out in the docs-impact assessment (see below).
* Neutral: this is independent of, and complementary to, item 2.4b (serializing the results JSON once
  and sharing it between the json and runFolder reporters), which does not change any output.

### Confirmation

Red→green unit test in `test/cli-index-adapters-coverage.test.js`
(`does not dump the full results tree at info level, but does at debug`): runs a `wait`-only spec
(fully offline, no browser) through `runTests` at `info` and asserts the captured stdout does **not**
contain `RESULTS:`, then at `debug` asserts it **does**. On the pre-change code the info run contained
`RESULTS:`, so the test fails.

## Pros and Cons of the Options

### A. Demote to debug
* Good: removes the default-level flood; keeps the tree for debugging; minimal change.
* Bad: a behavior change for anyone parsing the info-level dump from stdout (mitigated: the data is
  in the report files and at `debug`).

### B. Delete entirely
* Good: simplest; smallest output.
* Bad: loses a genuine debugging aid (exact in-memory result shape) that costs nothing to keep at
  `debug`.

### C. Keep at info
* Good: no change.
* Bad: keeps flooding the default terminal with a duplicate of the reporters' output.

## More Information

Design: `docs/design/run-performance.md` (Phase 2, item 2.4, and Decision 5 on lazy log arguments).
Docs-impact: the default-terminal-output change is noted for the CLI/logging reference; users who
scripted against the info-level `RESULTS:` dump should read the report files or use `--logLevel
debug`.
