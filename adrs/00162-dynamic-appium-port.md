---
status: accepted
date: 2026-05-05
decision-makers: doc-detective maintainers
---

# Dynamic Appium port

## Context and Problem Statement

The runner spawned Appium on the hardcoded port `4723`. When a previous Appium instance had not
fully released the port, or when multiple runs/contexts overlapped, the spawn raced against a
still-bound socket and `driverStart()` failed with `ECONNREFUSED` or a bind error. How should the
runner pick the Appium port so concurrent and back-to-back runs do not collide?

## Decision Drivers

* Hardcoded `4723` collides across overlapping runs and slow port releases.
* Concurrent context execution (`concurrentRunners`) makes a single fixed port untenable.
* The fix must not require the user to configure or reason about ports.
* Spawn must reliably reach a listening Appium before WebDriver sessions are created.

## Considered Options

* **A. Allocate a dynamic free port with `findFreePort()` before each Appium spawn** (chosen).
* **B. Guard the fixed port: wait for `4723` to be free before spawning, with connect retries.**
* **C. Make the port a user-configurable config field.**

## Decision Outcome

Chosen option: **A**, because asking the OS for an open port removes the collision class entirely
rather than waiting it out. The decision evolved:

1. First, `waitForPortFree()` bound `127.0.0.1:4723` before spawning Appium (up to ~30s) and
   `driverStart()` retried on `ECONNREFUSED` (commit `cc1cc7b5`) — a guard on the fixed port.
2. That was superseded by `findFreePort()` in `core/utils.ts`: Appium now binds a dynamically
   chosen free port instead of the hardcoded `4723` (commit `ce3ab862`, PR #301).

Net contract: the Appium port is allocated at spawn time, not fixed, so overlapping runs and
contexts each get their own port.

### Consequences

* Good: eliminates fixed-port collisions for concurrent and back-to-back runs.
* Good: no user configuration of ports required.
* Neutral: the earlier `waitForPortFree` guard is retired by the dynamic-port approach.
* Bad: logs/diagnostics no longer show a predictable Appium port (it varies per run).

### Confirmation

`findFreePort()` in `core/utils.ts` drives the Appium spawn. Shipped in `ce3ab862` (PR #301),
superseding `cc1cc7b5`.

## Pros and Cons of the Options

### A. Dynamic free port
* Good: removes the collision class outright; no config burden.
* Bad: non-deterministic port complicates manual debugging.

### B. Wait-for-free guard on 4723
* Good: keeps a predictable port.
* Bad: still races under true concurrency; adds startup latency.

### C. User-configured port
* Good: explicit control.
* Bad: pushes a concurrency problem onto the user; still collides if misconfigured.

## More Information

Recorded retrospectively (ADR backfill). Origin: doc-detective commits `cc1cc7b5`, `ce3ab862`
(PR #301). Inventory ref: BACKFILL-INVENTORY.md Seq 222, 225. Related: `00172` (concurrent test
runners), `00130` (Appium readiness `/status` probe).
