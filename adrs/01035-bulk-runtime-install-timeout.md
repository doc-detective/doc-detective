---
status: accepted
date: 2026-07-06
decision-makers: doc-detective maintainers
---

# Give bulk runtime installs a 9-minute npm-child timeout instead of the 5-minute single-package default

## Context and Problem Statement

`ensureRuntimeInstalled` caps its spawned npm child at 5 minutes
(`DEFAULT_INSTALL_TIMEOUT_MS` in [src/runtime/loader.ts](../src/runtime/loader.ts)) so a hung
npm/network can never freeze a first `doc-detective` run. `installRuntime`
([src/runtime/installer.ts](../src/runtime/installer.ts)) inherited that default for the **bulk**
batch — the full `HEAVY_NPM_DEPS` set, ~1000 packages — which is not a hang-protection scenario but
a legitimately long install.

On slow Windows CI runners the postinstall pre-warm ([scripts/postinstall.js](../scripts/postinstall.js)
spawns `doc-detective install all` under a 10-minute outer ceiling) reliably had its npm child
killed at 5:00 mid-extraction. [ADR 01034](01034-sweep-orphaned-managed-deps-into-runtime-manifest.md)
made the resulting on-disk orphans safe (they are no longer pruned by the next install), but the
pre-warm itself is still forfeited: the first real run re-pays the install cost it was meant to
absorb, and in the observed github-action jobs that pushed total setup time toward the Appium
start window.

## Decision Drivers

* The bulk batch must be allowed to take as long as a large install legitimately takes on a slow
  runner, without removing hang protection entirely.
* A genuinely hung npm inside the postinstall must still die — with a diagnosable error from
  `ensureRuntimeInstalled` — *before* the postinstall's 10-minute outer ceiling silently tears the
  whole child tree down (the ceiling's failure mode reports nothing per-batch).
* Single-package JIT installs (`loadHeavyDep`, mid-run preflights) keep the 5-minute default: they
  are small, block a live run, and the original hang rationale fully applies.

## Considered Options

1. **Pass a larger, bulk-specific timeout (9 minutes) from `installRuntime`**, overridable via a
   new `installTimeoutMs` option.
2. Raise the loader's global default for every install.
3. Disable the timeout (`0`) for the bulk path and rely on the postinstall's outer ceiling.

## Decision Outcome

Chosen option: **1** — `BULK_INSTALL_TIMEOUT_MS = 9 * 60 * 1000` exported from
[src/runtime/installer.ts](../src/runtime/installer.ts); `installRuntime` forwards it (or a
caller-provided `installTimeoutMs`) to each npm child it spawns (the core batch and the
failure-tolerant best-effort singles). 9 minutes sits above the observed legitimate bulk duration
(the killed runs were extracting normally at 5:00) and below the postinstall's 10-minute ceiling,
so the per-child timeout — with its "npm install timed out … see install.log" error — always fires
first.

Option 2 would weaken hang protection for every mid-run JIT install to serve one bulk path.
Option 3 loses per-batch diagnosability: the outer ceiling kills the whole CLI child silently and
can strand npm grandchildren, which is exactly what the inner timeout exists to prevent.

### Consequences

* Good: the postinstall pre-warm survives slow runners; first runs start with a warm cache and the
  ADR 01034 orphan scenario becomes rare instead of routine.
* Good: direct `doc-detective install all` / `install runtime` invocations get the same realistic
  cap; programmatic callers can tune or disable it via `installTimeoutMs`.
* Neutral: a genuinely hung bulk npm now takes up to 9 minutes to fail instead of 5 — accepted for
  an explicit install command; mid-run JIT installs are unchanged.

### Confirmation

Red→green unit tests in [test/runtime-installer.test.js](../test/runtime-installer.test.js): a
hanging npm child rejects with the forwarded `installTimeoutMs` (proving the plumbing per child),
and the exported default is pinned at 9 minutes.

## Pros and Cons of the Options

### Option 1 — bulk-specific timeout, forwarded per child (chosen)

* Good: scopes the relaxation to the one path whose workload justifies it; keeps every timeout's
  error attributable to its batch.
* Bad: one more constant whose relationship to the postinstall ceiling must be maintained by hand
  (documented on both constants).

### Option 2 — raise the global loader default

* Bad: a hung single-package JIT install would block a live run 9 minutes instead of 5; the two
  paths have different workloads and deserve different caps.

### Option 3 — no inner timeout for bulk

* Bad: on a hang, the postinstall ceiling SIGTERMs the CLI child with no per-batch error and
  possible orphaned npm grandchildren; interactive `install all` (no outer ceiling) would hang
  forever.
