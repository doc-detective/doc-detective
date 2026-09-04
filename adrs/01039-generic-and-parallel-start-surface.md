---
status: accepted
date: 2026-07-08
decision-makers: [hawkeyexl]
---

# Generic and parallel startSurface (multi-surface Phase 6)

## Context and Problem Statement

`startSurface` has been app-only since native-app phase A1: browsers open
implicitly through `goTo` and background processes through
`runShell`/`runCode` + `background`. That asymmetry leaves two gaps the
multi-surface design (docs/design/multi-surface-targeting.md) always
intended to close. First, there is no way to *declare* a surface up front.
A doc that says "open two browsers and a server, then…" must smuggle the
opens into navigation and shell steps. Second, everything opens serially:
the A6 two-device pattern boots 30–60 s emulators back-to-back because one
step can only open one surface.

How should `startSurface` grow browser and process descriptors and a
concurrent multi-open, without breaking the A1–A7 app contract or the
Phase 4 session model?

## Decision Drivers

- The A1–A7 single-app form must stay byte-compatible (report shape,
  activation, preflight behavior).
- One authored name must keep meaning one surface (Phase 4 cross-kind
  uniqueness), even when several open at once.
- Overlapping device boots is the concrete win: two emulators should boot
  concurrently.
- `goTo` and `runShell + background` must keep working. This is sugar, not
  migration.
- Fixture invariant: every fixture lands PASS or SKIPPED, so partial
  multi-open outcomes need a deterministic roll-up.

## Considered Options

1. **Descriptor shape**: (a) a `kind` field, vs. (b) three mutually
   exclusive branches discriminated by their key (`app` | `browser` |
   `process`), matching the `surface` reference grammar.
2. **Browser descriptor navigation**: (a) allow `url`/`waitUntil` on the
   descriptor, vs. (b) open a blank ready session only, leaving `goTo` as the
   navigation step.
3. **Process descriptor readiness**: (a) `$ref` the shared `waitUntil_v3`
   process shape, vs. (b) a verbatim copy of runShell's
   `background.waitUntil` (port/stdio/httpGet/delayMs).
4. **Concurrency model**: (a) fully parallel including apps, vs. (b) three
   lanes. Browser and process go parallel, and apps go serial with devices
   pre-acquired in parallel.
5. **Partial results**: (a) fail fast and abandon in-flight opens, vs.
   (b) gather with allSettled and roll up FAIL > SKIPPED > PASS.
6. **Active surface after a parallel open**: (a) completion order, vs.
   (b) authored order re-asserted after all lanes settle.

## Decision Outcome

Chosen: **key-discriminated branches (1b)** + **blank-session browser
opens (2b)** + **verbatim waitUntil copy (3b)** + **three lanes (4b)** +
**allSettled roll-up (5b)** + **authored-order activation (6b)**.

