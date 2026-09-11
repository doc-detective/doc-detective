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
already a string, number, boolean, array, or object literal. The right operand, the options array,
was never processed at all. It was spliced into the generated function body verbatim, as
`oneOf(${quoteIfLiteral(left)}, ${right.trim()})`.

That's fine when every array element is already quoted (`oneOf ["linux", "mac"]`) or numeric
(`oneOf [0, 1]`). But a bare-word array like `oneOf [linux, mac, windows]` compiles each bare word
as an unquoted JS identifier inside `new Function(...)`. That's the form a `contains` user would
reasonably expect to work by analogy. It's also the form used in this repo's own docs guidance,
before PR #585 caught it. `linux`, `mac`, and `windows` are not declared anywhere in that scope, so
evaluating the generated function throws a `ReferenceError`. `evaluateExpression`'s try/catch in
expressions.ts swallows that error and returns `undefined`, which downstream renders as `false`. The
net effect is that `$$platform oneOf [linux, mac, windows]` silently fails closed on every platform,
with no error surfaced to the test author. It was discovered while authoring inline docs tests for
the tests-overview guide (PR #585). Those had to route around it with a quoted array,
`oneOf ["linux", "mac", "windows"]`, and a note-to-self about a follow-up.

## Decision Drivers

* A test author writing `oneOf [a, b, c]` should get the same "bare word treated as a string
  literal" behavior that `contains` and the comparison operators already give them. Not a silent,
  undiagnosable `false`.
* No regression for already-correct forms. Those are quoted-string arrays, numeric arrays, boolean
  and null arrays, and a bare `$$meta` variable reference standing in for the whole options list.
  That last one is resolved to a JSON array literal by `replaceMetaValues`, before
  `preprocessExpression` ever runs. It's already valid JS by the time it reaches this code.
* Keep the fix inside the existing `oneOf` infix rewrite. Don't touch `contains` or `matches`, which
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
`contains`'s RHS. A bare word in a word-operator's operand position is treated as an intended string
literal, not an accidental reference to an undeclared variable. Option B would still leave the
straightforward, intuitive form broken, and test authors would have to learn to always quote. Option
C just relocates the footgun into documentation that's easy to miss. #585 demonstrates that. The
repo's own docs guide didn't know about it either.

Implementation: added a `quoteArrayItems` helper in `preprocessExpression` (`src/core/expressions.ts`).
It matches the RHS against `^\[([\s\S]*)\]$`. Anything that is not a `[...]` literal is returned
untouched, so only an actual array literal is rewritten. That covers a resolved `$$` array, or an
unresolved `$$token` left bare. For a literal, it splits the contents on top-level commas. The split
is bracket, brace, and paren-depth aware, so a nested literal item isn't split mid-way. It then runs
each trimmed item through the existing `quoteIfLiteral`, and rejoins. `quoteIfLiteral` already knows
to leave numbers, booleans, `null`, already-quoted strings, and masked string-literal placeholders
alone, and to quote everything else. Those placeholders are `__DDSTRn__`, from the quote-masking
pass earlier in `preprocessExpression`. So the same rule now applies per-element inside the array as
it already did for the LHS. Segments that are empty after trimming are dropped, rather than quoted
into a spurious `""` element. That covers a trailing comma (`[0, 1,]`) and a hole (`[a,,b]`). It
matches real JS array-literal elision, instead of turning an accidental extra comma into a silent
`""` match.

### Consequences

* Good: `$$platform oneOf [linux, mac, windows]` now evaluates as intended (`true` on all three
  platforms) instead of silently failing closed.
* Good: mixed arrays (`["windows", linux]`) work the same as an all-bare or all-quoted array.
* Good: no change to numeric, boolean, or null arrays, to already-quoted arrays, or to a bare
  `$$var` RHS. `quoteArrayItems` is a no-op unless the RHS is textually a `[...]` literal.
* Neutral: a test author may have *wanted* `oneOf [someUndeclaredThing]` to fail closed, as a signal
  that they mistyped a `$$` reference. They will instead get it treated as the literal string
  `"someUndeclaredThing"`. This matches `contains`'s existing behavior for the same mistake, so it's
  consistent, not a new risk.

### Confirmation

Red→green unit tests were added to `test/expressions-unit.test.js`. They cover a bare-word `oneOf`
array evaluating `true` and `false` on the matching and non-matching platform, and a mixed quoted
and bare array. A numeric bare array is a regression guard, confirming untouched behavior. Full `test/expressions-unit.test.js`
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
* Good: no new syntax for authors to learn. The form they'd naturally reach for now works.
* Bad: none identified. A `[...]` literal RHS has no other legitimate bare-word meaning in this
  grammar.

### B. Diagnostic instead of silent fix-up
* Good: surfaces the author's mistake explicitly rather than guessing intent.
* Bad: it doesn't fix the common, reasonable case, a test author expecting `contains`-like bare-word
  ergonomics. It also adds a new error-reporting path for something that isn't actually ambiguous.

### C. Docs-only, require quoting
* Good: zero code change.
* Bad: it doesn't fix the footgun. It just relocates it into documentation that both users and this
  repo's own docs authors have already missed once, in #585. Every future author hits the same
  silent failure until they read that specific callout.
