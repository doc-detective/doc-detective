---
status: accepted
date: 2026-07-02
decision-makers: doc-detective maintainers
---

# Multiple concurrent browser surfaces (browser surfaces, Phase 4)

## Context and Problem Statement

Phase 3 (ADR 01016) made windows and tabs **in the active browser** addressable through the shared
`surface` reference, with one WebDriver session and many W3C handles. But a test still cannot drive
two browsers at once. Consider "log in as the shopper in Chrome while the admin console is open in
Firefox". Or "verify the same flow in a second, differently-named Chrome profile". Phase 3
deliberately shipped those shapes as loud FAILs. An engine mismatch, a browser `name`, and a
whole-browser `closeSurface` all report "lands in a later phase".

This phase delivers that later phase, per Phase 4 of
[docs/design/multi-surface-targeting.md](../docs/design/multi-surface-targeting.md). The
surface registry holds **several driver sessions keyed by surface name**.
`surface: { browser: <engine>, name? }`, and the bare engine string, opens or selects additional
browsers. And `runOn.browsers` is reinterpreted as the default and active browser surface, plus the
cross-browser fan-out matrix. It still covers only the installed browser drivers. Native app
surfaces are Phase 5, and the generic `startSurface` provisioner is Phase 6.

## Decision Drivers

* Keep the Phase 3 promise: specs that FAIL today with "lands in a later phase" must start working
  **unchanged** when this phase lands.
* Non-breaking: omitted `surface` stays byte-identical to today; a single-browser test never pays
  for multi-browser machinery.
* One opener, still. Additional browsers must be created deliberately by `goTo`, the step that
  navigates, rather than as a side effect of arbitrary steps. That's the same rule windows and tabs
  follow.
* Two-level addressing must compose: pick the **session** (browser surface), then the
  **window/tab** inside it, reusing the Phase 3 registry per session without rework.
* Resource sanity under the concurrent-runner scheduler (ADR 01001): extra browsers must not
  starve the fixed Appium port pool or break recording serialization.

## Considered Options

* **A. Context-scoped session registry (`name → { engine, driver }`); `goTo` opens additional
  sessions on the test's already-acquired Appium port; active surface = most recently
  opened/focused** (chosen).
* **B. Pre-provision browsers in `runOn` or `context_v3`.** Enumerate surfaces in the context, so
  all sessions exist before steps run.
* **C. One Appium server, meaning one pool port, per additional browser.** Each surface acquires its
  own port the way each test does today.

## Decision Outcome

Chosen option: **A**. Option **B** is explicitly rejected by the multi-surface design, which says
"`surface` is orthogonal to `runOn`; provisioning stays in steps". It would conflate the environment
matrix with per-test topology, and require a `runOn` shape change. Option **C** multiplies Appium
server processes, and drains the fixed port pool that concurrent runners share through
`createAppiumPool`. There's no isolation benefit. Appium 2+ hosts concurrent sessions on one server,
and the sessions already share a display.

Mechanism:

1. **Schema: no shape change.** Phase 3 already shipped the browser branch
   `{ browser, name?, window?, tab? }` and the bare-string forms; the gates were runtime-only.
   Phase 4 updates descriptions (drop "later phase" language) and adds validate-test coverage
   pinning the multi-browser shapes, but adds no new fields. `closeSurface: "<engine>"` and
   `{ browser: <engine> }`, with no window or tab selector, were already valid. They now mean
   "close that whole browser".
2. **Session registry.** It's a context-scoped `browserSurfaces: name → { engine, driver }`, plus an
   **active-surface** pointer. That's the run-scoped generalization of `processRegistry`. It lives
   beside the context driver, rather than on `driver.state`, which is per-session and dies with its
   session. The context's default browser registers at session start under its **engine name**, so
   it resolves like any named surface. The design says "the default browser surface auto-names to
   its engine". Each session keeps its own Phase 3 `driver.state.surfaces` window and tab registry.
   Resolution is two-level: session first, then window or tab within it.
3. **Resolution.** A browser surface reference resolves by `name` when given, and otherwise by
   engine name. A bare engine string equals `{ browser: <engine> }`, which equals a surface named
   `<engine>`. A reference that resolves picks that session. Steps then run against **that session's
   driver**, since every wired step resolves the driver from the surface before Phase 3 window and
   tab resolution. A step that names a surface leaves it **active**, where active means most
   recently opened or focused, now across sessions. Surface-less steps act on the active surface.
   Naming an existing surface with a **different engine** than it was opened with FAILs. Identity is
   the name, and the engine is checked rather than used as a selector.
