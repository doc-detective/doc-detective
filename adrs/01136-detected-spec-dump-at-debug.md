---
status: accepted
date: 2026-10-14
decision-makers: hawkeyexl
---

# Log the detected-spec dump at debug level

## Context and Problem Statement

After detection, `detectTests` logged a `SPECS:` header at debug level and
then the full detected-spec array, pretty-printed as JSON, at info level.
Info is the default, so every run printed the whole array to stdout. For this
repository's `docs/` that's about 740 KB per run. For 5,000 small Markdown
files it's 4.4 MB. The header was hidden at info, so the dump arrived with no
label. Nobody read it in a terminal, and it bloated CI logs.

The resolved-test and results-tree dumps were already debug-only. This dump
was the outlier.

## Decision Drivers

* Readable default output, and smaller CI logs.
* No lost diagnostics: anyone who needs the detected specs can still get them.
* No change to results or reports.

## Considered Options

1. **Log the dump at debug**, matching its header.
2. **Keep it at info.**
3. **Remove it.**

## Decision Outcome

Chosen option: **1**. The dump in
[src/core/detectTests.ts](../src/core/detectTests.ts) now logs at debug, under
its `SPECS:` header. `log` checks the level before it serializes, so default
runs also skip the JSON serialization.

### Consequences

* Good, because default output no longer carries an unlabeled multi-megabyte
  JSON block. Detection over `docs/` is about 30 ms faster when stdout goes
  to a file, and more in a slow terminal.
* Good, because `--logLevel debug` shows the same dump, now with its header.
  `--dry-run` still prints the resolved test plan as JSON.
* Bad, because a script that scraped the detected specs from info-level
  stdout loses them. That output was never documented or labeled, and
  `--dry-run` is the documented, parseable way to get the plan.

### Confirmation

[test/detecttests-spec-dump-level.test.js](../test/detecttests-spec-dump-level.test.js)
asserts the dump is absent at info and present, under `SPECS:`, at debug.

## Pros and Cons of the Options

### 1. Log at debug

* Good, because it matches the header and the other plan and results dumps.
* Bad, because the change is visible to anyone who relied on the old output.

### 2. Keep it at info

* Good, because nothing changes.
* Bad, because every default run keeps printing hundreds of KB to MBs.

### 3. Remove it

* Good, because it's the least output.
* Bad, because it drops a debugging aid with no replacement at the detection
  stage.
