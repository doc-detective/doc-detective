---
status: accepted
date: 2026-07-03
decision-makers: doc-detective maintainers
---

# Gate contexts on host capabilities with `requires` (SKIP, never FAIL)

## Context and Problem Statement

A `runOn` context can gate on platform (`platforms`) and browser availability, but nothing else.
Tests that depend on other host capabilities — a CLI on the PATH (`node`, `adb`, `claude`), a file
(an app binary, a config), an environment variable (an API key) — either fail confusingly at the
step that first touches the missing dependency, or authors wrap steps in ad-hoc shell probes.
Native app support (design: [docs/design/native-app-surfaces.md](../docs/design/native-app-surfaces.md),
phase A1) makes this acute: app and CLI tests must land as SKIPPED on hosts that can't run them,
exactly as a `platforms` mismatch does, so the "no spec FAILs" fixture gate and multi-OS CI
matrices stay honest.

The multi-surface design ([docs/design/multi-surface-targeting.md](../docs/design/multi-surface-targeting.md),
"`requires` gate") reserved the field; this ADR ships it.

## Decision Drivers

* An unmet environment dependency is a gating fact, not a test failure — the outcome must be
  SKIPPED with a reason naming what's missing, never FAIL.
* Progressive disclosure, matching the house style: scalar → array → object, no required fields.
* Additive only: existing specs must validate and run byte-identically.
* Hermetic evaluation: no shelling out to probe the PATH; testable without touching the real
  environment.
* A `requires`-only `runOn` entry (no `platforms`, no `browsers`) must be legal and useful.

## Considered Options

* **`requires` on `context_v3`** — progressive `"cmd"` → `["cmd", …]` → `{ commands, files, env }`,
  evaluated at run time on the targeted host; any miss → SKIPPED.
* **Per-step guards only** — extend the existing step-level `if` guard vocabulary with
  command/file/env probes; no context-level gate.
* **Author-managed probes** — document a `runShell`-probe pattern; add nothing.

## Decision Outcome

Chosen option: **`requires` on `context_v3`**, because the unit that must be skipped is the
*context* (the whole run of a test on a host), not an individual step — per-step guards would skip
steps one at a time and still report the context as run, and author-managed probes reinvent the
gate per spec with FAIL-shaped failure modes.

Shape and semantics:

* `requires: "node"` (string = one required command) → `["node", "ffmpeg"]` (array of commands) →
  `{ commands, files, env }` (full form). All entries AND-ed.
* `commands` resolve on the PATH without spawning a shell (PATHEXT honored on Windows); `files`
  exist after `$VAR` expansion (`$HOME` falls back to `USERPROFILE`); `env` vars must be set
  non-empty. Unknown `$VAR`s stay literal so the miss is visible in the skip reason.
* Evaluated in `runContext` only when the context targets the current platform — requirements are
  host facts; a different-platform context keeps its platform skip reason.
* Any miss → context result SKIPPED with
  `Skipping context on '<platform>': unmet requirements — command "adb", …` naming every miss.
* A `runOn` entry may now omit `platforms`/`browsers` (e.g. a pure `requires` gate); it expands to
  a static context without those keys, and `runContext` fills the current platform / default
  browser at run time — the same semantics as a test with no `runOn` at all.

### Consequences

* Good, because app/CLI/native tests can express their host dependencies declaratively and land as
  SKIPPED (with an actionable reason) wherever they can't run — the fixture policy's PASS/SKIPPED
  invariant extends to phase A1 fixtures unchanged.
* Good, because the evaluation helper (`evaluateContextRequirements`) is pure with injectable
  deps, so the gate is unit-tested without touching the real PATH/fs/env.
* Bad, because a command/file/env probe is a point-in-time check: a dependency that disappears
  mid-run still fails at the step that uses it. Accepted — the gate is for gating, not for
  transactional environment pinning.
* Neutral: driver availability is deliberately *not* a `requires` concern; the runner's own
  preflight/install machinery owns that.

### Confirmation

* Schema: positive/negative cases for every form in `src/common/test/validate.test.js`
  (`context_v3 requires`).
* Helper: hermetic unit tests in `test/core-utils-coverage.test.js`
  (`evaluateContextRequirements`) and `test/context-resolution.test.js`
  (`contextRequirementsSkipMessage`, platform-less `runOn` expansion).
* End-to-end: `test/core-artifacts/requires.spec.json` exercises every form (met → PASS,
  unmet → SKIPPED) in the combined core pass; a focused `it()` in `test/core-core.test.js` pins
  the SKIPPED result and the unmet-requirements reason text.

## Pros and Cons of the Options

### `requires` on `context_v3`

* Good, because it gates at the granularity that matches the failure mode (the whole context).
* Good, because it is additive and progressive, matching `platforms`/`browsers`/`background`.
* Good, because the skip reason is uniform and machine-checkable across specs.
* Bad, because it adds a second place (besides steps) where environment facts are consulted.

### Per-step guards only

* Good, because it reuses an existing mechanism (`if`).
* Bad, because a context whose every step is skipped still reports as run, poisoning pass/skip
  accounting and the fixture invariant.
* Bad, because authors repeat the same guard on every step of a gated test.

### Author-managed probes

* Good, because it ships nothing.
* Bad, because probe failures are FAIL-shaped by default, exactly the outcome the design forbids.
* Bad, because every spec reinvents the pattern differently, and skip reasons are unstructured.
