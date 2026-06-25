---
status: accepted
date: 2026-06-24
decision-makers: doc-detective maintainers
---

# Type keystrokes to a background process (process surfaces, Phase 1)

## Context and Problem Statement

`background` processes (ADR 01002, shipped only to the `next` prerelease) are **write-only at spawn,
read-only afterward**: a `runShell`/`runCode` step can start a long-lived process and gate on its
readiness, but nothing can send it input once it is running. So an interactive REPL or CLI (`node -i`,
a database shell, a language interpreter) can be started but never driven from a doc test.

We want docs to drive line-oriented interactive processes — send keystrokes, wait for the expected
output, repeat — using a step authors already know. This is also the first slice of a larger
**multi-surface** model (browsers, apps, and processes as named *surfaces* a step can target). To
avoid a breaking refactor later, Phase 1 must introduce the shared vocabulary the whole model will
use (a `surface` reference and a `waitUntil` readiness object) and converge the in-flight
`runShell.background` readiness onto it — while that feature is still `next`-only and can be changed
freely.

## Decision Drivers

* Reuse the existing `type` step rather than inventing a new "sendInput" step.
* Introduce surface/readiness vocabulary that browser and app phases can extend additively.
* Keep the process input path **webdriverio-free** (a lean install must not pull the heavy browser
  dep to type into a process).
* No deprecation debt: `background`, `readyWhen`, and `stopProcess` all shipped `next`-only, so every
  rename is a clean break with no aliases.
* PASS/FAIL must flow through the existing shared assertion engine, not bespoke inline branching.

## Considered Options

* **A. Overload `type` with a `surface` reference + flat `waitUntil`/`timeout`; converge background
  readiness onto the same vocabulary; rename `stopProcess`→`closeSurface`** (chosen).
* **B. A dedicated `sendInput`/`processType` step** separate from `type`.
* **C. Keep `readyWhen`/`log`/`stopProcess` as-is and bolt process input on alongside them.**

## Decision Outcome

