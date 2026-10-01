---
status: accepted
date: 2026-06-24
decision-makers: doc-detective maintainers
---

# Type keystrokes to a background process (process surfaces, Phase 1)

## Context and Problem Statement

`background` processes (ADR 01002, shipped only to the `next` prerelease) are **write-only at spawn,
read-only afterward**. A `runShell` or `runCode` step can start a long-lived process and gate on its
readiness, but nothing can send it input once it is running. So an interactive REPL or CLI can be
started but never driven from a doc test, whether `node -i`, a database shell, or a language
interpreter.

We want docs to drive line-oriented interactive processes, using a step authors already know. That
means sending keystrokes, waiting for the expected output, and repeating. This is also the first
slice of a larger **multi-surface** model, with browsers, apps, and processes as named *surfaces* a
step can target. To avoid a breaking refactor later, Phase 1 must introduce the shared vocabulary
the whole model will use: a `surface` reference and a `waitUntil` readiness object. It must also
converge the in-flight `runShell.background` readiness onto it, while that feature is still
`next`-only and can be changed freely.

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
   `anyOf` entries). `type.waitUntil` is the **process** readiness shape, `stdio` or `delayMs` only.
   Network probes (`port`/`httpGet`) are absent *by construction*, so they can never leak onto
   `type`.
   Schema guards: `waitUntil` requires a `surface`; a `{ process }` surface forbids element targeting.
2. **Converged `waitUntil` vocabulary.** `type.waitUntil` reuses the same readiness vocabulary as
   `runShell.background`/`runCode.background`. That's the canonical `background` object (required
   `name`, plus `waitUntil` with flattened scalar conditions `stdio` | `port` | `httpGet` |
   `delayMs`) that landed
   on `next` (PRs #383/#384/#385). `stdio` is the canonical substring-or-`/regex/` match used
   everywhere via `matchesExpectedOutput`. `waitForReady` (`src/core/utils.ts`) **AND-s all present
   probes** (`Promise.all` to a shared deadline); the early-exit-on-process-death race is kept.
   (This branch's earlier `background: true|"name"` shorthand and its own `background` reshape were
   dropped during reconciliation with `next` in favor of `next`'s `background` object.)
3. **Process control-byte map vs WebDriver `Key`.** A module-level `_processKeyMap`
   (`src/core/tests/typeKeys.ts`) maps `$ENTER$`/`$RETURN$`→`\r`, `$TAB$`→`\t`, `$ESCAPE$`→`\x1b`,
   `$BACKSPACE$`→`\x7f`, arrows→`\x1b[A/B/C/D`, `$DELETE$`→`\x1b[3~`, `$SPACE$`→` `; `$CTRL$` consumes
   the **next** key and emits its control byte (`charCode - 64`, so Ctrl+C→`\x03`). These are raw
   terminal bytes, not webdriverio `Key` sentinels. The process path stays webdriverio-free, while
   the unchanged element and active-element path keeps using the lazy-loaded `Key` map.
4. **Subscribe-before-write.** When `type.waitUntil.stdio` is set, the `waitForOutputMatch` promise
   is built **before** the keys are written, with the buffer snapshotted first. A match emitted
   between write and subscribe is then never missed.
5. **Non-throwing `waitForOutputMatch`** (`src/core/utils.ts`): resolves `true`/`false` instead of
   resolving/rejecting (unlike the removed `waitForLog`). The assertion engine then decides PASS or
   FAIL, rather than an exception.
6. **Outputs mirror `runShell`.** The process branch exposes `outputs.process`,
   `outputs.stdio = { stdout, stderr }`, and `outputs.stdioMatched`; the `stdio` case asserts
   `$$outputs.stdioMatched == true` through `buildConditionContext` + `evaluateImplicitAssertions`,
   mirroring runShell's `stdioMatched` block. `delayMs`-only sleeps `min(delayMs, timeout)` and PASSes
   with no assertion records; no `waitUntil` PASSes with empty assertions.
7. **`closeSurface` replaces `stopProcess`** (`src/core/tests/closeSurface.ts`, `closeSurface_v3`
   schema; `stopProcess.ts`/`stopProcess_v3` deleted). It takes a surface reference: a string,
   `{ process }`, or an array of those. It resolves to a list of process names, then tree-kills and
   deregisters each, **idempotently**. Closing an absent surface is a PASS no-op, replacing `next`'s
   never-fails-on-missing `stopProcess`. Process names are the explicit `background.name` required by
   the canonical `background` object, and there is no name derivation.

## Consequences

* **Good:** docs can drive line-oriented REPLs and CLIs end-to-end, through start → type →
  wait-for-output → close. It's one familiar step, and one readiness vocabulary shared with
  background startup.
* **Good:** the surface and `waitUntil` vocabulary is forward-compatible. Browser and app surface
  kinds are additive `anyOf` branches, with no breaking change to Phase 1 specs.
* **Good:** the process input path never loads webdriverio. Lean installs keep `type`-to-process
  working without the browser dep.
* **Trade-off, a pipe rather than a PTY.** Keys go to the child's **stdin pipe**, not a
  pseudo-terminal. Full TUIs that require a real TTY, meaning raw mode, cursor addressing, or
  `claude`, are out of scope. Line-oriented REPLs work, and PTY support is deferred to Phase 2.
* **Trade-off, a clean break.** `readyWhen`, `log`, and `stopProcess` are removed with no aliases.
  This breaks the `next` prerelease API, which is acceptable because none reached `latest`.
* **Neutral:** `type` does not statically reject a bare-string `surface` that is a reserved engine
  keyword (`chrome`/`firefox`/…), nor a non-process surface object. It FAILs at runtime with
  "surface kind not yet supported", since Phase 1 resolves only the process kind.

## Confirmation

* Unit (`test/background-process.test.js`): `bg.write` round-trips into `getCombined()` on a real
  `node -i`. There's `waitForOutputMatch` (match-before-subscribe, match-after-chunk,
  timeout→false), `_processKeyMap` and `translateProcessKeys` (`$CTRL$` and special-key
  translation), and `resolveSurface` (process/engine/none). There's `closeSurface` (close,
  temp-script removal, idempotent no-op, array form), and `waitForReady` with the canonical
  `waitUntil` shape (stdio, port, AND of both, early-exit).
* Schema (`src/common/test/validate.test.js`): `type` accepts a string or `{process}` surface, plus
  `waitUntil.stdio`/`delayMs` and `timeout`. It rejects empty, browser, and extra-key surfaces,
  port-in-`type` readiness, `waitUntil` without a surface, and a process surface with element
  targeting. The canonical
  `background` object (required `name`, plus a flattened `waitUntil` of
  `stdio`/`port`/`httpGet`/`delayMs`) rejects unknown keys, empty `waitUntil`, and a missing `name`.
  `closeSurface` accepts a string, `{process}`, or array. It rejects an empty array or object, and
  process objects with an extra key.
* End-to-end: `test/core-artifacts/type-to-process.spec.json` drives `node -i` through the canonical
  `test/core-core.test.js` `concurrentRunners=2` fixture gate. It covers stdio-match, special keys
  and `$CTRL$`, `delayMs`-only, and a named process with an idempotent close. It resolves PASS or
  SKIPPED on every platform. The migrated `background-processes.spec.json` exercises the converged
  `waitUntil` and `closeSurface` shape.
  Focused `it`s assert the runtime FAIL paths. Typing to a missing process names it. A `stdio`
  `waitUntil` that can't match in a tiny timeout FAILs through the `stdioMatched` assertion. And
  `surface:"chrome"` reports "surface kind not yet supported".
