# Mid-session context retry

**Status:** **implemented** — shipped as [ADR 01082](../../adrs/01082-retries-mid-session-context-retry.md).
**Date:** 2026-07-24
**Owners:** doc-detective maintainers
**Motivation:** the recurring `windows-latest` browser-session-death flake class (recording annotate legs, `getRunner` unit tests, `android-skip` element lookups — all the same root cause). See PRs #675/#677/#678 for the trail.

> Roadmap/design doc (per `CLAUDE.md`: *roadmaps and design → `docs/design/`*). This is the original scope.
>
> **Two things changed between scope and shipped code — the [ADR](../../adrs/01082-retries-mid-session-context-retry.md) is authoritative:**
> 1. **Field name: `retries`** (config + context), not the `contextRetries` this doc first proposed.
> 2. **Retry mechanism: re-invoke, not in-place.** §4 below scopes an *in-place* retry (retain the Appium
>    port, re-provision the session inside `runContext`). The implementation instead **re-invokes
>    `runContext`** (`runContextWithRetries` at the two job sites), which reuses the full
>    setup/teardown/recording path at far lower risk than surgery inside the 1300-line `runContext`. The
>    trade-off: the pool port is released and re-acquired between attempts (safe under concurrency —
>    progress guaranteed) instead of held. The mid-run **detection** (active session-health probe) and the
>    **state reset** (snapshot/restore `openApi`/`browser`) are as scoped. §4–§5 preserve the in-place
>    reasoning for the record; read them as *considered*, and the ADR as *shipped*.

## 1. Problem

On constrained CI runners (notably `windows-latest`), a browser session/context intermittently **dies
mid-run**: an early step (`goTo`) passes — "Opened URL and all wait conditions met" — and then a later
step fails because the session/DOM is no longer live. Observed symptoms, all the *same* root cause:

