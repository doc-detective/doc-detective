# Mid-session context retry

**Status:** **implemented**, shipped as [ADR 01082](../../adrs/01082-retries-mid-session-context-retry.md).
**Date:** 2026-07-24
**Owners:** doc-detective maintainers
**Motivation:** the recurring `windows-latest` browser-session-death flake class. That covers the recording annotate legs, the `getRunner` unit tests, and the `android-skip` element lookups, all one root cause. See PRs #675, #677, and #678 for the trail.

> Roadmap/design doc (per `CLAUDE.md`: *roadmaps and design → `docs/design/`*). This is the original scope.
>
> **Two things changed between scope and shipped code. The [ADR](../../adrs/01082-retries-mid-session-context-retry.md) is authoritative:**
> 1. **The field name is `retries`**, on both config and context, not the `contextRetries` this doc
>    first proposed.
> 2. **The retry mechanism re-invokes rather than working in place.** §4 below scopes an *in-place*
>    retry, retaining the Appium port and re-provisioning the session inside `runContext`. The
>    implementation instead **re-invokes `runContext`**, through `runContextWithRetries` at the two
>    job sites. That reuses the full setup, teardown, and recording path, at far lower risk than
>    surgery inside the 1300-line `runContext`. The trade-off is that the pool port is released and
>    re-acquired between attempts rather than held. That's safe under concurrency, and progress is
>    guaranteed. The mid-run **detection**, an active session-health probe, and the **state reset**,
>    a snapshot and restore of `openApi` and `browser`, are as scoped. §4 and §5 preserve the
>    in-place reasoning for the record. Read them as *considered*, and the ADR as *shipped*.

## 1. Problem

On constrained CI runners, notably `windows-latest`, a browser session or context intermittently
**dies mid-run**. An early `goTo` step passes, reporting "Opened URL and all wait conditions met".
A later step then fails, because the session or DOM is no longer live. The observed symptoms all
share the *same* root cause:

