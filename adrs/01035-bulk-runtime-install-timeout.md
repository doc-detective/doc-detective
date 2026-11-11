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
batch. That batch is the full `HEAVY_NPM_DEPS` set, ~1000 packages. It's not a hang-protection
scenario, but a legitimately long install.

On slow Windows CI runners the postinstall pre-warm reliably had its npm child killed at 5:00
mid-extraction. That pre-warm is [scripts/postinstall.js](../scripts/postinstall.js) spawning
`doc-detective install all`, under a 10-minute outer ceiling.
[ADR 01034](01034-sweep-orphaned-managed-deps-into-runtime-manifest.md)
made the resulting on-disk orphans safe, since the next install no longer prunes them. But the
pre-warm itself is still forfeited. The first real run re-pays the install cost it was meant to
absorb. In the observed github-action jobs, that pushed total setup time toward the Appium
start window.

## Decision Drivers

* The bulk batch must be allowed to take as long as a large install legitimately takes on a slow
  runner, without removing hang protection entirely.
* A genuinely hung npm inside the postinstall must still die, with a diagnosable error from
  `ensureRuntimeInstalled`. That must happen *before* the postinstall's 10-minute outer ceiling
  silently tears the whole child tree down. The ceiling's failure mode reports nothing per-batch.
* Single-package JIT installs (`loadHeavyDep`, mid-run preflights) keep the 5-minute default. They
  are small, they block a live run, and the original hang rationale fully applies.

## Considered Options

1. **Pass a larger, bulk-specific timeout (9 minutes) from `installRuntime`**, overridable via a
   new `installTimeoutMs` option.
2. Raise the loader's global default for every install.
3. Disable the timeout (`0`) for the bulk path and rely on the postinstall's outer ceiling.

## Decision Outcome

Chosen option: **1**. `BULK_INSTALL_TIMEOUT_MS = 9 * 60 * 1000` is exported from
[src/runtime/installer.ts](../src/runtime/installer.ts). `installRuntime` forwards it, or a
caller-provided `installTimeoutMs`, to each npm child it spawns. That's the core batch and the
failure-tolerant best-effort singles. 9 minutes sits above the observed legitimate bulk duration,
since the killed runs were extracting normally at 5:00. It's below the postinstall's 10-minute
ceiling, so the per-child timeout always fires first. That timeout reports "npm install timed out …
see install.log".

Option 2 would weaken hang protection for every mid-run JIT install to serve one bulk path.
Option 3 loses per-batch diagnosability. The outer ceiling kills the whole CLI child silently, and
can strand npm grandchildren, which is exactly what the inner timeout exists to prevent.

### Consequences

* Good: the postinstall pre-warm survives slow runners. First runs start with a warm cache, and the
  ADR 01034 orphan scenario becomes rare instead of routine.
* Good: direct `doc-detective install all` / `install runtime` invocations get the same realistic
  cap; programmatic callers can tune or disable it via `installTimeoutMs`.
* Neutral: a genuinely hung bulk npm now takes up to 9 minutes to fail instead of 5. That's accepted
  for an explicit install command, and mid-run JIT installs are unchanged.

### Confirmation

Red→green unit tests live in [test/runtime-installer.test.js](../test/runtime-installer.test.js). A
hanging npm child rejects with the forwarded `installTimeoutMs`, proving the plumbing per child.
The exported default is pinned at 9 minutes.

## Pros and Cons of the Options

### Option 1: bulk-specific timeout, forwarded per child (chosen)

* Good: scopes the relaxation to the one path whose workload justifies it; keeps every timeout's
  error attributable to its batch.
* Bad: one more constant whose relationship to the postinstall ceiling must be maintained by hand
  (documented on both constants).

### Option 2: raise the global loader default

* Bad: a hung single-package JIT install would block a live run 9 minutes instead of 5. The two
  paths have different workloads, and deserve different caps.

### Option 3: no inner timeout for bulk

* Bad: on a hang, the postinstall ceiling SIGTERMs the CLI child with no per-batch error, and
  possibly orphaned npm grandchildren. Interactive `install all`, with no outer ceiling, would hang
  forever.
