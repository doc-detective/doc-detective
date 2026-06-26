---
status: accepted
date: 2026-06-26
decision-makers: doc-detective maintainers
---

# Harden expression evaluation: ReDoS-safe literal regexes and construction-time escaping

## Context and Problem Statement

CodeQL flagged four security findings in the runtime expression evaluator
([src/core/expressions.ts](../src/core/expressions.ts)) and the background-process spawner
([src/core/utils.ts](../src/core/utils.ts)):

- **Alerts 61 & 62** — *Polynomial regular expression on uncontrolled data (ReDoS).* The
  string-literal matcher `"(?:[^"\\]|\\.)*"` (and its `'…'` twin) is used to mask/scan quoted
  literals inside an author-written expression. Its ambiguous inner alternation can backtrack
  super-linearly on adversarial input.
- **Alert 63** — *Incomplete string escaping.* When the `matches /regex/` operator strips the
  `/…/` delimiters, it escaped `"` but not `\`. Combined with a blunt global
  `expression.replace(/\\/g, "\\\\")` performed just before `new Function`, this made
  intentional escapes (`\"` inside a literal, a regex containing a `"`) round-trip incorrectly.
- **Alert 64** — *Shell command from library input.* `spawnBackgroundCommand` spawns with
  `shell: true`.

These are author-facing expression/condition features (`$$x == y`, `contains`, `matches`,
`oneOf`) and the `runShell`/`runCode` background path. The fix must clear the security findings
**without** changing the observable result of any valid expression.

## Decision Drivers

* Eliminate the ReDoS backtracking structurally, not by input length caps.
* Make string-literal escaping **correct and predictable** end-to-end, rather than relying on a
  global backslash-doubling hack that corrupts legitimate escapes.
* Preserve the behavior of every existing valid expression (the full assertion/expression test
  suite must stay green) — this is hardening, not a feature change.
* Distinguish a real injection sink from an intentional shell-executor feature.

## Considered Options

* **A. Unroll the literal regexes, replace the global doubling with construction-time escaping,
  and document `shell: true` as by-design** (chosen).
* **B. Apply CodeQL's literal suggestions verbatim** — escape backslashes at the `matches` site
  *while keeping* the global doubling, and rewrite `runShell` to an arg-array/`execFile` call.
* **C. Cap input length / add a regex timeout guard** instead of fixing the patterns.

## Decision Outcome

Chosen option **A**, because it removes the vulnerabilities at the root while preserving behavior:

1. **ReDoS (61/62).** Replace `(?:[^"\\]|\\.)*` with the canonical *unrolled-loop* form
   `[^"\\]*(?:\\.[^"\\]*)*` (and the `'…'`, `/…/` analogues) at all four sites — the two literal
   maskers, the `LEFT` operand pattern, and the `matches /regex/` capture. The unrolled form
   matches the identical language with no ambiguous overlap, so matching is linear-time.

2. **Escaping (63).** Escape **backslashes first, then double-quotes** when building the regex
   pattern string for `matches`, and **remove** the global `expression.replace(/\\/g, "\\\\")`
   that ran before `new Function`. String literals are now escaped at construction (masked author
   literals are restored verbatim as already-valid JS source; the `matches` pattern escapes its
   own `\` and `"`), so the blunt doubling — which corrupted `\"` inside literals and regexes
   containing `"` — is no longer needed.

3. **Shell (64).** `runShell`/`runCode`'s background spawn keeps `shell: true`. The command is the
   exact shell string an author writes in a test spec (pipes, `&&`, globbing, env expansion are
   part of the contract); it is author-controlled test content, not untrusted external input.
   Documented inline as by-design; the CodeQL alert is dismissed as won't-fix.

### Consequences

* Good: the four alerts clear; expression evaluation is linear-time on the literal patterns and
  escapes correctly. A latent bug — `\"` inside a string literal comparing unequal to itself — is
  fixed as a side effect (now covered by a test).
* Neutral/known: removing the global doubling means a backslash inside a **user string literal**
  now follows ordinary JS-string semantics (`"a\nb"` is `a`⏎`b`) instead of being preserved as a
  literal backslash. No existing test or fixture depended on the old behavior, and conditions use
  plain comparison/word operators where backslashes are vanishingly rare.
* Out of scope: a separate value-side quoting gap (a *resolved meta value* that itself contains a
  `"` used as the subject of `matches`) is noted but not part of these four alerts; tracked
  separately.

### Confirmation

* Red→green unit tests in [test/expressions-unit.test.js](../test/expressions-unit.test.js): a
  `matches /\d/` literal (backslash class) and a literal containing escaped quotes both fail
  before the change and pass after; the ReDoS rewrite is guarded by behavior-preservation tests.
* The full non-browser assertion/expression suite (expressions, custom/interaction assertions,
  guard `if`, routing, runCode/runShell, http/checkLink assertions, resolvedTests) stays green.
* CodeQL alerts 61–63 clear on re-scan; alert 64 is dismissed as by-design.

## Pros and Cons of the Options

### A. Unroll regexes + construction-time escaping + document shell (chosen)

* Good: roots out ReDoS and the escaping defect; behavior-preserving; no feature breakage.
* Good: removes a confusing global hack, making the escaping model explicit.
* Bad: changes backslash handling inside user string literals (untested edge; acceptable).

### B. CodeQL suggestions verbatim

* Good: minimal diff at each flagged line.
* Bad: escaping backslashes while keeping the global doubling **breaks** working regexes like
  `/\d/`; rewriting `runShell` to `execFile` **breaks** the shell-executor contract.

### C. Length caps / regex timeout

* Good: small change.
* Bad: doesn't fix the root cause; arbitrary limits can reject valid expressions and still leave
  the escaping defect.