- A `find` for a **static** element times out after a full **20 s** (recording `annotate-all-blur-redaction`, PR #677's guard still failing).
- `getTitle()` returns empty + `ECONNREFUSED` on teardown (`getRunner` unit test, PR #678).
- "No elements matched selector or text" on `android-skip`'s `one-page-four-targets`.

Two mitigations already shipped, and neither fixes the class:

- **Fixture-level `find` guards with 20 s timeouts** (#677) can't help a *dead* context. No timeout finds an element in a dead DOM.
- **Mocha `this.retries(2)`** (#678) heals the *unit test*. Fixtures don't run under mocha, though. They run through the GitHub Action and the results gate, so it does nothing for real users.

**Only one fix eliminates the class**, for CI fixtures *and* real users. Make the runner
**detect a dead session mid-run, and retry the whole context on a fresh session.** `driverStart`
already retries session *creation*, across 4 attempts per ADR 01039. This extends that resilience
past the first step.

## 2. Goals / non-goals

**Goals**
- Detect that a context's session died mid-run, as opposed to a legitimate assertion failure. Do it
  across **all** session types: browser (chrome, firefox, webkit) **and** app, native, and mobile
  Appium sessions.
- Re-provision a fresh session and re-run the context's steps from the start, bounded and pool-safe.
- Be **default-on**, at `retries: 1`. This is resilience, not a feature toggle, and it stays
  configurable and disable-able.
- Never mask a *deterministic* failure. A real bug must still FAIL after retries are exhausted.

**Non-goals (v1)**
- Retrying individual *steps* on the same session. That's the existing per-step `retry` routing, a
  different mechanism. See the naming note in §6.
- Fixing the underlying Chrome and runner instability. That's infra. We make the runner tolerant of
  it instead.

## 3. The hard part: detecting a dead session

**Session errors do not throw out of a step.** Step handlers catch driver errors and return a `FAIL`
step result (`tests/goTo.ts:450-455` wraps `driver.url()`; `tests/findElement.ts` has ~15 `status:"FAIL"`
exits). At the result level, **a dead session and a legitimate "element not found" are identical**.
Both give `result: "FAIL"`. The only in-band discriminator is the `resultDescription` string, and
that is **insufficient**:

- `isRetryableSessionError` (`utils.ts:818`) matches `ECONNREFUSED|ECONNRESET|socket hang up|…|session not created`, but **not** `invalid session id`, and
- The headline symptom is a `find` timing out on a dead DOM. It produces `"Element not found within timeout"`, with **no session-error substring at all**. String-matching would miss exactly the case we're chasing.

**Decision: an active health-probe on failure.** When a step returns `FAIL`, probe the session's
liveness before accepting it. Use a cheap, **session-scoped** round-trip, one that hits the
*session*, so it throws when the session is gone. **Not** `driver.status()`. That queries the Appium
*server*'s `/status` endpoint, and succeeds even when the session behind it is dead, a false
negative. The probe must work for browser **and** app and mobile Appium sessions.
`getWindowHandles()` and `getUrl()` are browser- and webview-oriented, and can throw on a *live*
native session, a false positive. So use a session-scoped command that exists across driver types.
`driver.getPageSource()` is a good driver-agnostic choice, valid for browser, webview, and native
app:

- The probe **throws a session error**, meaning `ECONNREFUSED`, `invalid session id`, or a socket hang up. The session is **dead**, this FAIL is spurious, and the context is eligible for retry.
- The probe **succeeds**. The session is alive, so the FAIL is **real**, a genuine assertion failure. Do **not** retry, and let it stand.

This cleanly separates "the browser died" from "the test legitimately failed", which pure
string-matching cannot. It matches the observed trail. `goTo` passed, so the session was alive then.
The session died before `find`, so a post-`find`-failure probe would catch the death. Widen
`isRetryableSessionError` to also cover `invalid session id`, and reuse it to classify the *probe's*
thrown error.

**Cost:** one extra driver round-trip, only on the *failure* path and never on green steps. That's
negligible.

**v2, alive but broken page: partially addressed.** A session can respond, so the probe succeeds,
while the browser sits on a crash or error page instead of the page under test. **v2
(`isPageBroken`) covers the unambiguous case.** A browser **error page** is treated as broken and
retried, because a test is never legitimately on one, so there are no false positives. Those pages
are `chrome-error://chromewebdata/` for a renderer crash, and `about:neterror` and `about:certerror`
on Firefox. A URL-match against the last `goTo` was rejected. `driver.state.url` is only maintained
in the annotation-persistence path (`tests.ts:5550`), not per navigation, so it isn't a reliable
"expected URL". One case remains **not yet covered**: a page that blanked *at the same URL*, with
the session alive, the URL unchanged, and the DOM emptied. That's ambiguous with a genuine "element
not on a correctly-loaded page" failure, so v2 still treats it as a real FAIL. A debug diagnostic
logs the page URL of any live, non-error-page FAIL that isn't retried. A recurring flake, such as
the recording `annotate` legs, then reveals which mode it actually is, before a v3 heuristic is
designed.

## 4. Retry mechanism: in-place and pool-safe (considered, shipped as re-invoke)

> **Shipped differently.** Per the status note above, the implementation re-invokes `runContext`
> through `runContextWithRetries`, rather than the in-place wrapper this section scopes. The
> in-place reasoning is kept below for the record. The
> [ADR](../../adrs/01082-retries-mid-session-context-retry.md) describes what shipped.

The clean hook is a **retry wrapper inside `runContext`** (`tests.ts:3744`), around the step loop
at `4641-4956`. This is deliberately *not* a job re-queue:

> A context holds exactly one Appium port from `appiumPool.acquire()` (`4263`) until
> `appiumPool.release()` in the `finally` (`5040`). Retrying **in place**, before that `finally`
> runs, reuses the already-acquired port and the already-running shared Appium server. That's safe
> under `runResourceAware` and `createAppiumPool`, with **no re-acquire and no pool starvation**.
> Re-queuing the job would re-contend on ports and exclusive resources such as `display` and
> `native-app-driver`, so it was rejected.

On a confirmed dead-session FAIL within budget:

1. **Partial teardown**, a new path distinct from the terminal `finally`. Call
   `stopAllRecordings(driver)` (`5088`), tolerating a throw since the session is dead. Then discard
   the failed attempt's partial recording artifacts, in the per-context
   `browserDownloadDir(contextId)` (`4281`). Then tear down **only this context's session**, with
   `driver.deleteSession()` for a browser, or `teardownAppSession(...)` (`5020`) for an
   app/mobile session. **Keep** `appiumPort`, the shared long-lived Appium server, and the pool port.
   **Also keep** any exclusive resource the context holds for its duration, such as
   `native-app-driver`, `android-emulator`, and `display`. The retry reuses them in place.
2. **Reset context state** (see §5).
3. **Re-provision on the same port**, by session type:
   - **Browser**: `driverStart(buildCaps(...), appiumPort, …)` (the exact call at `4330`), reusing the
     running Appium server.
   - **App and mobile**: re-run the context's session **preflight** (`3894`, `3912`, `3963`) against
     the same Appium server and held device resource. This is heavier than a browser re-`driverStart`,
     since it may rebuild the app-driver session. That's why an app or mobile retry must reuse the held
     `native-app-driver` or `android-emulator` resource, rather than re-acquiring it.
4. **Restart the step loop at index 0.** `before` and `after` steps are already inlined into
   `context.steps` at detection time (`detectTests.ts:623-669`). A from-scratch re-run therefore
   **re-runs setup and cleanup on the fresh session**. That's the desired semantics, since setup
   re-establishes state on the new browser. `beforeAny` and `afterAll` are whole-spec phases, and
   correctly do **not** re-run for a single context.
5. The existing `finally` (`4974-5042`) remains the **terminal** cleanup, unchanged. It stops final
   recordings, sweeps the session, tears down the app, and does the **pool release**.

If retries are exhausted, the **last** attempt's FAIL stands, so a genuine red is never silently
swallowed. As shipped, `runContextWithRetries` records the count on the returned report, setting
`contextReport.retries = N` when any retry ran. That's visible on both a recovered PASS and an
exhausted FAIL. It also logs a `warning` per attempt, and does not rewrite `resultDescription`.

## 5. State that must be reset per retry

`runContext` mutates the shared `context` in place, so an in-place retry must reset what a fresh
`runContext` call would get for free:

| State | Location | Reset action |
|---|---|---|
| `driver.state` (`url/x/y/recordings`) | set in `driverStart:5696` | auto-fresh (new driver); drain dead driver's `recordings` first |
| `context.browser`, narrowed by the headless and engine fallback at `4436` and `4448` | mutated in place | **Snapshot before attempt 1, restore before each retry.** The retry then re-tries the originally-requested engine. Alternatively, deliberately keep the fallback. Decide which |
| `contextReport.steps` / `result` / `fallback` / `warnings` | rebuilt per `runContext` call | reset to `[]` / cleared in the in-place loop |
| `context.openApi` (appended `3805`) | in place | guard against **double-append** on retry |
| `env[key]` from `step.variables` (`5498`), saved cookies, and screenshot artifacts | global and filesystem | Already overwrite-latest-wins, per the comment at `4855-4857`. That's acceptable, but note that partial side effects from the failed attempt persist |

## 6. Config and schema surface

Mirror `browserFallback`, the natural sibling, since both are session-resilience policies:

- **New field `retries`**, an integer with `minimum: 0`. It sits at **config level** in
  `config_v3.schema.json`, beside `browserFallback:513`, **and at context level** in
  `context_v3.schema.json:60`, where a `runOn` entry can override it. A new
  `resolveRetryPolicy(context, config)` resolves it, next to `resolveBrowserFallbackPolicy`
  (`tests.ts:1115`).
- **Default:** `1`, **decided**. A mid-run session death is rare. One clean re-run on a fresh session
  reclaims the vast majority of these flakes, at negligible green-path cost. `0` disables it, giving
  exactly today's behavior.
- This is **not** the CLI-flag pattern's typical case, since it's a resilience default rather than a
  user action. A `--retries` flag can still be added later, through the standard `buildYargs` and
  `setConfig` wiring, if wanted.
- **Naming note: `retries` versus the existing step-level `retry` routing.** `resolveStepRouting`
  (`4805-4846`) already implements a per-step `retry` route that re-runs **one step on the same
  session**. This new **`retries`** re-runs **the whole context on a fresh session**. They operate at
  different levels, a step route versus a context and config policy, and they compose. A step can
  `retry` in place, and if the session then dies, the context `retries`. The doc and schema
  `description` must state this distinction explicitly, so `config.retries` isn't mistaken for a
  step-retry count.

## 7. Bounds and safety

- **Only** retry when a step FAILed **and** one of two probe conditions holds. Either the health
  probe throws a classified session-death error, through `isSessionAlive` into
  `isRetryableSessionError`, widened for `invalid session id`. **Or** `isPageBroken` finds the live
  session on a known browser error page: `chrome-error://`, `about:neterror`, or `about:certerror`. A live-session FAIL matching **neither**
  never retries. Deterministic bugs fail all attempts and surface normally.
- It's bounded by `retries`, defaulting to 1. Use linear backoff between attempts, mirroring
  `driverStart`'s `500*attempt`.
- Cap total wall-clock, since each attempt re-runs the whole context. `this.timeout` semantics are
  gone here, because this is the runner rather than mocha. Guard against a pathological context that
  dies every attempt by respecting the retry count strictly.
- **Recording integrity:** never keep a half-written `.webm` from a dead attempt; discard before re-run.

## 8. Interactions checklist (from the control-flow map)

- **Recording**, covering `driver.state.recordings` LIFO, `stopAllRecordings:5088`, and the autoRecord
  synthetic step at `prepareContextSlot:3504`. Stop and discard the failed attempt's recordings
  **before** `deleteSession`, or capture and ffmpeg leak, per the comment at `4975-4980`. The
  retained `record` step in `context.steps` re-records cleanly on the fresh session.
- **Concurrency and the Appium pool** (`createAppiumPool:utils.ts:78`). An in-place retry reuses the
  acquired port, which is safe. Do not re-queue.
- **Cleanup ordering.** Partial teardown means a recordings-stop plus `deleteSession` **only**. Keep
  the server and port. The terminal `finally` still owns app teardown and pool release.
- **Setup and cleanup**, meaning `_fromBefore` and `_fromAfter` at `detectTests.ts:623-669`. They're
  inlined into `context.steps`, so restart-at-0 re-runs them, which is desired. `_fromAfter`
  hard-routing (`4701`) is unaffected.
- **Warm phase and the combination memo** (`warmUpResults:299`). A context retry must **not** poison
  the combination memo. A mid-run death is not a can't-start-at-all combination, and confusing the
  two would make later contexts wrongly skip the engine.

## 9. Decisions

**Decided:**

1. **Field name and default.** The knob is **`retries`**, defaulting to **`1`**, so resilience is on.
   `0` disables it.
2. **Scope.** Both **browser *and* app and mobile** sessions in v1, through a driver-agnostic probe
   plus per-type re-provisioning.
3. **Detection.** An active health-probe on failure, per §3. It's session-scoped and
   driver-agnostic, using `getPageSource` rather than the server-level `status`, plus a widened
   `isRetryableSessionError`.

**Recommended, confirm at implementation:**

4. **Engine on retry.** One option restores the originally-requested browser, so a retry re-tries
   the intended engine. The other keeps any headless or engine fallback the failed attempt landed
   on. *Recommendation: restore.*
5. **A live-but-blank page.** One option treats it as a real FAIL in v1, where the probe succeeds so
   there's no retry. The other also asserts the URL matches the last `goTo`. *Recommendation: a real
   FAIL in v1, revisited if it shows up.*

## 10. Implementation plan (ordered, red→green per step)

1. **Widen `isRetryableSessionError`** (`utils.ts:818`) to include `invalid session id`; unit test the new match.
2. **A session health-probe helper.** Write a pure-ish `async function isSessionAlive(driver)`. It
   returns `false` on a classified session error, and `true` otherwise. Unit test it with a stub
   driver whose probe either throws `invalid session id` or `ECONNREFUSED`, or resolves.
3. **`resolveRetryPolicy(context, config)`**, next to `resolveBrowserFallbackPolicy`. Add the new
   `retries` field to `config_v3` and `context_v3`, then run `npm run build:common` and add
   positive and negative `validate.test.js` cases. The schema `description` must distinguish it from
   step-level `retry`, per §6.
4. **A partial-teardown helper.** Extract the recordings-stop and session-only teardown from the
   `finally` into a reusable `teardownSessionOnly(driver, context)`. That's `deleteSession` for a
   browser, and `teardownAppSession` for app and mobile. It must leave the Appium server, pool port,
   and held exclusive resources intact.
5. **A retry wrapper in `runContext`.** Snapshot `context.browser` and the report, then wrap the step
   loop. The retry path fires on loop-completion-with-retryable-FAIL, meaning probe-confirmed dead,
   and within budget. It runs partial teardown → reset state → re-provision on the same port →
   restart the loop. Re-provisioning uses browser `driverStart`, or the app and mobile preflight.
   Annotate the terminal FAIL on exhaustion.
6. **A focused unit test** in `test/core-core.test.js`. Inject a driver that dies after step 1, so
   the probe throws, and assert the context retries and PASSes on the second attempt. Add a control
   where the FAIL is a live-session assertion failure, asserting it does **not** retry.
7. **Feature fixtures.** This is a resilience path, and a deterministic fixture can't easily kill a
   live session. The precise assertions therefore live in the focused `it(...)`, per `CLAUDE.md`'s
   documented exception, as with exit-on-fail. Add a normal PASS fixture that exercises the default
   `retries:1` config path, proving it's a no-op on green runs.
8. **ADR** (MADR) recording the detection strategy, the in-place-retry decision, the default, and the
   "never mask deterministic failures" guarantee.
9. **Docs.** Add a resilience note under `docs/ci/` for Priya, plus the generated `config_v3`
   reference, through the schema `description`.

## 11. Risk & rollback

- **Risk:** a subtle death-detector false-positive retries a genuinely-failing test, hiding a real bug.
  Mitigated by the *active probe* (only retry when the session is provably dead) and by capping retries.
- **Risk:** recording artifact corruption on retry, mitigated by discard-before-retry.
- **Rollback:** `retries: 0` restores exactly today's behavior; the whole path is gated behind a
  resolved policy, so disabling it is a one-line config.
