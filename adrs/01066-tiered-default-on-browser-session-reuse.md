---
status: accepted
date: 2026-07-14
decision-makers: doc-detective maintainers
---

# Default-on browser session reuse, tiered by whether reset is provably complete

## Context and Problem Statement

Today every `(test × context)` job starts a full browser driver session and tears it down at the
end ([tests.ts](../src/core/tests.ts): `driverStart` at the desktop branch, `deleteSession` in the
context `finally`). Each cycle costs ~1–3s. For a spec with N Chromium tests on the same context
signature, that is N full start/teardown cycles — the single largest remaining wall-clock cost in a
small-test-heavy suite (see [docs/design/run-performance.md](../docs/design/run-performance.md),
Phase 5).

The obvious win is to keep the browser alive and reuse it across contexts. The hard part is
**isolation**: a reused session must present the next context with a clean browser, or one test's
cookies / storage / permissions / windows leak into the next — a correctness failure far worse than
the latency it saves. WebDriver's classic `deleteAllCookies` is scoped to the current document's
domain, and closing a window doesn't touch localStorage, IndexedDB, service workers, or granted
permissions. So a naive "clear cookies + reopen" reuse is unsafe.

## Decision Drivers

- **Correctness first.** Reuse must be indistinguishable from a fresh session, or it must not
  happen. State leakage is unacceptable.
- **No new failure modes.** A reset that can't complete must never fail a test that a fresh session
  would have passed.
- **Default-on where safe.** The win only lands if reuse is the default; an opt-in flag would leave
  it unused in practice.
- **Don't disturb the existing driver/port design.** The Appium-server pool and ChromeDriver
  port-contention handling ([ADR 01039](01039-unique-chromedriver-port-per-session.md)) are load
  bearing and must stay intact.

## Considered Options

1. **No reuse (status quo).** Correct, simple, slow.
2. **Universal reuse with a best-effort cookie/storage clear.** Fast, but no engine except Chromium
   has a single verifiable global-state clear, so it would leak on Firefox/Safari.
3. **Tiered reuse: reuse only where a global reset is provably complete; fresh everywhere else.**
   The chosen option.

## Decision Outcome

Chosen option: **3 — tiered, default-on reuse with a fail-closed CDP reset**.

### Tiering

Only the **Chromium family** (`chrome`, `edge`, `chromium`) reuses sessions. Chromium exposes a
single CDP call — `Storage.clearDataForOrigin(origin: "*", storageTypes: "all")` — that clears every
storage class at once (cookies, local/session storage, IndexedDB, WebSQL, service workers, cache
storage), which is what makes a *provably complete* reset possible. Firefox (gecko) has no
CDP-equivalent global clear on modern releases; Safari has no reliable programmatic clear; native
app surfaces are the app instance itself. All of those keep today's fresh-session behavior. The
tier decision lives in `shouldReuseSession()` / `isReusableEngine()`
([src/core/sessionReuse.ts](../src/core/sessionReuse.ts)).

### Reset protocol (order matters)

WebDriver ends the session when its last window closes, so the fresh window opens **first**:

1. `newWindow('about:blank')` → switch to it.
2. Close every other window handle.
3. CDP global clears: `Storage.clearDataForOrigin(*/all)`, `Network.clearBrowserCookies` +
   `clearBrowserCache`, `Browser.resetPermissions`,
   `Emulation.clearDeviceMetricsOverride` + `clearGeolocationOverride`.
4. Reapply the incoming context's viewport, then navigate `about:blank`.

Every step is bounded by a timeout. `resetChromiumSession()` implements this against an injected CDP
executor, so the ordering and the fail-closed behavior are unit-tested without a browser
([test/core-session-reuse.test.js](../test/core-session-reuse.test.js)).

### Fail-closed

If **any** reset step throws or times out, the pooled session is discarded (`deleteSession`) and the
context starts a fresh session. Reuse is only ever an accelerator; it can never turn a passing test
into a failing one. This is the same posture as the warm phase.

### Escape hatch

