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
intended to close. First, there is no way to *declare* a surface up front —
a doc that says "open two browsers and a server, then…" must smuggle the
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
- `goTo` and `runShell + background` must keep working — sugar, not
  migration.
- Fixture invariant: every fixture lands PASS or SKIPPED, so partial
  multi-open outcomes need a deterministic roll-up.

## Considered Options

1. **Descriptor shape**: (a) a `kind` field, vs. (b) three mutually
   exclusive branches discriminated by their key (`app` | `browser` |
   `process`), matching the `surface` reference grammar.
2. **Browser descriptor navigation**: (a) allow `url`/`waitUntil` on the
   descriptor, vs. (b) open a blank ready session only — `goTo` stays the
   navigation step.
3. **Process descriptor readiness**: (a) `$ref` the shared `waitUntil_v3`
   process shape, vs. (b) a verbatim copy of runShell's
   `background.waitUntil` (port/stdio/httpGet/delayMs).
4. **Concurrency model**: (a) fully parallel including apps, vs. (b) three
   lanes — browser/process parallel, apps serial with devices pre-acquired
   in parallel.
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
  descriptor carries `browser` (engine enum), `name`, `headless`, `size`
  (outer window — the `window`→`size` rename applies ONLY here; `context_v3`
  keeps `browser.window`), `viewport` (page dimensions, wins over size), and
  `driverOptions`. Deliberately no `url` (goTo navigates) and no
  `waitUntil`/`timeout` (session creation IS readiness; browser waitUntil
  conditions are meaningless on a blank page). The process descriptor
  carries `process` (command) + required `name`, `args`,
  `workingDirectory`, `tty`, `waitUntil` (a verbatim copy of runShell's
  `background.waitUntil`, NOT a `$ref` to `waitUntil_v3`'s process shape —
  that shape is stdio/delayMs-only and is consumed by `type`, so extending
  it would leak fields `type` can't execute), and `timeout`.
- **Runtime** (`src/core/tests/startSurface.ts`): descriptors classify by
  key; duplicate intended names within one array FAIL before anything
  launches. Three lanes gathered with `Promise.allSettled`: the app lane
  pre-fires `acquireDevice` for every app descriptor in parallel (the
  device registry registers in-flight boots synchronously, so the boots
  overlap) then runs `startAppSurface` serially in authored order (its
  internals — lazy server start, shared deviceSessions, pending-recording
  loops — are not concurrency-safe); the browser lane opens in parallel
  through the context session registry via a new `openSession` (the same
  path goTo's auto-open uses, with per-session `headless`/`size`/
  `driverOptions` overrides and post-start viewport); the process lane
  launches in parallel through `startBackgroundProcessSurface` — the
  runShell background block factored into `processSurface.ts`, so the two
  ways to start a background process share one implementation.
- **Roll-up**: any FAIL ⇒ FAIL, else any SKIPPED ⇒ SKIPPED, else PASS
  (in-step SKIPs are environment gaps only — device-capability gaps already
  SKIP the whole context in preflight). Per-descriptor lines + an
  `outputs.surfaces` array in authored order. The single-object app form
  returns the `startAppSurface` result verbatim.
- **Activation**: after all lanes settle, activation is re-asserted in
  authored order — the LAST authored descriptor of each kind is that kind's
  active surface, regardless of completion order.
- **Need inference**: `startSurface{browser}` marks a context
  browser-required (pool sizing, driver provisioning, engine collection —
  a firefox descriptor pulls geckodriver), and `isAppDriverRequired`
  narrows to app descriptors so a browser/process-only startSurface no
  longer boots the app preflight.

### Consequences

- Good: one step boots two emulators with overlapped boots (the KVM
  two-device fixture drops wall-clock); docs can declare their surfaces up
  front; browser sessions get per-session launch knobs goTo never had.
- Good: `runShell + background` and `goTo` openers are unchanged — the new
  forms are sugar over shared code paths, not a migration.
- Trade-off: a context whose only browser touch is `startSurface{browser}`
  still boots the default engine session first (the Phase 4 invariant that
  a browser-required context has a default session); an unnamed same-engine
  descriptor therefore FAILs as a duplicate with "pass `name`" guidance.
- Trade-off: apps in one array open serially (only their device boots
  overlap) — correct-by-construction beats theoretical parallelism given
  startAppSurface's shared state.
- Known limits, documented not fixtured: safaridriver allows one session
  per host, so a parallel array containing a second safari can fail at the
  driver; a desktop app + browser in one array is an untested combination.

### Confirmation

- Unit: `test/start-surface-dispatch.test.js` (classification,
  duplicate-name pre-FAIL, allSettled gathering, roll-up matrix, app-lane
  serialization with parallel pre-acquire, authored-order activation,
  single-object byte-compat), `test/browserSessions.test.js` (openSession,
  activateSession), `test/background-process.test.js` (shared launcher),
  schema positives/negatives in `src/common/test/validate.test.js`.
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
- Bad: `startAppSurface` mutates shared session state (lazy server
  check-then-await, deviceSessions, pending recordings) — parallelizing it
  trades a deterministic contract for races the boots don't even need
  (device acquisition, the long pole, already overlaps).

### 5a fail fast

- Good: earliest possible signal.
- Bad: abandons in-flight boots that then leak or half-register; the
  roll-up keeps every surface accounted for and still fails the step.

### 6a completion-order activation

- Good: no extra pass.
- Bad: nondeterministic — the same spec would flip its active surface run
  to run, which surface-less steps immediately observe.
