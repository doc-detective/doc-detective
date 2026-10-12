---
status: proposed
date: 2026-10-11
decision-makers: doc-detective maintainers
---

# Reuse one iOS Appium server across contexts

## Context and Problem Statement

Every native-app and mobile-web context starts its own Appium server and kills it at context end.
The browser pool's servers can't serve these contexts: they're sized by browser jobs, so an app-only
run starts none. Before ADR 01111, app servers also needed a different `APPIUM_HOME` from the
browser pool. Since ADR 01111 every server homes in the runtime cache.

On the `apps-ios` fixtures, each context spent 2–12 s starting its server. It spent a few more
seconds between closing its last surface and the server exiting. Sequential iOS contexts paid that every
time.

## Decision Drivers

* iOS session startup time, paid once per context.
* No change to what a context sees: each still opens its own XCUITest session.
* A failure in one context must not leak into the next.
* Keep Android as it is. Its servers carry Android SDK paths and Chromedriver flags, and its
  emulator lifecycle is under separate work.

## Considered Options

* **A. A run-level pool of iOS app servers** (chosen).
* **B. Route iOS contexts through the browser pool.** The pool doesn't exist in app-only runs, and
  sizing it for app contexts would change browser concurrency.
* **C. Reuse the XCUITest session too.** Larger savings, but contexts would share a WebDriverAgent
  session, a change to context isolation.

## Decision Outcome

Chosen option: **A**. `runSpecs` creates one `createAppServerPool()` per run and threads it to
`runContext`, which attaches it to iOS app sessions only.

* Both iOS start sites (app surfaces and mobile web) call `pool.acquire(key, start, checks)`. The
  key is the server's launch environment: Appium entry, environment variables, and extra
  arguments. Servers only serve contexts that would have started an identical server.
* A held server never goes to a second context, so concurrent contexts still get their own.
* Before reusing an idle server, the pool checks that its process is alive and that
  `GET /appium/sessions` reports no sessions. A session left open by a swallowed `deleteSession`
  failure could still claim the simulator, so such a server is killed and replaced.
* Context teardown releases a pooled server instead of killing it, and skips the Windows orphan
  sweep, which force-kills a live server's descendants.
* Run-end teardown drains the pool through `teardownAppSession`, the same path a per-context
  server took.

### Consequences

* Good: sequential iOS contexts skip the server start and stop.
* Neutral: each context still opens and closes its own XCUITest session, so nothing visible
  changes. There's no documentation change.
* Bad: an Appium server now outlives a context. A server-level fault, as opposed to a
  session-level one, can affect later contexts until the reuse check catches it.

### Confirmation

* Unit tests cover reuse on a matching key and no double-handout. They also cover a separate
  server per key, replacing dead and session-holding servers, and drain returning each server once. Teardown releases a
  pooled server without killing or sweeping it.
* Same-batch A/B runs of each iOS fixture leg against the previous commit (`fixtures-debug.yml`).
  Each context's PASS/SKIP result matches, and the job log shows one app server start per leg
  instead of one per context.

## Pros and Cons of the Options

### A. Pool of iOS app servers

* Good: removes per-context server churn without changing what a context sees.
* Bad: a longer-lived server, guarded by the reuse check.

### B. Browser pool

* Good: no new pool.
* Bad: absent in app-only runs, and it entangles app contexts with browser concurrency.

### C. Shared XCUITest session

* Good: also saves the 30–60 s WebDriverAgent start per session.
* Bad: changes context isolation.