- **Schema** (`startSurface_v3`): the top level becomes an `anyOf` of
  appDescriptor | browserDescriptor | processDescriptor | array (minItems 1)
  of the same three. Branches are mutually exclusive by construction (each
  `additionalProperties: false` with a distinct required key). The browser
  descriptor carries `browser` (engine enum), `name`, `headless`, and `size`.
  `size` is the outer window, and the `window`→`size` rename applies ONLY here;
  `context_v3` keeps `browser.window`. It also carries `viewport` (page
  dimensions, wins over size) and `driverOptions`.
  Deliberately no `url` (goTo navigates) and no
  `waitUntil`/`timeout` (session creation IS readiness; browser waitUntil
  conditions are meaningless on a blank page). The process descriptor
  carries `process` (command) + required `name`, `args`,
  `workingDirectory`, `tty`, `waitUntil` (a verbatim copy of runShell's
  `background.waitUntil`, NOT a `$ref` to `waitUntil_v3`'s process shape).
  That shape is stdio/delayMs-only and is consumed by `type`, so extending
  it would leak fields `type` can't execute. It also carries `timeout`.
- **Runtime** (`src/core/tests/startSurface.ts`): descriptors classify by
  key; duplicate intended names within one array FAIL before anything
  launches. Three lanes are gathered with `Promise.allSettled`. The app lane
  pre-fires `acquireDevice` for every app descriptor in parallel. The
  device registry registers in-flight boots synchronously, so the boots
  overlap. It then runs `startAppSurface` serially in authored order, because its
  internals are not concurrency-safe: lazy server start, shared deviceSessions,
  and pending-recording loops. The browser lane opens in parallel
  through the context session registry via a new `openSession`. That's the same
  path goTo's auto-open uses, with per-session `headless`/`size`/
  `driverOptions` overrides and post-start viewport. The process lane
  launches in parallel through `startBackgroundProcessSurface`. That's the
  runShell background block factored into `processSurface.ts`, so the two
  ways to start a background process share one implementation.
- **Roll-up**: any FAIL ⇒ FAIL, else any SKIPPED ⇒ SKIPPED, else PASS.
  In-step SKIPs are environment gaps only; device-capability gaps already
  SKIP the whole context in preflight. There are per-descriptor lines, plus an
  `outputs.surfaces` array in authored order. The single-object app form
  returns the `startAppSurface` result verbatim.
- **Activation**: after all lanes settle, activation is re-asserted in
  authored order. The LAST authored descriptor of each kind is that kind's
  active surface, regardless of completion order.
- **Need inference**: `startSurface{browser}` marks a context
  browser-required, covering pool sizing, driver provisioning, and engine
  collection; a firefox descriptor pulls geckodriver. `isAppDriverRequired`
  narrows to app descriptors so a browser/process-only startSurface no
  longer boots the app preflight.

### Consequences

- Good: one step boots two emulators with overlapped boots, and the KVM
  two-device fixture drops wall-clock. Docs can declare their surfaces up
  front, and browser sessions get per-session launch knobs goTo never had.
- Good: `runShell + background` and `goTo` openers are unchanged. The new
  forms are sugar over shared code paths, not a migration.
- Trade-off: a context whose only browser touch is `startSurface{browser}`
  still boots the default engine session first. That's the Phase 4 invariant
  that a browser-required context has a default session. An unnamed same-engine
  descriptor therefore FAILs as a duplicate, with "pass `name`" guidance.
- Trade-off: apps in one array open serially, and only their device boots
  overlap. Correct-by-construction beats theoretical parallelism, given
  startAppSurface's shared state.
- Known limits, documented but not fixtured. safaridriver allows one session
  per host, so a parallel array containing a second safari can fail at the
  driver. A desktop app plus a browser in one array is an untested combination.

### Confirmation

- Unit: `test/start-surface-dispatch.test.js` covers classification,
  duplicate-name pre-FAIL, allSettled gathering, and the roll-up matrix. It also
  covers app-lane serialization with parallel pre-acquire, authored-order
  activation, and single-object byte-compat. `test/browserSessions.test.js` covers openSession
  and activateSession, and `test/background-process.test.js` covers the shared
  launcher. Schema positives and negatives live in
  `src/common/test/validate.test.js`.
- Fixtures: `sessions/start-surface-browser.spec.json`,
  `sessions/start-surface-parallel.spec.json`,
  `process/start-surface-process.spec.json`,
  `apps/app-parallel-windows.spec.json`, and
  `apps-android/android-two-devices.spec.json` converted to the array form
  (KVM leg proves overlapped boots).

## Pros and Cons of the Options

### 1a `kind` field

- Good: trivially extensible.
- Bad: diverges from the `surface` reference grammar every other step uses;
  redundant with the key that must be present anyway.

### 2a URL on the browser descriptor

- Good: one step opens and navigates.
- Bad: duplicates goTo (readiness conditions, new-tab/window handling,
  redirects) in a second schema; the design keeps navigation in one step.

### 3a `$ref` the shared process waitUntil

- Good: one shape.
- Bad: `type` consumes that shape and can only execute stdio/delayMs;
  adding port/httpGet there would validate conditions `type` can't run.

### 4a fully parallel apps

- Good: maximal concurrency.
- Bad: `startAppSurface` mutates shared session state, through lazy server
  check-then-await, deviceSessions, and pending recordings. Parallelizing it
  trades a deterministic contract for races the boots don't even need.
  Device acquisition, the long pole, already overlaps.

### 5a fail fast

- Good: earliest possible signal.
- Bad: abandons in-flight boots that then leak or half-register; the
  roll-up keeps every surface accounted for and still fails the step.

### 6a completion-order activation

- Good: no extra pass.
- Bad: it's nondeterministic. The same spec would flip its active surface run
  to run, which surface-less steps immediately observe.