- A `find` for a **static** element times out after a full **20 s** (recording `annotate-all-blur-redaction`, PR #677's guard still failing).
- `getTitle()` returns empty + `ECONNREFUSED` on teardown (`getRunner` unit test, PR #678).
- "No elements matched selector or text" on `android-skip`'s `one-page-four-targets`.

Two mitigations already shipped, and neither fixes the class:

- **Fixture-level `find` guards + 20 s timeouts** (#677) — can't help a *dead* context; no timeout finds an element in a dead DOM.
- **Mocha `this.retries(2)`** (#678) — heals the *unit test*, but fixtures don't run under mocha (they run via the GitHub Action + the results gate), and it does nothing for real users.

**The only fix that eliminates the class** — for CI fixtures *and* real users — is to make the runner
**detect a dead session mid-run and retry the whole context on a fresh session.** `driverStart` already
retries session *creation* (4 attempts, ADR 01039); this extends that resilience past the first step.

## 2. Goals / non-goals

**Goals**
- Detect that a context's session died mid-run (vs. a legitimate assertion failure) — across **all**
  session types: browser (chrome/firefox/webkit) **and** app/native + mobile (Appium) sessions.
- Re-provision a fresh session and re-run the context's steps from the start, bounded and pool-safe.
- **Default-on** (`retries: 1`) — this is resilience, not a feature toggle; configurable/disable-able.
- Never mask a *deterministic* failure — a real bug must still FAIL after retries are exhausted.

**Non-goals (v1)**
- Retrying individual *steps* on the same session — that's the existing per-step `retry` routing, a
  different mechanism (see the naming note in §6).
- Fixing the underlying Chrome/runner instability — that's infra; we make the runner tolerant of it.

## 3. The hard part: detecting a dead session

**Session errors do not throw out of a step.** Step handlers catch driver errors and return a `FAIL`
step result (`tests/goTo.ts:450-455` wraps `driver.url()`; `tests/findElement.ts` has ~15 `status:"FAIL"`
exits). So at the result level, **a dead session and a legitimate "element not found" are identical** —
both `result: "FAIL"`. The only in-band discriminator is the `resultDescription` string, and that is
**insufficient**:

- `isRetryableSessionError` (`utils.ts:818`) matches `ECONNREFUSED|ECONNRESET|socket hang up|…|session not created`, but **not** `invalid session id`, and
- the headline symptom — a `find` timing out on a dead DOM — produces `"Element not found within timeout"` with **no session-error substring at all**. String-matching would miss exactly the case we're chasing.

**Decision: an active health-probe on failure.** When a step returns `FAIL`, before accepting it, probe
the session's liveness with a cheap, **session-scoped** round-trip — one that hits the *session*, so it
throws when the session is gone. **Not** `driver.status()`: that queries the Appium *server*'s `/status`
endpoint and succeeds even when the session behind it is dead (false negative). Because a probe must work
for browser **and** app/mobile (Appium) sessions and `getWindowHandles()`/`getUrl()` are
browser/webview-oriented (they can throw on a *live* native session — a false positive), use a
session-scoped command that exists across driver types — `driver.getPageSource()` is a good driver-agnostic
choice (valid for browser, webview, and native app):

- Probe **throws a session error** (`ECONNREFUSED` / `invalid session id` / socket hang up) → the session is **dead** → this FAIL is spurious → eligible for context retry.
- Probe **succeeds** → the session is alive → the FAIL is **real** (genuine assertion failure) → do **not** retry; it stands.

This cleanly separates "the browser died" from "the test legitimately failed," which pure string-matching
cannot. It matches the observed trail: `goTo` passed (session alive then), the session died before `find`,
so a post-`find`-failure probe would catch the death. Widen `isRetryableSessionError` to also cover
`invalid session id`, and reuse it to classify the *probe's* thrown error.

**Cost:** one extra driver round-trip only on the *failure* path (never on green steps) — negligible.

*Open v2 consideration:* a session that is alive but on a blank/crashed page (probe succeeds, DOM empty).
Rare, and ambiguous with a real failure; v1 treats it as a real FAIL. A later refinement could also assert
the current URL matches the last `goTo` target.

## 4. Retry mechanism — in-place, pool-safe (considered; shipped as re-invoke)

> **Shipped differently.** Per the status note above, the implementation re-invokes `runContext`
> (`runContextWithRetries`) rather than the in-place wrapper this section scopes. The in-place reasoning is
> kept below for the record; the [ADR](../../adrs/01082-retries-mid-session-context-retry.md) describes
> what shipped.

The clean hook is a **retry wrapper inside `runContext`** (`tests.ts:3744`) around the step loop
(`4641-4956`). This is deliberately *not* a job re-queue:

> A context holds exactly one Appium port from `appiumPool.acquire()` (`4263`) until
> `appiumPool.release()` in the `finally` (`5040`). Retrying **in place** — before that `finally` runs —
> reuses the already-acquired port and the already-running (long-lived, shared) Appium server, so it is
> safe under `runResourceAware`/`createAppiumPool` with **no re-acquire and no pool starvation**.
> Re-queuing the job would re-contend on ports and exclusive resources (`display`, `native-app-driver`) —
> rejected.

On a confirmed dead-session FAIL within budget:

1. **Partial teardown** (a new path, distinct from the terminal `finally`): `stopAllRecordings(driver)`
   (`5088`, tolerate throw since the session is dead) → discard the failed attempt's partial recording
   artifacts (per-context `browserDownloadDir(contextId)`, `4281`) → tear down **only this context's
   session**: `driver.deleteSession()` for a browser, or `teardownAppSession(...)` (`5020`) for an
   app/mobile session. **Keep** `appiumPort`, the shared/long-lived Appium server, the pool port, **and**
   any exclusive resource the context holds for its duration (`native-app-driver`, `android-emulator`,
   `display`) — the retry reuses them in place.
2. **Reset context state** (see §5).
3. **Re-provision on the same port**, by session type:
   - **Browser**: `driverStart(buildCaps(...), appiumPort, …)` (the exact call at `4330`), reusing the
     running Appium server.
   - **App/mobile**: re-run the context's session **preflight** (`3894`/`3912`/`3963`) against the same
     Appium server / held device resource. This is heavier than a browser re-`driverStart` (it may rebuild
     the app-driver session), which is why app/mobile retry must reuse the held `native-app-driver` /
     `android-emulator` resource rather than re-acquire it.
4. **Restart the step loop at index 0.** Because `before`/`after` steps are already inlined into
   `context.steps` at detection time (`detectTests.ts:623-669`), a from-scratch re-run **re-runs setup and
   cleanup on the fresh session** — the desired semantics (setup re-establishes state on the new browser).
   `beforeAny`/`afterAll` are whole-spec phases and correctly do **not** re-run for a single context.
5. The existing `finally` (`4974-5042`) remains the **terminal** cleanup (final recordings stop, session
   sweep, app teardown, **pool release**) — unchanged.

If retries are exhausted, the **last** attempt's FAIL stands, annotated so the report says *why* (e.g.
`resultDescription` suffixed "(session died and could not be recovered after N retries)") so a genuine
red is never silently swallowed.

## 5. State that must be reset per retry

`runContext` mutates the shared `context` in place, so an in-place retry must reset what a fresh
`runContext` call would get for free:

| State | Location | Reset action |
|---|---|---|
| `driver.state` (`url/x/y/recordings`) | set in `driverStart:5696` | auto-fresh (new driver); drain dead driver's `recordings` first |
| `context.browser` (narrowed by headless/engine fallback at `4436/4448`) | mutated in place | **snapshot before attempt 1, restore before each retry** so the retry re-tries the originally-requested engine (or intentionally keep the fallback — decide) |
| `contextReport.steps` / `result` / `fallback` / `warnings` | rebuilt per `runContext` call | reset to `[]` / cleared in the in-place loop |
| `context.openApi` (appended `3805`) | in place | guard against **double-append** on retry |
| `env[key]` from `step.variables` (`5498`), saved cookies, screenshots/artifacts | global / filesystem | overwrite-latest-wins already (comment `4855-4857`); acceptable, but note partial side effects from the failed attempt persist |

## 6. Config / schema surface

Mirror `browserFallback` (the natural sibling — both are session-resilience policies):

- **New field `retries`** (integer, `minimum: 0`), at **config level** (`config_v3.schema.json`, beside
  `browserFallback:513`) **and context level** (`context_v3.schema.json:60`, a `runOn` entry can
  override), resolved by a new `resolveRetryPolicy(context, config)` next to
  `resolveBrowserFallbackPolicy` (`tests.ts:1115`).
- **Default:** `1` (**decided**). A mid-run session death is rare; one clean re-run on a fresh session
  reclaims the vast majority of these flakes at negligible green-path cost. `0` disables it (exactly
  today's behavior).
- This is **not** the CLI-flag pattern's typical case (it's a resilience default, not a user action), but
  a `--retries` flag can be added later via the standard `buildYargs`/`setConfig` wiring if wanted.
- **Naming note — `retries` vs the existing step-level `retry` routing.** `resolveStepRouting`
  (`4805-4846`) already implements a per-step `retry` route that re-runs **one step on the same session**.
  This new **`retries`** re-runs **the whole context on a fresh session**. They operate at different
  levels (step route vs context/config policy) and compose — a step can `retry` in place, and if the
  session then dies, the context `retries`. The doc/schema `description` must state this distinction
  explicitly so `config.retries` isn't mistaken for a step-retry count.

## 7. Bounds & safety

- **Only** retry when the health-probe confirms a dead session **and** the classifier
  (`isRetryableSessionError`, widened for `invalid session id`) matches the probe error. A live-session
  FAIL never retries — deterministic bugs fail all attempts and surface normally.
- Bounded by `retries` (default 1). Linear backoff between attempts (mirror `driverStart`'s
  `500*attempt`).
- Cap total wall-clock: each attempt re-runs the whole context; with `this.timeout` semantics gone (this
  is the runner, not mocha), guard against a pathological context that dies every attempt by respecting
  the retry count strictly.
- **Recording integrity:** never keep a half-written `.webm` from a dead attempt; discard before re-run.

## 8. Interactions checklist (from the control-flow map)

- **Recording** (`driver.state.recordings` LIFO, `stopAllRecordings:5088`, autoRecord synthetic step
  `prepareContextSlot:3504`): stop/discard the failed attempt's recordings **before** `deleteSession`
  (capture/ffmpeg leaks otherwise — comment `4975-4980`); the retained `record` step in `context.steps`
  re-records cleanly on the fresh session.
- **Concurrency / Appium pool** (`createAppiumPool:utils.ts:78`): in-place retry reuses the acquired port
  — safe. Do not re-queue.
- **Cleanup ordering**: partial teardown = recordings-stop + `deleteSession` **only**; keep server + port;
  the terminal `finally` still owns app teardown + pool release.
- **Setup/cleanup** (`_fromBefore`/`_fromAfter`, `detectTests.ts:623-669`): inlined into `context.steps`,
  so restart-at-0 re-runs them — desired. `_fromAfter` hard-routing (`4701`) is unaffected.
- **Warm-phase / combination memo** (`warmUpResults:299`): a context retry must **not** poison the
  combination memo (a mid-run death ≠ a can't-start-at-all combination), or later contexts would wrongly
  skip the engine.

## 9. Decisions

**Decided:**

1. **Field name & default** — the knob is **`retries`**, default **`1`** (resilience-on; `0` disables).
2. **Scope** — **browser *and* app/mobile** sessions in v1 (driver-agnostic probe + per-type re-provision).
3. **Detection** — active health-probe on failure (§3), session-scoped and driver-agnostic
   (`getPageSource`, **not** the server-level `status`), plus a widened `isRetryableSessionError`.

**Recommended, confirm at implementation:**

4. **Engine on retry** — restore the originally-requested browser (so a retry re-tries the intended engine)
   vs keep any headless/engine fallback the failed attempt landed on. *Rec.: restore.*
5. **Live-but-blank page** — treat as a real FAIL in v1 (probe succeeds → no retry) vs also assert the URL
   matches the last `goTo`. *Rec.: real FAIL in v1; revisit if it shows up.*

## 10. Implementation plan (ordered, red→green per step)

1. **Widen `isRetryableSessionError`** (`utils.ts:818`) to include `invalid session id`; unit test the new match.
2. **Session health-probe helper** — a pure-ish `async function isSessionAlive(driver)` returning
   `false` on a classified session error, `true` otherwise; unit test with a stub driver whose probe
   throws `invalid session id` / `ECONNREFUSED` vs resolves.
3. **`resolveRetryPolicy(context, config)`** next to `resolveBrowserFallbackPolicy`; new `retries` field
   in `config_v3` + `context_v3` (+ `npm run build:common`, positive/negative `validate.test.js` cases).
   Schema `description` must distinguish it from step-level `retry` (§6).
4. **Partial-teardown helper** — extract the recordings-stop + session-only teardown from the `finally`
   into a reusable `teardownSessionOnly(driver, context)` (`deleteSession` for browser,
   `teardownAppSession` for app/mobile) that leaves the Appium server, pool port, and held exclusive
   resources intact.
5. **Retry wrapper in `runContext`** — snapshot `context.browser`/report; wrap the step loop; on
   loop-completion-with-retryable-FAIL (probe-confirmed dead) and within budget: partial teardown → reset
   state → re-provision on the same port (browser `driverStart` / app-mobile preflight) → restart loop.
   Annotate the terminal FAIL on exhaustion.
6. **Focused unit test** in `test/core-core.test.js` — inject a driver that dies after step 1 (probe
   throws), assert the context retries and PASSes on the second attempt; and a control where the FAIL is a
   live-session assertion failure, asserting it does **not** retry.
7. **Feature fixtures** — this is a resilience path; a deterministic fixture can't easily kill a live
   session, so the precise assertions live in the focused `it(...)` (per `CLAUDE.md`'s documented
   exception, like exit-on-fail). Add a normal PASS fixture that exercises the default `retries:1`
   config path to prove it's a no-op on green runs.
8. **ADR** (MADR) recording the detection strategy, the in-place-retry decision, the default, and the
   "never mask deterministic failures" guarantee.
9. **Docs** — a resilience note under `docs/ci/` (Priya) and the generated `config_v3` reference (via
   schema `description`).

## 11. Risk & rollback

- **Risk:** a subtle death-detector false-positive retries a genuinely-failing test, hiding a real bug.
  Mitigated by the *active probe* (only retry when the session is provably dead) and by capping retries.
- **Risk:** recording artifact corruption on retry — mitigated by discard-before-retry.
- **Rollback:** `retries: 0` restores exactly today's behavior; the whole path is gated behind a
  resolved policy, so disabling it is a one-line config.