Chosen option: **A**. `type` already means "send keystrokes"; adding a `surface` target generalizes it
without a third step type (rejecting **B**, which duplicates `type`'s key-translation surface). Because
the prior names never reached `latest`, converging them now (rather than carrying `readyWhen`/`log`/
`stopProcess` forever, **C**) keeps exactly one readiness vocabulary across `runShell.background` and
`type`.

Mechanism:

1. **`surface` reference + `waitUntil`/`timeout` on `type`** (`type_v3` schema). `surface` is a string
   name or `{ process }` object (Phase 1: process kind only; browser/app branches are later, additive
   `anyOf` entries). `type.waitUntil` is the **process** readiness shape (`stdio` | `delayMs` only) —
   network probes (`port`/`httpGet`) are absent *by construction* so they can never leak onto `type`.
   Schema guards: `waitUntil` requires a `surface`; a `{ process }` surface forbids element targeting.
2. **Converged `waitUntil` vocabulary.** `runShell.background` is reshaped to
   `true | "name" | { name, waitUntil }`; `readyWhen`→`waitUntil` and `log`→`stdio` (a clean rename —
   `stdio` is the canonical substring-or-`/regex/` match used everywhere via `matchesExpectedOutput`).
   `waitForReady` (`src/core/utils.ts`) now **AND-s all present probes** (`Promise.all` to a shared
   deadline) instead of taking the first; the early-exit-on-process-death race is kept.
3. **Process control-byte map vs WebDriver `Key`.** A module-level `_processKeyMap`
   (`src/core/tests/typeKeys.ts`) maps `$ENTER$`/`$RETURN$`→`\r`, `$TAB$`→`\t`, `$ESCAPE$`→`\x1b`,
   `$BACKSPACE$`→`\x7f`, arrows→`\x1b[A/B/C/D`, `$DELETE$`→`\x1b[3~`, `$SPACE$`→` `; `$CTRL$` consumes
   the **next** key and emits its control byte (`charCode - 64`, so Ctrl+C→`\x03`). These are raw
   terminal bytes, not webdriverio `Key` sentinels — the process path stays webdriverio-free, while
   the unchanged element/active-element path keeps using the lazy-loaded `Key` map.
4. **Subscribe-before-write.** When `type.waitUntil.stdio` is set, the `waitForOutputMatch` promise is
   built (with the buffer snapshotted first) **before** the keys are written, so a match emitted
   between write and subscribe is never missed.
5. **Non-throwing `waitForOutputMatch`** (`src/core/utils.ts`): resolves `true`/`false` instead of
   resolving/rejecting (unlike the removed `waitForLog`), so the assertion engine — not an exception —
   decides PASS/FAIL.
6. **Outputs mirror `runShell`.** The process branch exposes `outputs.process`,
   `outputs.stdio = { stdout, stderr }`, and `outputs.stdioMatched`; the `stdio` case asserts
   `$$outputs.stdioMatched == true` through `buildConditionContext` + `evaluateImplicitAssertions`,
   mirroring runShell's `stdioMatched` block. `delayMs`-only sleeps `min(delayMs, timeout)` and PASSes
   with no assertion records; no `waitUntil` PASSes with empty assertions.
7. **`closeSurface` replaces `stopProcess`** (`src/core/tests/closeSurface.ts`, `closeSurface_v3`
   schema; `stopProcess.ts`/`stopProcess_v3` deleted). It takes a surface reference (string |
   `{ process }` | array of those), resolves to a list of process names, and tree-kills + deregisters
   each, **idempotently** — closing an absent surface is a PASS no-op (replacing `stopProcess`'s
   `ignoreMissing`, which is now the default and only behavior). Default process names derive from the
   base command at runtime (`deriveName`: first shell token → basename → strip extension), since AJV
   `dynamicDefaults` are static-only.

## Consequences

* **Good** — docs can drive line-oriented REPLs/CLIs end-to-end (start → type → wait-for-output →
  close) with one familiar step and one readiness vocabulary shared with background startup.
* **Good** — the surface/`waitUntil` vocabulary is forward-compatible: browser and app surface kinds
  are additive `anyOf` branches, no breaking change to Phase 1 specs.
* **Good** — the process input path never loads webdriverio; lean installs keep `type`-to-process
  working without the browser dep.
* **Trade-off (pipe, not PTY)** — keys go to the child's **stdin pipe**, not a pseudo-terminal. Full
  TUIs that require a real TTY (raw mode, cursor addressing, `claude`) are out of scope; line-oriented
  REPLs work. PTY support is deferred to Phase 2.
* **Trade-off (clean break)** — `readyWhen`, `log`, and `stopProcess` are removed with no aliases.
  This breaks the `next` prerelease API; acceptable because none reached `latest`.
* **Neutral** — a bare-string `surface` that is a reserved engine keyword (`chrome`/`firefox`/…) or a
  non-process surface object is not statically rejected on `type`; it FAILs at runtime with
  "surface kind not yet supported" (Phase 1 resolves only the process kind).

## Confirmation

* Unit (`test/background-process.test.js`): `bg.write` round-trips into `getCombined()` (real
  `node -i`); `waitForOutputMatch` (match-before-subscribe, match-after-chunk, timeout→false);
  `deriveName`; `normalizeBackground` (false/true/string/object forms); `_processKeyMap` +
  `translateProcessKeys` (`$CTRL$`/special-key translation); `resolveSurface` (process/engine/none);
  `closeSurface` (close, temp-script removal, idempotent no-op, array form); `waitForReady` with the
  new `waitUntil` shape (stdio, port, AND of both, early-exit).
* Schema (`src/common/test/validate.test.js`): `type` accepts string/`{process}` surface +
  `waitUntil.stdio`/`delayMs`+`timeout`, and rejects empty/browser/extra-key surfaces, port-in-`type`
  readiness, `waitUntil` without a surface, and process-surface + element targeting; `runShell`
  background accepts `true`/`false`/string/object forms and rejects unknown keys, empty `waitUntil`,
  `httpGet` without `url`, and the removed `name`/`readyWhen` siblings; `closeSurface` accepts
  string/`{process}`/array and rejects empty array/object and the removed `stopProcess` key.
* End-to-end: `test/core-artifacts/type-to-process.spec.json` drives `node -i` through the canonical
  `test/core-core.test.js` `concurrentRunners=2` fixture gate (stdio-match, special-key/`$CTRL$`,
  `delayMs`-only, derived-name + idempotent close), resolving PASS/SKIPPED on every platform; the
  migrated `background-processes.spec.json` exercises the converged `waitUntil`/`closeSurface` shape.
  Focused `it`s assert the runtime FAIL paths: type to a missing process (names it), a `stdio`
  `waitUntil` that can't match in a tiny timeout (FAIL via the `stdioMatched` assertion), and
  `surface:"chrome"` ("surface kind not yet supported").