`browser.freshSession: true` (schema addition, `context_v3`) forces today's cold-per-context
behavior for a Chromium context. It is read **falsy-when-absent**: AJV does not inject the default
under `context_v3`'s `anyOf`, so an omitted value must be treated as "reuse". There is no opt-*in*
flag — reuse is the default.

### Pool mechanics

The reuse pool ([`createSessionPool`](../src/core/sessionReuse.ts)) parks at most one driver **per
Appium-server port**, keyed by the capability signature (`deriveSessionPoolKey`). Keying per port
keeps a parked session bound to the Appium server that started it (the server lives for the whole
run), so the port acquire/release lifecycle is **completely unchanged** — parking only decides
whether the driver on a released port is deleted or kept for the next context that lands on that
port. The signature excludes resettable/cosmetic state (window size, which is never in caps; the
per-attempt chromedriver port; and per-context recording identifiers). A context draws from the pool
only on an **exact signature match**; otherwise it evicts+deletes any stale parked driver and starts
fresh. Run-end teardown is unchanged: the run `finally` drains the pool and `deleteSession`s each
parked driver **before** the Appium servers are killed.

**Recording contexts are excluded from the pool** in both directions. Their per-context
getDisplayMedia capture-source title and download directory are baked into launch arguments a
runtime reset can't reconcile, so a reused session would auto-select the wrong window. This keeps
recording behavior byte-identical.

### Consequences

- Good: a spec with N same-signature Chromium tests pays 1 session start + (N−1) resets
  (~100–300ms) instead of N full cycles.
- Good: correctness is preserved by construction — reuse either resets provably or fails closed to
  fresh.
- Good: the port/driver design and recording path are untouched.
- Bad / accepted: the CDP transport (`POST /session/:id/goog/cdp/execute` proxied through Appium's
  chromium driver) is not universally verified across every Appium/chromedriver combination. This is
  deliberately tolerated: if the route is absent or errors, the reset throws and the context falls
  back to a fresh session (no speedup, no incorrectness). The headed-Chromium leakage fixtures are
  the gate that confirms it works in practice.
- Bad / accepted: reuse hit-rate depends on the next same-signature context landing on the same
  Appium port. At `concurrentRunners: 1` (one port) consecutive same-signature contexts always
  reuse — the primary target case. Under concurrency it is best-effort per port.

### Confirmation

- **Unit** ([test/core-session-reuse.test.js](../test/core-session-reuse.test.js)): tiering, the
  freshSession gate (falsy-when-absent), pool-key derivation (stable, strips recording IDs + chromedriver
  port, distinguishes engine/headless), the per-port pool (take/evict/park/drain), and the reset
  protocol's order + per-step fail-closed (thrown step and timeout both discard).
  Plus a decision-matrix assertion in [test/core-core.test.js](../test/core-core.test.js).
- **Fixtures** (the gate): [test/core-artifacts/sessions/](../test/core-artifacts/sessions/)
  `reuse-leakage.spec.json` (plant → assert-clean across the reuse boundary), `reuse-fresh-session.spec.json`
  (freshSession:true stays cold), `reuse-firefox.spec.json` (Firefox never reuses). They run in the
  `proc-sessions` bundle, which executes on the general fixture matrix — headed Chrome on
  Windows/macOS is where Chromium reuse actually engages; other legs SKIP. Each fixture is
  PASS-or-SKIPPED by construction (a fresh fallback is also clean), so it can only FAIL when a
  *reused* session leaks.

## Pros and Cons of the Options

### Option 1 — No reuse

- Good: simplest; no isolation risk.
- Bad: pays the full per-context session tax that Phase 5 exists to remove.

### Option 2 — Universal best-effort clear

- Good: maximal reuse across all engines.
- Bad: no verifiable global clear on Firefox/Safari → real leakage risk. Rejected on correctness.

### Option 3 — Tiered, fail-closed (chosen)

- Good: reuse exactly where it is provably safe; fresh everywhere else; degrades to fresh on any
  doubt.
- Bad: only Chromium benefits; reuse hit-rate is port-dependent under concurrency; CDP transport is
  unverified across all stacks (mitigated by fail-closed + the fixture gate).
