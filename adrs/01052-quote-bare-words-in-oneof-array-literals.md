---
status: accepted
date: 2026-07-12
decision-makers: doc-detective maintainers
---

# `oneOf` must quote bare words inside its array-literal operand

## Context and Problem Statement

The `oneOf` word operator (`src/core/expressions.ts`, `preprocessExpression`) rewrites
`<value> oneOf <options>` into a call to the runtime `oneOf(value, options)` helper. The left
operand is passed through `quoteIfLiteral`, which wraps a bare identifier in quotes unless it's
already a string/number/boolean/array/object literal. The right operand — the options array — was
never processed at all; it was spliced into the generated function body verbatim
(`oneOf(${quoteIfLiteral(left)}, ${right.trim()})`).

That's fine when every array element is already quoted (`oneOf ["linux", "mac"]`) or numeric
(`oneOf [0, 1]`). But a bare-word array like `oneOf [linux, mac, windows]` — the form a `contains`
user would reasonably expect to work by analogy, and the form used in this repo's own docs guidance
before PR #585 caught it — compiles each bare word as an unquoted JS identifier inside `new
Function(...)`. `linux`, `mac`, and `windows` are not declared anywhere in that scope, so evaluating
the generated function throws a `ReferenceError`. `evaluateExpression`'s try/catch (expressions.ts)
swallows that error and returns `undefined`, which downstream renders as `false`. The net effect:
`$$platform oneOf [linux, mac, windows]` silently fails closed on every platform, with no error
surfaced to the test author — discovered while authoring inline docs tests for the tests-overview
guide (PR #585), which had to route around it with a quoted array (`oneOf ["linux", "mac",
"windows"]`) and a note-to-self about a follow-up.

## Decision Drivers

* A test author writing `oneOf [a, b, c]` should get the same "bare word treated as a string
  literal" behavior `contains` and the comparison operators (`==`, `!=`, etc.) already give them —
  not a silent, undiagnosable `false`.
* No regression for already-correct forms: quoted-string arrays, numeric arrays, boolean/null
  arrays, and a bare `$$meta` variable reference standing in for the whole options list (which is
  resolved to a JSON array literal by `replaceMetaValues` before `preprocessExpression` ever runs,
  so it's already valid JS by the time it reaches this code).
* Keep the fix inside the existing `oneOf` infix rewrite — don't touch `contains`/`matches`, which
  don't take an array-literal RHS and aren't affected by this defect.

## Considered Options

* **A. Quote bare items inside the `oneOf` array-literal RHS before splicing it into the generated
  function** (chosen).
* **B. Throw/log a diagnostic when a `oneOf` RHS array contains an undeclared bare identifier**,
  instead of silently fixing it up.
* **C. Require `oneOf` array elements to always be quoted** (docs-only fix; reject bare words as a
  documented limitation).

## Decision Outcome

Chosen option: **A**. It matches the precedent already set for the LHS of `oneOf` and for
`contains`'s RHS: a bare word in a word-operator's operand position is treated as an intended string
literal, not an accidental reference to an undeclared variable. Option B would still leave the
straightforward, intuitive form broken (test authors would have to learn to always quote). Option C
just relocates the footgun into documentation that's easy to miss (as #585 demonstrates — the repo's
own docs guide didn't know about it either).

Implementation: added a `quoteArrayItems` helper in `preprocessExpression` (`src/core/expressions.ts`).
It matches the RHS against `^\[([\s\S]*)\]$`; if it isn't a `[...]` literal (e.g. a resolved `$$`
array, or an unresolved `$$token` left bare), it's returned untouched — only an actual array literal
is rewritten. For a literal, it splits the contents on top-level commas (bracket/brace/paren-depth
aware, so a nested literal item isn't split mid-way) and runs each trimmed item through the existing
`quoteIfLiteral`, then rejoins. `quoteIfLiteral` already knows to leave numbers, booleans, `null`,
already-quoted strings, and masked string-literal placeholders (`__DDSTRn__`, from the quote-masking
pass earlier in `preprocessExpression`) alone, and to quote everything else — so the same rule now
applies per-element inside the array as it already did for the LHS. Segments that are empty after
trimming — a trailing comma (`[0, 1,]`) or a hole (`[a,,b]`) — are dropped rather than quoted into a
spurious `""` element, matching real JS array-literal elision instead of turning an accidental extra
comma into a silent `""` match.

### Consequences

* Good: `$$platform oneOf [linux, mac, windows]` now evaluates as intended (`true` on all three
  platforms) instead of silently failing closed.
* Good: mixed arrays (`["windows", linux]`) work the same as an all-bare or all-quoted array.
* Good: no change to numeric/boolean/null arrays, already-quoted arrays, or a bare `$$var` RHS —
  `quoteArrayItems` is a no-op unless the RHS is textually a `[...]` literal.
* Neutral: a test author who *wanted* `oneOf [someUndeclaredThing]` to fail closed as a signal that
  they mistyped a `$$` reference will instead get it treated as the literal string
  `"someUndeclaredThing"`. This matches `contains`'s existing behavior for the same mistake, so it's
  consistent, not a new risk.

### Confirmation

Red→green unit tests added to `test/expressions-unit.test.js`: a bare-word `oneOf` array evaluating
`true` and `false` on the matching/non-matching platform, a mixed quoted/bare array, and a numeric
bare array (regression guard, confirming untouched behavior). Full `test/expressions-unit.test.js`
and `test/expressions-coverage.test.js` suites pass (123 tests). Broader assertion-touching suites
(`test/checkLink-assertions.test.js`, `test/custom-assertions.test.js`,
`test/httpRequest-assertions.test.js`, `test/routing-context.test.js`,
`test/runCode-assertions.test.js`, `test/runShell.test.js`, `test/core-core.test.js`) pass unchanged.
A new fixture step in `test/core-artifacts/interactions/custom-assertions.spec.json` exercises
`$$platform oneOf [linux, mac, windows]` (bare words) end-to-end through the real runner on every OS.

## Pros and Cons of the Options

### A. Quote bare items in the array-literal RHS
* Good: fixes the root cause where it lives; consistent with existing `quoteIfLiteral` semantics
  used for `contains` and comparison operators.
* Good: no new syntax for authors to learn — the form they'd naturally reach for now works.
* Bad: none identified — a `[...]` literal RHS has no other legitimate bare-word meaning in this
  grammar.

### B. Diagnostic instead of silent fix-up
* Good: surfaces the author's mistake explicitly rather than guessing intent.
* Bad: doesn't fix the common, reasonable case (a test author expecting `contains`-like bare-word
  ergonomics); adds a new error-reporting path for something that isn't actually ambiguous.

### C. Docs-only, require quoting
* Good: zero code change.
* Bad: doesn't fix the footgun, just relocates it into documentation that both users and this repo's
  own docs authors have already missed once (#585); every future author hits the same silent
  failure until they read that specific callout.