4. **Opening.** `goTo` is the **only** opener of browser sessions, as it is for windows and tabs. A
   `goTo` whose browser surface doesn't resolve provisions a new session, then navigates it. It uses
   the same capability path the context driver uses, `buildCaps`, the same headless-ness as the
   context, and the test's already-acquired Appium port. Any **other** step naming an unopened
   browser surface FAILs, with guidance to open it with `goTo` first. Engines whose driver or
   browser is not installed FAIL at open with the existing detection messaging. `runOn` gating
   remains the skip path.
5. **Closing.** `closeSurface` with a whole-browser reference ends that session through
   `deleteSession`, and deregisters it. That reference is a bare name or engine, or an object with
   no `window` or `tab`. The active surface falls back to the most recently focused remaining
   browser. Closing a surface that doesn't resolve stays an idempotent PASS no-op, per the original
   Phase 1 rule. Closing the **last** open browser is now allowed, because whole-browser close ends
   the session cleanly. Phase 3's last-*tab* refusal remains for `{ browser, tab }` closes within a
   live session. Its message now points at whole-browser close instead of "later phase". Teardown
   sweeps the registry, and skips already-closed sessions.
6. **Recording and scheduling unchanged.** Recordings stay serialized on the display mutex, per
   ADR 01001. A recording binds to the surface it targeted, and the recorder tab stays `internal`
   inside that one session. Extra sessions ride the test's Appium port, so the port pool sizing for
   concurrent runners is unaffected.
7. **`runOn.browsers` reinterpretation, docs-only.** `browsers` keeps working as the default
   surface plus the fan-out matrix. The caveat is documented rather than enforced. A test that pins
   `surface: { browser: "firefox" }` should pin a single `browsers` entry rather than fan out.
   Fanning out would open firefox alongside every matrix engine.

## Consequences

* **Good.** Docs can test flows that span browsers, such as multi-role and cross-engine hand-offs,
  with the vocabulary Phase 3 already taught. Phase 3 specs that FAILed with "later phase" start
  passing unchanged, which was the explicit forward-compatibility contract.
* **Good, non-breaking, and pay-for-what-you-use.** There's no schema shape change and no new step
  types. A spec that never names a second browser exercises exactly the Phase 3 code paths.
* **Good, and resource-neutral under concurrency.** There are no extra Appium servers or pool ports.
  The scheduler's display mutex and recording serialization are untouched.
* **Trade-off: real browsers are heavy.** Each named browser is a full session on one display.
  Authors pay startup latency per surface, and share screen real estate. That's acceptable, since
  opening is explicit and per-test.
* **Trade-off: safaridriver.** Safari allows one session per safaridriver instance. So multi-browser
  combinations *including a second Safari* are platform-limited. Fixtures gate with `runOn`, and the
  docs note it.
* **Trade-off: engine availability is runtime-checked.** A `goTo` that opens a missing engine FAILs
  rather than SKIPs. Clean skipping needs `runOn` gating, and the `requires` gate arrives in
  Phase 5.
* **Neutral.** The active-surface pointer moves from an implicit single driver to explicit context
  state. Step code reads the same after the driver-resolution seam is in place.

## Confirmation

* Schema tests in `src/common/test/validate.test.js` add positives pinning the multi-browser shapes
  on every wired step. Those are the bare engine, `{browser}`, `{browser, name}`, and whole-browser
  `closeSurface` forms. Negatives are unchanged, covering bad engines and process branches on
  browser-only steps.
* Unit tests use stub drivers, in `test/browserSurface.test.js` plus a multi-session suite. They
  cover registry open, select, and close by name and engine. They also cover default-surface
  registration under the engine name, and active-surface tracking across sessions. They cover the
  engine-conflict FAIL, and the unopened-surface FAIL on non-goTo steps. And they cover
  whole-browser close with focus fallback, idempotent close of missing surfaces, and the teardown
  sweep skipping closed sessions.
* End-to-end: `test/core-artifacts/multi-browser.spec.json` exercises every permutation through
  the real runner (`runOn`-gated to platforms with two engines installed; PASS/SKIPPED only).
  The Phase 3 focused `it`s in `test/core-core.test.js` that asserted engine-mismatch /
  `name` / bare-engine-close FAILs flip to asserting the working behavior (searching all
  contexts, not `contexts[0]`).
