---
status: accepted
date: 2026-11-14
decision-makers: Doc Detective maintainers
---

# Serialize runtime installs into one cache directory

## Context and Problem Statement

Heavy dependencies install just-in-time into `<cacheDir>/runtime` with `npm install --prefix`.
Two Doc Detective processes, or two runs in one process, that need an install at the same time ran
two `npm install`s into the same prefix with no coordination. Each npm reifies its own ideal tree and
removes what the other just extracted. Afterward Appium wouldn't start (`Cannot find module
'validate-npm-package-license'`) ([#896](https://github.com/doc-detective/doc-detective/issues/896)).
Exact runtime pins make reinstalls happen on every runtime bump, so the race gets more likely.

How should concurrent installs into one cache behave?

## Decision Drivers

- A cache must never end up half-installed because two installs overlapped.
- A crashed installer must not block later runs for long.
- Two runs that need the same package shouldn't install it twice.
- No new dependency or configuration.

## Considered Options

1. Serialize installs per runtime dir through the existing cross-process lock (`src/runtime/lock.ts`).
2. Install into a per-process staging prefix, then swap it in.
3. Leave it, and document that one cache serves one process at a time.

## Decision Outcome

Chosen option: **1**. `ensureRuntimeInstalled` takes the lock at `<cacheDir>/runtime/install.lock`
before it spawns npm, in this process as well as across processes, and releases it when the install
settles. Once a waiter holds the lock, it re-checks which packages are still missing and skips any
that the previous holder installed. A waiter waits up to 10 minutes, above the 9-minute bulk install
cap, and then fails with:

```text
Couldn't install <packages>: another Doc Detective process is still installing into <runtimeDir>. Wait for it to finish, then run again.
```

The lock is a heartbeat lease, so a crashed holder's lock is taken over once its heartbeat goes stale
(5 minutes) or, on the same host, as soon as its pid is dead.

### Consequences

- Good, because overlapping installs can no longer prune each other's packages.
- Good, because a second run that needs the same package waits and then reuses it.
- Neutral, because a run that needs an install while another is installing now waits for it.
- Bad, because a holder on another host that crashed blocks installs until its heartbeat goes stale.

### Confirmation

`test/runtime-loader.test.js`, "concurrent installs into one cache": two installs in one process never
overlap; two child processes serialize, and the waiting process stays alive until its turn; a waiter
skips a package the holder installed.

## Pros and Cons of the Options

### 1. Per-runtime-dir lock

- Good, because the lock already exists, is tested, and handles crashed holders.
- Bad, because installs into one cache run one at a time.

### 2. Staging prefix and swap

- Good, because installs could run in parallel.
- Bad, because swapping a `node_modules` tree that running processes have loaded from isn't atomic on
  Windows, and the swap would still need a lock.

### 3. Document it

- Bad, because CI runners and parallel test suites share one cache by default, so users hit it without
  doing anything unusual.
