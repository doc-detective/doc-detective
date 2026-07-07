---
status: accepted
date: 2026-07-02
decision-makers: doc-detective maintainers
---

# Multiple concurrent browser surfaces (browser surfaces, Phase 4)

## Context and Problem Statement

Phase 3 (ADR 01016) made windows and tabs **in the active browser** addressable through the shared
`surface` reference — one WebDriver session, many W3C handles. But a test still cannot drive two
browsers at once: "log in as the shopper in Chrome while the admin console is open in Firefox",
"verify the same flow in a second, differently-named Chrome profile". Phase 3 deliberately shipped
those shapes as loud FAILs — engine mismatch, browser `name`, and whole-browser `closeSurface` all
report "lands in a later phase".

This phase delivers that later phase, per
[docs/design/multi-surface-targeting.md](../docs/design/multi-surface-targeting.md) Phase 4: the
surface registry holds **several driver sessions keyed by surface name**,
`surface: { browser: <engine>, name? }` (and the bare engine string) opens or selects additional
browsers, and `runOn.browsers` is reinterpreted as "the default/active browser surface + the
cross-browser fan-out matrix". Still only the installed browser drivers — native app surfaces are
Phase 5, the generic `startSurface` provisioner is Phase 6.

## Decision Drivers

* Keep the Phase 3 promise: specs that FAIL today with "lands in a later phase" must start working
  **unchanged** when this phase lands.
* Non-breaking: omitted `surface` stays byte-identical to today; a single-browser test never pays
  for multi-browser machinery.
* One opener, still: additional browsers must be created deliberately by `goTo` (the step that
  navigates), not as a side effect of arbitrary steps — same rule windows/tabs follow.
* Two-level addressing must compose: pick the **session** (browser surface), then the
  **window/tab** inside it, reusing the Phase 3 registry per session without rework.
* Resource sanity under the concurrent-runner scheduler (ADR 01001): extra browsers must not
  starve the fixed Appium port pool or break recording serialization.

## Considered Options

* **A. Context-scoped session registry (`name → { engine, driver }`); `goTo` opens additional
  sessions on the test's already-acquired Appium port; active surface = most recently
  opened/focused** (chosen).
* **B. Pre-provision browsers in `runOn`/`context_v3`** — enumerate surfaces in the context so all
  sessions exist before steps run.
* **C. One Appium server (pool port) per additional browser** — each surface acquires its own port
  the way each test does today.

## Decision Outcome

Chosen option: **A**. Option **B** is explicitly rejected by the multi-surface design ("`surface`
is orthogonal to `runOn`; provisioning stays in steps") — it would conflate the environment matrix
with per-test topology and require a `runOn` shape change. Option **C** multiplies Appium server
processes and drains the fixed port pool that concurrent runners share (`createAppiumPool`), for no
isolation benefit: Appium 2+ hosts concurrent sessions on one server, and the sessions already
share a display.

Mechanism:

1. **Schema: no shape change.** Phase 3 already shipped the browser branch
   `{ browser, name?, window?, tab? }` and the bare-string forms; the gates were runtime-only.
   Phase 4 updates descriptions (drop "later phase" language) and adds validate-test coverage
   pinning the multi-browser shapes, but adds no new fields. `closeSurface: "<engine>"` and
   `{ browser: <engine> }` (no window/tab selector) — already valid — now mean "close that whole
   browser".
2. **Session registry.** Context-scoped `browserSurfaces: name → { engine, driver }` plus an
   **active-surface** pointer — the run-scoped generalization of `processRegistry`, living beside
   the context driver (not on `driver.state`, which is per-session and dies with its session). The
   context's default browser registers at session start under its **engine name** (design: "the
   default browser surface auto-names to its engine"), so it resolves like any named surface. Each
   session keeps its own Phase 3 `driver.state.surfaces` window/tab registry; resolution is
   two-level — session first, then window/tab within it.
3. **Resolution.** A browser surface reference resolves by `name` when given, else by engine name.
   Bare engine string ≡ `{ browser: <engine> }` ≡ surface named `<engine>`. A reference that
   resolves picks that session; steps then run against **that session's driver** (every wired step
   resolves the driver from the surface before Phase 3 window/tab resolution). A step that names a
   surface leaves it **active** (active = most recently opened or focused, now across sessions);
   surface-less steps act on the active surface. Naming an existing surface with a **different
   engine** than it was opened with FAILs (identity is the name; the engine is checked, not a
   selector).
