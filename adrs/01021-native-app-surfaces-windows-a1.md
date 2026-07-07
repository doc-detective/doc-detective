---
status: accepted
date: 2026-07-03
decision-makers: doc-detective maintainers
---

# Native app surfaces on Windows via startSurface (phase A1)

## Context and Problem Statement

Doc Detective automates browsers, HTTP, and shells, but documentation for native desktop
applications is untestable: nothing can launch an app, find its controls, type into it, capture
its window, or close it. The plan of record
([docs/design/native-app-surfaces.md](../docs/design/native-app-surfaces.md), expanding
multi-surface Phase 5) defines an eight-phase roadmap; this ADR ships **phase A1**: native
**Windows** apps as the third surface kind, with the schema shaped up front so the later phases
(macOS, emulated Android/iOS, mobile browsers) are purely additive.

## Decision Drivers

* One addressing model: apps must be ordinary surfaces (`startSurface` opens, `surface` targets,
  `closeSurface` closes) — no context-level `apps` field, no `goTo`-launches-apps (both rejected
  in the design).
* The app descriptor must already carry the future (mobile `device`/`install`/`activity`,
  `driverOptions` passthrough) as validated-but-reserved shape, so no phase forces a breaking
  change.
* Driver weight: the Windows driver must be lazy-installed like every other Appium driver —
  never bundled, never a lockfile entry — and its absence must gate (SKIP), not fail.
* Semantic-first authoring: the existing element vocabulary (`elementText`, `elementId`,
  `elementAria`) must work on native controls, with a native-locator escape hatch for the rest.
* App-only tests must not boot a browser they never use.

## Considered Options

* **NovaWindows driver behind `startSurface`, per-context app Appium server** (the design's shape).
* **Context-level `apps` fan-out** (the original planning issues' model, prototyped on the
  `windows` branch).
* **Non-Appium automation** (nut.js/AutoIt-style OS input synthesis).

## Decision Outcome

Chosen option: **NovaWindows behind `startSurface` with a per-context app Appium server**,
implementing the plan of record. Key mechanics:

* **Schema** (all additive): `startSurface_v3` (app descriptor with reserved mobile fields and a
  free-form `driverOptions` capability passthrough), an `app` branch on `surface_v3`
  (windows-no-tabs selector grammar), app readiness (`{ delayMs, find }`) on `waitUntil_v3` and
  `type`, and app branches on `find`/`click`/`screenshot` surface refs.
* **Driver = ordinary lazy heavy dep.** `appium-novawindows-driver` is declared in
  `ddRuntimeDependencies` (kept out of the lockfile, the `node-pty` precedent) and JIT-installs
  via `ensureRuntimeInstalled`. **Manifest invalidation:** Appium scans
  `APPIUM_HOME/node_modules` only when its manifest cache doesn't exist; the preflight deletes a
  manifest that predates the driver so the server's next start rediscovers reality. This is the
  general fix for "npm-installed but Appium can't see it".
* **Per-context app server.** App sessions run on their own Appium server, `APPIUM_HOME`-homed
  where the driver actually resolves (shim or runtime cache), so app and browser sessions never
  fight over one home. The server starts lazily on the first `startSurface` and dies in the
  context sweep.
* **Preflight gates, steps fail.** `runContext` preflights app-driver tests (platform is Windows;
  driver present or installable) and lands unmet contexts as **SKIPPED** with an actionable
  reason — the same gating semantics as `requires` (ADR 01020). Reserved descriptor fields
  (`device`, `install`, `activity`, unsupported `env`) FAIL loudly naming the roadmap.
* **Actions:** `find`/`click`/`type`/`screenshot` targeting `{ app: … }` run on the app session's
  driver through the UIA mapping column (`elementText` → `@Name`, `elementId` → AutomationId
  fast path, `elementAria` → ControlType) with `selector` accepting native XPath/`~accessibilityId`
  (CSS rejected with guidance). Screenshot reuses the existing file-based
  path/overwrite/comparison machinery; crop and window selectors on app targets FAIL loudly as
  later-phase. `isBrowserRequired` (driver steps minus app-targeted ones) keeps app-only tests
  browser-free.

### Consequences

* Good, because the charmap fixture passes end-to-end on Windows (launch → click → type via
  escape hatch → find → capture with typed content visible → close) and SKIPs on Linux/macOS —
  the PASS/SKIPPED fixture invariant holds on every CI leg.
* Good, because phases A2+ reuse everything but the mapping column and preflight: the descriptor,
  registry, server-homing, and gating are platform-agnostic.
* Bad, because a driver lazy-installed into the runtime cache pulls a second Appium copy into the
  cache when Appium itself is shim-resolved (~once, disk-only). Accepted: co-locating driver and
  server home is what makes discovery deterministic.
* Bad, because star-matched `@Name` locators can land on a non-focusable label when several
  elements share a name (the charmap copy-box case); the escape hatch covers it, and role-carrying
  semantic criteria are a documented improvement for a later phase.
* Neutral: multi-window app addressing, app recording, and the device vocabulary are validated
  shapes that FAIL/route to later phases by design.

### Confirmation

* Hermetic unit tests: `test/app-surface.test.js` (35 tests — pure helpers, preflight with
  injected deps, session lifecycle with fake drivers/servers, locator building, teardown).
* Schema: positive/negative cases in `src/common/test/validate.test.js`
  ("native app surfaces (phase A1)").
* End-to-end: `test/core-artifacts/app-surfaces.spec.json` in the combined core pass — the
  Windows flow permutations plus the asserted preflight-SKIP permutation.

## Pros and Cons of the Options

### NovaWindows behind startSurface (chosen)

* Good, because every action, the session registry, and screenshots ride the existing
  Appium/WebDriver client — one architecture across web and native.
* Good, because driver choice stays an implementation detail behind the adapter seam (no
  `automationName` in user schema; `driverOptions` is the only, documented, leak).
* Bad, because NovaWindows is community-maintained; if it stalls, swapping UIA drivers is a code
  change (deliberately not a schema change).

### Context-level `apps` fan-out (prototype model)

* Good, because it needed less new schema at the time it was written.
* Bad, because it conflates environment matrix with provisioning — rejected by the multi-surface
  design and superseded by the plan of record; multi-app/multi-surface tests are inexpressible.

### Non-Appium automation

* Good, because no Appium server or driver install.
* Bad, because input synthesis without an accessibility tree gives no semantic element model, no
  waits, and no portability to the mobile phases — the opposite of the design's element vocabulary.
