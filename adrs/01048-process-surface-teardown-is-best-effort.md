---
status: accepted
date: 2026-07-10
decision-makers: doc-detective maintainers
---

# Process-surface teardown is best-effort and always deregisters

## Context and Problem Statement

[ADR 01046](01046-retry-process-surface-init-crash-under-concurrency.md) added a bounded retry around
`startBackgroundProcessSurface` (`src/core/tests/processSurface.ts`). When `waitForReady` fails, the
catch block kills the crashed child and drops it from the registry before deciding whether to retry:

```ts
await teardown(bg);
processRegistry.delete(name);
```

`teardown` calls the handle's `kill()`. For a PTY-backed handle that is *already dead* — the common
case here, since an early exit is precisely why readiness failed — `kill()` can **reject**. Nothing
catches it, so a rejection:

1. **escapes the catch block and the whole function**, turning a clean `FAIL` step result into a
   thrown step;
2. **masks the real readiness error** (the caller sees `kill failed: …`, not
   `Process exited before becoming ready (exit code …)`);
3. **strands the registry entry**, because `processRegistry.delete(name)` never runs — and the next
   retry attempt's `processRegistry.set(name, entry)` then silently overwrites the tracked handle, so
   the run-end sweep can never reach it.

A best-effort cleanup of an already-dead process must not be able to fail the step it is cleaning up
after.

## Decision Drivers

* Teardown is *cleanup*, not the operation under test — it must never change the step's verdict.
* The readiness error is the diagnostically useful one and must survive.
* The registry must be left consistent on every path, so the run-end sweep and the retry's
  `register()` both see the truth.
* No behavior change on the happy path or for a `kill()` that succeeds.

## Considered Options

* **A. `try { await teardown(bg) } catch { /* ignore */ } finally { processRegistry.delete(name) }`** (chosen).
* **B. `try { await teardown(bg) } finally { processRegistry.delete(name) }`** — deregisters, but the
  rejection still propagates, so (1) and (2) above remain.
* **C. Leave the entry registered on a failed kill** so the run-end sweep retries the kill.
* **D. Status quo** — let the rejection escape.

## Decision Outcome

Chosen option: **A**. Swallowing the rejection and deregistering in `finally` fixes all three defects
with the smallest change: the step still returns its `FAIL` (or proceeds to the next retry), the
readiness error is preserved verbatim, and the registry is clean on every exit path.

**B** was the reviewer's original suggestion and is a strict improvement over **D**, but it only
addresses (3); the escaping rejection still corrupts the step result and hides the real error. **C**
sounds attractive but is unsound here: the retry immediately re-registers the same `name`, overwriting
the entry, so the sweep gains nothing while the stale handle leaks anyway. **D** is the bug.

Accepted trade-off: if `kill()` genuinely fails on a *live* process, that process is now deregistered
and the run-end sweep will not reap it. This is acceptable because this path is reached only when
readiness failed — i.e. the child already exited or never initialized — so there is, in practice,
nothing left alive to reap. Making the step throw in order to chase that hypothetical is a strictly
worse trade.

## Consequences

* **Good** — a `kill()` rejection can no longer turn a `FAIL` step into a thrown step, nor mask the
  readiness error that explains the failure.
* **Good** — the registry is consistent on every path; a failed kill can't strand an entry for the
  next attempt's `register()` to overwrite.
* **Neutral** — a genuinely-live process whose `kill()` fails is no longer swept. Unreachable in
  practice (see trade-off above).
* **Neutral** — happy path and successful-`kill()` path are byte-identical.

## Confirmation

* Unit: `test/background-process.test.js` — "a teardown kill() rejection neither escapes, masks the
  readiness error, nor strands the registry entry" drives a handle whose `kill()` rejects and asserts
  the call **returns** `FAIL`, that the description still carries the readiness error (`exit code 1`)
  and *not* `kill failed`, and that `processRegistry` has no leftover entry. It fails on the
  pre-fix build with the raw `kill failed: process already gone` escaping the function.
* The existing retry/bound/classifier tests from ADR 01046 remain green (61 passing).

## Pros and Cons of the Options

### A. catch + finally (chosen)

* Good: fixes all three defects; step verdict and readiness error preserved; registry always clean.
* Good: smallest diff; happy path unchanged.
* Neutral: a live process with a failing `kill()` goes unswept — unreachable on this path.

### B. finally only

* Good: registry always cleaned.
* Bad: the rejection still escapes, so the step throws and the readiness error is masked.

### C. Keep the entry registered on failed kill

* Good: in theory the run-end sweep retries the kill.
* Bad: the retry re-registers the same `name` and overwrites the entry — the sweep never sees the old
  handle, so it leaks regardless.

### D. Status quo

* Good: no change.
* Bad: a best-effort cleanup failure crashes the step, hides the real error, and leaks a registry entry.