4. **Opening.** `goTo` is the **only** opener of browser sessions (as it is for windows/tabs). A
   `goTo` whose browser surface doesn't resolve provisions a new session: same capability path the
   context driver uses (`buildCaps`), same headless-ness as the context, attached to the test's
   already-acquired Appium port — then navigates it. Any **other** step naming an unopened browser
   surface FAILs with guidance to open it with `goTo` first. Engines whose driver/browser is not
   installed FAIL at open with the existing detection messaging; `runOn` gating remains the skip
   path.
5. **Closing.** `closeSurface` with a whole-browser reference (bare name/engine, or object with no
   `window`/`tab`) ends that session (`deleteSession`) and deregisters it; the active surface
   falls back to the most recently focused remaining browser. Closing a surface that doesn't
   resolve stays an idempotent PASS no-op (Phase 1 semantics). Closing the **last** open browser is
   now allowed — whole-browser close ends the session cleanly, unlike Phase 3's last-*tab* refusal,
   which remains for `{ browser, tab }` closes within a live session (its message now points at
   whole-browser close instead of "later phase"). Teardown sweeps the registry and skips
   already-closed sessions.
6. **Recording and scheduling unchanged.** Recordings stay serialized on the display mutex
   (ADR 01001); a recording binds to the surface it targeted, and the recorder tab stays
   `internal` inside that one session. Extra sessions ride the test's Appium port, so the port
   pool sizing for concurrent runners is unaffected.
7. **`runOn.browsers` reinterpretation (docs-only).** `browsers` keeps working as the default
   surface + fan-out matrix. The caveat is documented, not enforced: a test that pins
   `surface: { browser: "firefox" }` should pin a single `browsers` entry rather than fan out
   (fanning out would open firefox alongside every matrix engine).

## Consequences

* **Good** — docs can test flows that span browsers (multi-role, cross-engine hand-offs) with the
  vocabulary Phase 3 already taught; Phase 3 specs that FAILed with "later phase" start passing
  unchanged, which was the explicit forward-compatibility contract.
* **Good** — non-breaking and pay-for-what-you-use: no schema shape change, no new step types, and
  a spec that never names a second browser exercises exactly the Phase 3 code paths.
* **Good** — resource-neutral under concurrency: no extra Appium servers or pool ports; the
  scheduler's display mutex and recording serialization are untouched.
* **Trade-off (real browsers are heavy)** — each named browser is a full session on one display;
  authors pay startup latency per surface and share screen real estate. Acceptable: opening is
  explicit and per-test.
* **Trade-off (safaridriver)** — Safari allows one session per safaridriver instance, so
  multi-browser combinations *including a second Safari* are platform-limited; fixtures gate with
  `runOn` and the docs note it.
* **Trade-off (engine availability is runtime-checked)** — a `goTo` that opens a missing engine
  FAILs rather than SKIPs; clean skipping needs `runOn` gating (the `requires` gate arrives in
  Phase 5).
* **Neutral** — the active-surface pointer moves from "implicit: the one driver" to explicit
  context state; step code reads the same after the driver-resolution seam is in place.

## Confirmation

* Schema (`src/common/test/validate.test.js`): positives pinning the multi-browser shapes on every
  wired step (bare engine, `{browser}`, `{browser, name}`, whole-browser `closeSurface` forms);
  negatives unchanged (bad engines, process branches on browser-only steps).
* Unit (stub drivers, `test/browserSurface.test.js` + a multi-session suite): registry
  open/select/close by name and engine, default-surface registration under the engine name,
  active-surface tracking across sessions, engine-conflict FAIL, unopened-surface FAIL on
  non-goTo steps, whole-browser close + focus fallback, idempotent close of missing surfaces,
  teardown sweep skipping closed sessions.
* End-to-end: `test/core-artifacts/multi-browser.spec.json` exercises every permutation through
  the real runner (`runOn`-gated to platforms with two engines installed; PASS/SKIPPED only).
  The Phase 3 focused `it`s in `test/core-core.test.js` that asserted engine-mismatch /
  `name` / bare-engine-close FAILs flip to asserting the working behavior (searching all
  contexts, not `contexts[0]`).
