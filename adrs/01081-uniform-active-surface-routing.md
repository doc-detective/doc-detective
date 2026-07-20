---
status: accepted
date: 2026-07-18
decision-makers: doc-detective maintainers
---

# Surface-less steps act on the active surface, uniformly across surface kinds

## Context and Problem Statement

Before this decision, interaction steps (`find`, `click`, `type`, `screenshot`, `swipe`) reached
the native-app execution branch **only** when the step carried an explicit `surface` reference; a
surface-less step always fell through to the browser path — and failed ungracefully in an app-only
or process-only context. PR #671 (the native/mobile app testing guides) exposed the cost: every
step in an app walkthrough had to repeat `surface: { app: … }`, which review flagged as redundant
noise, and the schema descriptions ("Omit to act on the active surface") already promised behavior
the runtime only delivered for browsers. The browser side has had a real active-surface model since
ADR 01019 (`activeName` in the session registry); the app side tracked `activeApp` but no
interaction step consulted it; processes had no active notion at all.

How should a surface-sensitive step pick its target when `surface` is omitted, and what should an
explicit `surface` reference do beyond routing that one step?

## Decision Drivers

* **One routing rule for every surface kind.** The router must not care whether a surface is a
  browser, an app, or a background process — kind-specific code is *execution*, never *routing*.
* **No passthrough behavior.** A handler must never "fall through" to an implicit browser default;
  every surface-sensitive step resolves to a concrete surface handle (or a clear error) first.
* Match the documented model in
  [docs/design/multi-surface-targeting.md](../docs/design/multi-surface-targeting.md): *"Active
  surface — the most recently opened or focused one. Omitting `surface` acts on it."*
* Non-breaking for pure-browser specs: their only surface is the browser, so routing is
  byte-identical. App/process specs that previously errored now work (strictly additive).
* Classification must follow: an app-only spec whose steps omit `surface` must not provision a
  browser (pool sizing, driver start, runtime dependency inference).

## Considered Options

* **A. Cross-kind MRU tracker + one resolver; explicit `surface` switches the active surface**
  (chosen).
* **B. Kind-priority fallback** — surface-less steps prefer the app session when one exists, else
  the browser (no cross-kind ordering; processes stay explicit-only).
* **C. Keep explicit-only app/process targeting** and merely improve the error messages.

## Decision Outcome

Chosen option: **A**. Option **B** special-cases kinds — exactly the passthrough-shaped design this
decision rejects — and gives wrong answers in mixed specs (a `goTo` after an app open would still
route surface-less steps to the app). Option **C** leaves the documented model unimplemented and
PR #671's guides stuck with per-step `surface` noise.

Mechanism:

1. **One per-context MRU tracker** (`src/core/tests/activeSurface.ts`): a list of
   `{ kind: "browser" | "app" | "process", name }` handles, head = active. It is created once per
   context in `runContext` and shared by the browser session registry (`tracker` field), the app
   session (`tracker` field), and every handler (`surfaceTracker` param through `runStep`).
2. **Activation write-sites, one per kind's existing activation path:** the browser registry's
   `activate()` (covers register, goTo auto-open, `startSurface: { browser }`, and every explicit
   browser reference), `startAppSurface` and `ensureAppForeground` (which now also moves the
   pointer for **desktop** app surfaces — previously its early-return skipped the `activeApp`
   write, so an explicit desktop app reference never became active), and the `startSurface`
   process lane plus a successful process `type`. A process registered as a side effect of
   `runShell`/`runCode` `background:` deliberately does **not** activate — those are shell steps,
   not surface steps, and a dev-server helper must not hijack the active surface.
3. **One resolver, no passthrough:** `resolveTargetSurface({ surface, tracker, driver, appSession,
   processRegistry })` classifies every surface-sensitive step to a concrete
   `app`/`browser`/`process` handle or an error. Explicit object forms are authoritative by key;
   bare strings resolve engine keywords to the browser and other names by unique cross-registry
   lookup (names are already unique across kinds per context). Omitted `surface` resolves to the
   MRU head that is still live — dead entries (closed surfaces) are pruned lazily, so closes need
   no tracker bookkeeping and closing the active surface falls through to the next live one.
   Without a tracker (unit tests, embedders) the legacy defaults apply: a live driver means the
   browser, an app session's `activeApp` means that app.
