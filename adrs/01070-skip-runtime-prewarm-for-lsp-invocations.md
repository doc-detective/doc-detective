---
status: accepted
date: 2026-07-15
decision-makers: doc-detective maintainers
---

# Skip the postinstall runtime pre-warm for `npx doc-detective lsp`

## Context and Problem Statement

`scripts/postinstall.js` eagerly runs `doc-detective install all` on every `npm install`, downloading
the heavy runtime (webdriverio/appium/sharp) plus browser and driver binaries so a fresh install — and
any Docker image built `FROM` it — is ready to run tests immediately. That pre-warm is valuable for a
persistent install but pure waste for a user who installed doc-detective *only to run the language
server* via `npx doc-detective lsp`: the LSP needs none of the browser/driver runtime. Pulling
hundreds of megabytes of browsers to answer an editor's diagnostics request is a bad first
experience — especially since the Claude Code plugin launches the server through
`npx --yes doc-detective lsp --stdio`.

The obstacle is detection. The pre-warm decision is made in the postinstall lifecycle script, which
runs *during* the install that `npx` performs — before the `lsp` bin is executed. npm exposes
`npm_command` (`"exec"` for npx vs `"install"` for a plain install) but **not** the positional
subcommand: `npm_config_argv` was removed in npm 7, and no other environment variable carries the
`lsp` token (verified empirically on npm 11). So the script cannot read "the user typed `lsp`" from
its environment.

## Decision Drivers

* Make `npx doc-detective lsp` lightweight — no browser/driver download.
* Do **not** regress the pre-warm for the cases that rely on it: persistent `npm install` and Docker
  images built `FROM` a doc-detective base.
* Do **not** over-skip: `npx doc-detective runTests` should still pre-warm, since it will actually use
  the runtime. (This is why "skip on all npx" was rejected.)
* The postinstall must stay fast and must never fail the parent `npm install` — any detection has to
  be best-effort with a safe fallback.
* No new cost on the hot path (`npm install`), which is the overwhelming majority of installs.

## Considered Options

* **A. Detect the `lsp` argument from the process ancestry** (chosen) — when (and only when) the
  invocation is npx (`npm_command === "exec"`), walk the parent-process chain and look for a
  `doc-detective … lsp` command line; skip the pre-warm on a match.
* **B. Skip the pre-warm for all npx (`npm_command === "exec"`) invocations** — simple, no
  process-tree walk, but over-skips `npx doc-detective runTests`, forfeiting its pre-warm.
* **C. Have the LSP launcher set `DOC_DETECTIVE_AUTOINSTALL=0`** — only helps the plugin path; a
  manual `npx doc-detective lsp` in a terminal wouldn't benefit.
* **D. Move the LSP's own deps (`vscode-languageserver`, `-textdocument`, `jsonc-parser`) to
  lazy/JIT install** — orthogonal to the heavy pre-warm and adds machinery for three *small*
  packages; rejected in favor of keeping them as lightweight regular deps.

## Decision Outcome

Chosen option: **A**. The `lsp` token *is* recoverable from the process ancestry even though the
environment hides it: during `npx doc-detective lsp`, an ancestor process's command line is
`… npx-cli.js … doc-detective lsp`. `isLspInvocation()` returns true only when **both** hold:

1. `npm_command === "exec"` (an npx invocation), and
2. some ancestor command line matches `doc-detective` **and** a standalone `lsp` argument
   (`isDocDetectiveLspCommand`).

`main()` returns early on a positive detection, skipping both the runtime pre-warm and the
agent-install prompt. The runtime still lazy-installs on the first actual test run if one ever
happens, so nothing is permanently lost.

Crucially, condition 1 is checked first, so a plain `npm install` / Docker build returns immediately
**without** walking the process tree — the hot path pays nothing. Only npx invocations read the
process table (one `powershell`/`ps` call, or a `/proc` read on Linux), and that read is wrapped so
any failure returns `[]` → detection is false → the pre-warm proceeds (the pre-change behavior). The
`lsp`-as-a-word match (`(^|\s)lsp(\s|$)`) avoids false hits like an `lsp-…` path segment, and the
`npm_command === "exec"` gate means `npm install` in a directory whose path contains `lsp` can never
be misread.

B was rejected because it forfeits the pre-warm for `npx doc-detective runTests`, which genuinely
wants it. C helps only the plugin. D is orthogonal and not worth the machinery for three small
packages; the LSP deps stay as regular dependencies.

### Consequences

* Good: `npx doc-detective lsp` (and the plugin's `npx --yes doc-detective lsp --stdio`) no longer
  downloads browsers/drivers.
* Good: persistent `npm install` and Docker pre-warm are untouched; `npx … runTests` still pre-warms.
* Good: zero added cost on the `npm install` hot path (the process-tree walk is gated behind
  `npm_command === "exec"`).
* Neutral (accepted): detection is best-effort. If the process-tree read fails (locked-down host,
  unusual process shape), it falls back to pre-warming — never worse than today, occasionally
  pre-warming an lsp-only npx install. A first `npx … lsp` on such a host over-installs once.
* Neutral: adds a `powershell`/`ps` spawn (or `/proc` read) to npx installs only. Bounded by a 5s
  timeout and a 12-hop cycle-guarded walk.

### Confirmation

* Hermetic unit tests in `test/postinstall-runtime.test.js`: `isDocDetectiveLspCommand` (matches the
  npx/node/plugin forms, rejects `runTests`, `lsp-helper`, non-doc-detective, and non-strings);
  `isLspInvocation` (short-circuits on non-`exec` without reading the tree; true only for an npx
  ancestor that is a `doc-detective lsp` command); `readAncestorCommandLines` (walks an injected
  process table, is cycle-guarded, and returns `[]` on a reader failure).
* Empirically verified against real `npx` on npm 11: `npm_command === "exec"`, no env carries the
  subcommand, and the ancestor command line contains `… doc-detective lsp`.

## Pros and Cons of the Options

### A. Detect `lsp` from process ancestry (gated on npx)
* Good: precise — skips lsp, preserves pre-warm for `npm install`/Docker and `npx … runTests`; hot
  path pays nothing.
* Bad: relies on reading the process tree (platform-specific, best-effort) for the npx case.

### B. Skip pre-warm on all npx
* Good: trivial; no process-tree walk.
* Bad: over-skips `npx doc-detective runTests`, losing a pre-warm that invocation actually wants.

### C. Launcher sets `DOC_DETECTIVE_AUTOINSTALL=0`
* Good: no detection logic.
* Bad: only the plugin path benefits; a manual `npx doc-detective lsp` still pre-warms.

### D. Lazy/JIT the LSP's own deps
* Good: a runtime-only install wouldn't pull them.
* Bad: orthogonal to the heavy pre-warm; adds JIT machinery for three small packages, and costs a
  first-run install delay for the LSP. Rejected — they stay lightweight regular deps.

## More Information

Language-server design: [docs/design/dsl-lsp.md](../docs/design/dsl-lsp.md);
[ADR 01066](01066-language-server-for-the-dsl.md) (the in-package LSP). The pre-warm itself and the
`DOC_DETECTIVE_AUTOINSTALL` opt-out live in `scripts/postinstall.js`; the runtime's lazy-install-on-
first-use fallback is documented in `src/runtime/AGENTS.md`.
