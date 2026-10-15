---
status: accepted
date: 2026-10-15
decision-makers: hawkeyexl
---

# Opt-in reuse of browser-pool Appium servers across runs in one process

## Context and Problem Statement

Every `runTests` call that drives a desktop browser starts its own browser-pool
Appium servers and tree-kills them when it ends. With `--use-drivers`
(ADR 01117) a server answers `/status` about 1.3 seconds after spawn on
Windows. The kill adds a `taskkill` round trip. One CLI invocation pays this
once, which is fine. A process that calls `runTests` many times pays it every
time. The mocha suite is the largest such process: it starts about 61 servers.
An embedder that calls `runTests` in a loop pays the same tax.

ADR 01117 rejected a warm server across runs because it changes the process
lifecycle that isolation, concurrency, and port-conflict handling rely on. Can
we get the saving without giving any of that up?

## Decision Drivers

* The default run must keep today's guarantees: its servers are its own, and
  they're gone when `runTests` returns.
* Sessions are never reused. Every test and context creates its own fresh
  WebDriver session and deletes it when done. No session is shared across
  tests or contexts, and none is created ahead of time for a later one. Only
  the Appium server process may outlive a run.
* No orphan Appium process, even if the host process is killed.
* A run can't tell a reused server from a fresh one. Both have the same
  Appium build, drivers, arguments, and environment, and no sessions.
* Concurrent `runTests` calls in one process must never share a server.
* No change to the test format, and no new user-facing contract until the
  saving is proven.

## Considered Options

1. **Opt-in, process-local cache of idle browser-pool servers.** A run hands
   its servers back instead of killing them. The next matching run takes them.
2. **The same cache, on by default.**
3. **Pre-create the next context's browser session** while the current
   context runs.
4. **Keep today's behavior.**

## Decision Outcome

Chosen option: **1, opt-in cache**, gated by the environment variable
`DOC_DETECTIVE_REUSE_APPIUM=true`. It's implemented in
[src/core/appiumReuse.ts](../src/core/appiumReuse.ts) and wired into the
browser-pool startup and teardown in `runSpecs`.

- **Test-only.** The variable is a switch for this repo's mocha suite, not a
  user setting. It has no `config_v3` field and no user documentation. The
  suite turns it on in [test/hooks.js](../test/hooks.js) unless the variable
  is already set, so `DOC_DETECTIVE_REUSE_APPIUM=false` runs the suite on the
  default path. Users, the CLI, and the fixture jobs never set it, so they
  always get the default lifecycle. Promoting it to a user setting would need
  a new decision.
- **Related.** ADR 01115 reuses one iOS server across the contexts of a single
  run. This decision is separate: it covers browser-pool servers across runs.

- **Scope.** Only browser-pool servers. App-surface and mobile servers own
  devices and per-context drivers, and `getRunner` hands its Appium process to
  the caller, so those keep their lifecycle. A run that uses Xvfb displays
  never reuses, because its displays die with the run.
- **Key.** A server is reused only under an identical key. The key holds the
  Appium entry and its CLI arguments, including `--use-drivers` and the
  geckodriver opt-in. It holds the whole environment the server would inherit,
  which carries `APPIUM_HOME`. It holds the installed versions of `appium` and
  each pool driver. An install that
  upgrades a driver, or a run that changes `process.env`, therefore gets a
  fresh server. One variable is left out: `WDIO_LOG_LEVEL`. WebdriverIO sets
  it in the host process on its first session, so keying on it made every
  process's second run miss. Appium never reads it.
- **Take.** A run first takes idle servers under its key. A taken server must
  still be running and answer `/status`. Otherwise it's tree-killed and the
  run spawns a fresh one, exactly as without reuse. Taking removes the server
  from the cache, so two concurrent runs never share one.
- **Hand back.** At run end, a server goes back to the cache only if
  `GET /appium/sessions` answers with no sessions within two seconds. A server
  with a leftover session, or one that doesn't answer, is tree-killed as
  before, along with any browser it still owns. At most four servers stay
  idle. Extras are killed. Appium serves that endpoint only with the
  `session_discovery` insecure feature, so reusable servers add
  `*:session_discovery` to the `--allow-insecure` list they already pass for
  geckodriver. The grant lists sessions on a server bound to 127.0.0.1, which
  is far less than the existing `custom_geckodriver_executable` grant. Servers
  that aren't reusable don't get it.
- **Idle lifetime.** An idle server is tree-killed after 60 seconds unused.
  The timer and the server's process handles are `unref`'d, so idle servers
  never keep the host process alive.
- **Parent death.** A reusable server is spawned with a tiny `--import`
  preload that exits when its stdin closes. The parent holds that pipe open
  for the server's whole life. When the parent exits or is killed, by any
  means including `SIGKILL`, the OS closes the pipe and the server exits. On
  Windows, libuv's kill-on-close job object already ends non-detached
  children with their parent.
- **Signals.** Unchanged. A run's `SIGINT`/`SIGTERM` handler kills the servers
  that run holds and exits. Idle servers then exit through the preload.

### Consequences

* Good, because a process that runs many browser runs pays Appium startup
  once per key instead of once per run.
* Good, because the default path is unchanged. With the variable unset, no
  server is cached, spawned with the preload, or kept after its run.
* Good, because the preload also covers a parent killed mid-run, for servers
  spawned with it.
* Neutral, because the CLI gains nothing. It runs once per process.
* Bad, because the suite holds up to four idle Appium processes for up to a
  minute after its last browser run.
* Bad, because state Appium keeps outside sessions persists between runs on a
  reused server. We know of none that affects a new session, but a fresh
  server is the stronger guarantee. That's why reuse is opt-in.

### Confirmation

* [test/appium-reuse.test.js](../test/appium-reuse.test.js) covers the
  cache's take, hand-back, idle expiry, and cap. It covers the key's
  sensitivity to arguments, environment, and driver versions, and the
  `session_discovery` grant joining the existing one. Hand-back kills a server
  with a session or one that doesn't answer. The preload ends an idle child
  when its parent dies. End to end, a second `runTests` reuses the first run's
  server only when the variable is set. With it unset or `false`, nothing is
  kept after a run, so the default path keeps mocha coverage while the suite
  runs with reuse on.
* The existing port-conflict, concurrency, and teardown suites run unchanged,
  now with reuse on.

## Pros and Cons of the Options

### Option 1: opt-in cache

* Good, because it removes startup from all but the first matching run.
* Good, because every reuse is guarded: key match, liveness, no sessions.
* Bad, because it's another lifecycle to reason about, though only when
  enabled.

### Option 2: on by default

* Good, because every multi-run host would benefit without configuration.
* Bad, because the CLI, the main entry point, can't benefit, so default users
  would take the lifecycle risk for nothing.
* Bad, because a process would hold idle servers after `runTests` returned,
  which embedders don't expect today.

### Option 3: pre-create the next session

Ruled out by the session driver above: a session created ahead of time and
handed to a later test is a reused session. The points below are why that
rule is right here.

* Good, because Firefox session creation, about 2.3 seconds, is larger than
  server startup.
* Bad, because a session's capabilities depend on the context: browser,
  headless, viewport, recording, download directory, and the fallback engine
  chosen after a failed start. A speculative session would often be wrong.
* Bad, because each context's fresh session is the isolation boundary for
  cookies and storage. A pre-created session would run beside the current
  context. That contends for the display that recordings serialize on.

### Option 4: keep today's behavior

* Good, because nothing changes.
* Bad, because multi-run hosts keep paying startup on every run.