4. **Handlers dispatch on the handle; execution stays kind-specific.** `find`/`click` and
   `screenshot` and `swipe` on a process handle FAIL with a capability error (a background process
   has no elements or screen) — routing never silently reroutes to another kind. `type` on a
   process handle writes stdin (previously reachable only explicitly). `find`'s browser string
   shorthand maps to `elementText` on app surfaces. When nothing is active, the unified error
   names the fix: *"No active surface to act on. Open one first with a startSurface step (or a
   goTo step for a browser), or target a surface explicitly with `surface`."*
5. **Explicit `surface` persists.** Referencing a surface makes it the active surface for later
   surface-less steps, uniformly: browsers already did (ADR 01019 `activate()`), apps now do on
   desktop as well as mobile, and a successful process `type` does. The array-form `startSurface`
   re-asserts activation in authored order across kinds, so its last authored success is active.
6. **Classification follows routing** (`src/runtime/browserStepKeys.ts`): a surface-less
   interaction step (`SURFACE_SENSITIVE_STEP_KEYS` = click/find/screenshot/swipe/type) no longer
   counts as browser-requiring when the test opens or explicitly targets a non-browser surface
   (`testHasNonBrowserSurfaceSignal`), and explicit `{ process }` targeting is excluded like
   `{ app }` always was. Applied in both `isBrowserRequired` (pool sizing, driver start, the
   mobile app+web gate) and `inferRuntimeNeeds.classifyStep` (browser flag only — app screenshots
   still need the image stack, recordings still need ffmpeg). A test with no non-browser signal
   classifies byte-identically to before.

### Consequences

* Good: app/process walkthroughs read like their browser counterparts — open a surface, then act
  on it — and PR #671's guides can drop every per-step `surface: { app: … }`.
* Good: `surface` becomes a *switch* ("act here from now on"), which matches what the schema
  descriptions already promised and what browser users already experienced.
* Good: app-only and process-only specs stop provisioning browsers they never use.
* Accepted behavior change: in a mixed spec, `goTo → startSurface { process } → surface-less find`
  previously acted on the browser; the process is now active and `find` fails with the capability
  error naming the fix. Uniform semantics require this; the repo's process fixtures either target
  explicitly or re-activate the browser first, and the error message is actionable.
* Accepted behavior change: a surface-less interaction step *before* any surface opens in a
  non-browser-signal test now gets the friendly no-active-surface error instead of running against
  an unnavigated default browser.
* Neutral: `record`/`stopRecord` keep their existing host fallback (`driver ?? recordingHost`,
  `activeApp` for the device plan) — recording targets are engine-bound, not element-bound, and
  already behave sensibly in app-only contexts.

### Confirmation

* Unit: `test/active-surface.test.js` (MRU semantics, resolver classification for every reference
  shape × kind, handler routing including capability errors and the persists-after-explicit rule,
  desktop `ensureAppForeground` activation), plus classification tests in `test/core-core.test.js`
  (`browserJobCount`) and `test/runtime-infer-needs.test.js`.
* Fixtures (PASS/SKIPPED only): `test/core-artifacts/apps/active-surface.spec.json` (Windows
  app-only + mixed MRU flow), `apps/active-surface-macos.spec.json` (macOS analogue),
  `process/active-surface-process.spec.json` (surface-less typing to a startSurface process, the
  stdio-history assertion, and the runShell-background no-hijack rule), and surface-less parity
  steps in `apps-android/android-interactions.spec.json`.
* Regression: the full mocha suite and the existing `apps/`, `process/`, `interactions/`,
  `sessions/` fixture groups run unchanged.

## Pros and Cons of the Options

### A. Cross-kind MRU tracker + one resolver

* Good: one rule, no kind special-cases; matches the documented model; explicit references and
  opens compose into a single "most recently active" ordering.
* Good: lazy liveness pruning means closes and teardown need no tracker code.
* Bad: two accepted edge-case behavior changes in mixed specs (documented above).

### B. Kind-priority fallback (app first, else browser)

* Good: smaller diff; no cross-kind ordering to maintain.
* Bad: wrong in mixed specs (recency is what authors mean); processes stay second-class; the
  "priority" is exactly the kind-aware special-casing the drivers reject.

### C. Explicit-only targeting with better errors

* Good: zero behavior change.
* Bad: keeps the per-step `surface` noise, contradicts the schema's own descriptions, and leaves
  the design doc's active-surface model unimplemented for apps and processes.
