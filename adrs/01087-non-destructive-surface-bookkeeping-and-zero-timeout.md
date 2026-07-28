---
status: accepted
date: 2026-07-28
decision-makers: hawkeyexl
---

# Non-destructive active-surface bookkeeping, and `timeout: 0` as an immediate check

## Context and Problem Statement

While auditing the active-surface routing layer (chasing the Windows
`start-surface-parallel` failure tracked in
[#696](https://github.com/doc-detective/doc-detective/issues/696)), three defects
surfaced that are independent of that investigation. None was the cause of the
Windows flake — that audit came back empty — but each is a real behavior bug or a
latent one, and they share a theme: **state that is silently wrong is worse than
state that fails loudly.**

1. **`find: { timeout: 0 }` did not mean what it says on a browser surface.**
   [`findElement.ts`](../src/core/tests/findElement.ts) defaulted with
   `step.find.timeout || 5000`, so an explicit `0` — a valid schema value — was
   clobbered to the 5-second default. The app path one screen above used
   `?? 5000` with a comment stating that `timeout: 0` must stay an immediate
   check. The same schema field therefore behaved differently depending on which
   surface kind the step resolved to.

   Fixing only the operator would have traded one wrong behavior for another:
   both polling strategies in
   [`findStrategies.ts`](../src/core/tests/findStrategies.ts) are
   `while (Date.now() - startTime < timeout)`, so an honored `timeout: 0` would
   have meant *never check at all* rather than *check once, now*.

2. **`currentSurface` deleted live surfaces when a registry wasn't supplied.**
   [`activeSurface.ts`](../src/core/tests/activeSurface.ts) prunes dead handles
   lazily and writes the result back (`tracker.mru = live`) — closes need no
   tracker bookkeeping, which is a good design. But `isLive` returns `false` both
   for "this surface is gone" and for "you didn't give me the registry that would
   tell me", and the prune is destructive. A caller that omitted a registry
   permanently deleted that kind's live handles from shared per-context state,
   breaking routing for every later step that *did* supply it.

   All four call sites (`findElement`, `saveScreenshot`, `swipe`, `typeKeys`)
   currently pass every registry, so nothing triggers this today. It is a trap
   for the next call site, not an active bug.

3. **A failed activation re-assert was silently discarded.**
   [`startSurface.ts`](../src/core/tests/startSurface.ts) ignored
   `activateSession`'s `false` return in the array form's authored-order
   re-assert. A miss would leave `registry.activeName` pointing at the previous
   session while the MRU tracker reported the new one — every later surface-less
   step would act on the wrong browser, with no error anywhere. Not reachable
   today (`openSession` registers under the name its outputs carry), so this is
   defense against a future divergence rather than a fix for a live fault.

## Decision Drivers

* A schema field must mean the same thing regardless of which surface kind a step
  resolves to.
* Shared per-context state must not be corrupted by a caller that merely knows
  less than another caller.
* An internal inconsistency should produce a diagnosable error, not a silently
  wrong run — the Windows investigation lost time precisely to a failure that
  reported success at every step.
* Changes must not alter behavior for the overwhelmingly common cases (positive
  timeouts, callers that supply every registry).

## Considered Options

* **Fix all three, scoped so the common paths are untouched.**
* **Fix only the `||` → `??` clobber.**
* **Leave the latent defects (2 and 3) alone and document them.**
* **Rework routing so there is a single source of truth for the active surface.**

## Decision Outcome

Chosen option: **fix all three, scoped so the common paths are untouched**,
because each is cheap, independently testable, and reduces the class of failure
that costs the most to debug — the silently wrong one.

Concretely:

1. `findElement` defaults the browser path with `?? 5000`, matching the app path;
   and both polling strategies in `findStrategies` become `do { … } while (…)`,
   so `timeout: 0` performs exactly one immediate check. For any positive
   timeout the first iteration always ran, so nothing changes there.

   The loop shape alone is not sufficient: every sleep site must also be guarded
   by the deadline. A `do/while` that sleeps the poll interval *before*
   re-evaluating its condition still turns "now" into "in 100ms", so each of the
   three sleep sites (including the empty-candidate `continue` path) returns
   early when the budget is already spent. A positive timeout that expires now
   also skips one final pointless sleep before giving up.
2. `currentSurface` prunes only handles whose registry the caller actually
   supplied (`canAdjudicate`), and selects only among those. Unknown is no longer
   treated as dead. The lazy-prune contract is preserved: when the registry *is*
   supplied and the surface isn't in it, the handle is still dropped.
3. The array-form re-assert checks `activateSession`'s return and, on a miss,
   marks that descriptor `FAIL` with an explanatory message, which the existing
   roll-up (`FAIL > SKIPPED > PASS`) surfaces on the step.

Note that "two sources of truth for the active surface" was considered and
**rejected as a mischaracterization**: `registry.activeName` answers *which
browser session*, while the MRU tracker answers *which surface kind is active*.
They are different questions, and ADR 01081's rule — an omitted `surface` acts on
the most recently active surface of any kind, and a step whose action that kind
can't perform fails with a capability error — depends on both. No rework there.

### Consequences

* Good, because `timeout: 0` now means the same thing on every surface kind, and
  means something useful ("check once") rather than something degenerate.
* Good, because a future `resolveTargetSurface` caller that forgets a registry
  gets a step that can't route through that kind, instead of silently corrupting
  routing for the rest of the context.
* Good, because an activation miss becomes a message naming the surface.
* Bad, because `timeout: 0` on a browser find changes from "waits 5s, probably
  succeeds" to "checks once, probably fails". Any spec relying on the clobbered
  default while writing `0` will now fail. That behavior was never documented and
  contradicted the schema, so the exposure is judged negligible.
* Neutral, because none of this affects the Windows `start-surface-parallel`
  failure; that remains open in
  [#696](https://github.com/doc-detective/doc-detective/issues/696).

### Confirmation

Three hermetic tests in
[`test/active-surface.test.js`](../test/active-surface.test.js), each written
red→green:

* `timeout: 0` polls exactly once instead of spinning (was 47 polls over ~5s),
  **and returns promptly** rather than sleeping a poll interval first. The test
  asserts both the poll count and elapsed time, because the count alone passed
  while the call still took ~870ms.
* A handle survives a `currentSurface` call whose registry was not supplied, and
  is still routable to a caller that does supply it.
* A handle whose registry *is* supplied and reports it gone is still pruned —
  guarding the lazy-prune contract against regression.

## Pros and Cons of the Options

### Fix all three, scoped

* Good, because it removes a live inconsistency and two silent-failure traps in
  one reviewable change.
* Good, because every change is a no-op on the common path.
* Bad, because it bundles one real bug with two defensive hardenings, which a
  reviewer must evaluate on different evidence standards.

### Fix only the `||` → `??` clobber

* Good, because it is the only change backed by a demonstrated live bug.
* Bad, because on its own it makes `timeout: 0` mean "never check", which is
  worse than the bug it fixes.

### Leave the latent defects alone and document them

* Good, because it keeps unreachable-code changes out of the tree.
* Bad, because both traps are one careless line away from becoming real, and both
  fail silently — the most expensive failure mode, as #696 demonstrated.

### Rework routing to a single source of truth

* Good, because it would remove a whole category of divergence question.
* Bad, because the premise is wrong: the two mechanisms answer different
  questions, and collapsing them would break ADR 01081's cross-kind capability
  errors.
* Bad, because routing every surface-less browser step through `switchToSurface`
  adds WebDriver round-trips and activation side effects to every step.

## Documentation impact

None. No user-facing surface is added, changed, or removed: no step type, action
option, config or CLI flag, engine, output format, supported platform, or
integration. The one observable change — `find: { timeout: 0 }` on a browser
surface — brings the runtime into line with what
[`find_v3.schema.json`](../src/common/src/schemas/src_schemas/find_v3.schema.json)
already documents ("Max duration in milliseconds to wait for the element to
exist", default `5000`), so the reference stays accurate as written.
