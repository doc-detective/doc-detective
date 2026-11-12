---
status: accepted
date: 2026-11-12
decision-makers: [hawkeyexl]
---

# Reject invalid specs from `runTests()` by default

Builds on [ADR 01146](01146-cli-v5-contract.md), [ADR 01150](01150-reject-unknown-keys-on-specs-and-steps.md), and
[ADR 01152](01152-trim-the-public-js-api.md).

## Context and Problem Statement

Under ADR 01146, the CLI exits `2` when any spec is invalid, before a test runs. `--no-exit-on-fail`
(`exitOnFail: false`) restores the version 4 behavior: warn, skip the invalid spec, and run the rest. ADR 01150 made
more specs invalid, such as one with an unknown key.

The JavaScript API didn't follow. `runTests(config)` had strict mode behind an internal `strictSpecs` option that only
the CLI passed. So `require("doc-detective").runTests({ input: "bad.spec.json" })` logged a warning, skipped the spec,
and resolved with an all-zero summary. A caller that checks only for a rejection or a failed test saw success, and a
typo that turned off a check went unnoticed, which is what ADR 01150 set out to stop.

Should `runTests()` reject invalid specs by default?

## Decision Drivers

- The CLI and the API agree on what an invalid spec means. One config key decides it, in one place.
- An invalid spec can't look like a passing run.
- No new flag, config key, or exported option.
- Callers that want the version 4 behavior keep a way to get it.

## Considered Options

- **A. Derive strict specs from `exitOnFail` inside `runTests()`.** Invalid specs reject unless `exitOnFail` is
  `false`.
- **B. Keep the API lenient and document the difference.**
- **C. Add a public `strictSpecs` option to `runTests()`.**

## Decision Outcome

Chosen option: **A**. `runTests(config)` derives strict mode from the resolved config:
`strictSpecs = options.strictSpecs ?? config.exitOnFail !== false`. With any invalid spec, it rejects with the error the
CLI prints, which starts `Invalid test specifications, so nothing ran:`, and runs nothing. `exitOnFail: false` keeps
the skip-and-warn behavior. The CLI no longer computes `strictSpecs` itself, so the rule lives only in `runTests()`.

An invalid config already rejects with `Invalid config:`. That's unchanged. A run that the CLI or the hosted runner
starts behaves as before, because the CLI already passed the same value.

### Consequences

- Good, because the API and CLI treat an invalid spec the same way, from the same key.
- Good, because an invalid spec surfaces as a rejection rather than an empty, passing report.
- Bad, because API callers that relied on skipping invalid specs must set `exitOnFail: false` or fix the specs. That's
  a breaking change for the API, listed in the upgrade guide.

### Confirmation

[test/api-contract.test.js](../test/api-contract.test.js) asserts that `runTests()` rejects with the message above for
a spec with an unknown step key, and that `exitOnFail: false` skips that spec and runs the valid one.
[test/cli-contract.test.js](../test/cli-contract.test.js) keeps covering the CLI's exit `2` and stderr.

## Pros and Cons of the Options

### A. Derive strict specs from `exitOnFail` inside `runTests()`

- Good, because it reuses the key users already know from the CLI.
- Good, because the default lives in one place.
- Bad, because `exitOnFail` now also governs a rejection, not only an exit code. Its meaning, "fail when nothing valid
  ran," still holds.

### B. Keep the API lenient and document the difference

- Good, because nothing breaks.
- Bad, because the same config gives different results through the API and the CLI.
- Bad, because an invalid spec still looks like a passing run.

### C. Add a public `strictSpecs` option to `runTests()`

- Good, because it's explicit.
- Bad, because it adds a second name for what `exitOnFail` already decides, and ADR 01152 keeps the API small.
