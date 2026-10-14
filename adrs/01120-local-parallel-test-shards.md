---
status: accepted
date: 2026-10-14
decision-makers: hawkeyexl
---

# Run the local mocha suite as concurrent shards

## Context and Problem Statement

`npm test` runs every `test/*.test.js` file in one mocha process. That takes
about nine minutes on a developer's Windows machine. Most of that time is spent
waiting on browsers, Appium, and child processes, not on the CPU. CI already
splits the suite into two shards with `scripts/run-test-shard.cjs`, one job per
shard.

Running two shards side by side locally means solving two problems. The mocha
root hook in `test/hooks.js` starts the test servers on ports 8092 and 8093,
and tolerates `EADDRINUSE`. If two shards each ran that hook, the first to
finish would stop the servers while the other was still using them.

## Decision Drivers

* `npm test` and CI don't change.
* Use the same file partition as CI, so a local failure maps to a CI shard.
* Neither shard may tear down the servers under the other.
* A failing shard fails the run, and both outputs stay readable.

## Considered Options

1. **`npm run test:parallel`.** `scripts/test-parallel.cjs` starts the test
   servers once, runs the shards concurrently, and stops the servers afterward.
2. **mocha `--parallel`.** Mocha's own worker pool.
3. **Leave it to developers** to open two terminals.

## Decision Outcome

Chosen option: **1**.

`scripts/test-parallel.cjs` imports `createTestServers()` from
`test/server/instances.js` and starts both servers before any shard runs. Each
shard's root hook then hits `EADDRINUSE` and reuses them. A shard's `afterAll`
stop is a no-op on a server it never started. The script spawns
`run-test-shard.cjs i N` for each shard, two by default, and prefixes every
output line with `[shard i/N]`. It exits with the highest shard status, and a
signal-killed shard counts as 1. It always stops the servers it started.

### Consequences

* Good, because the local suite's wall time drops. See the PR for the A/B
  numbers.
* Good, because CI and `npm test` don't change.
* Bad, because two shards share one desktop. A headed browser in one shard can
  take focus from a native-app or recording test in the other.
* Bad, because if another worktree already holds 8092, the shards reuse that
  server, as `npm test` would. Its static files then come from the other
  checkout.

### Confirmation

[test/test-parallel.test.js](../test/test-parallel.test.js) covers the
exit-code roll-up and the `test:parallel` script wiring. The full-suite A/B in
the PR compares serial and parallel runs on the same machine, back to back.

## Pros and Cons of the Options

### npm run test:parallel

* Good, because it reuses the CI partition and the shared server factory.
* Bad, because the shards' weights are tuned for CI runners, not for local
  machines.

### mocha --parallel

* Good, because it's built in.
* Bad, because root hooks run per worker, which re-creates the server teardown
  race. Several suites also assume they run serially in one process.

### Two terminals

* Good, because there's no code.
* Bad, because the server race remains, and the exit status has to be checked
  by hand.
