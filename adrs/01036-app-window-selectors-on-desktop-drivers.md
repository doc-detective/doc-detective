---
status: accepted
date: 2026-07-07
decision-makers: [hawkeyexl]
---

# App window selectors on desktop drivers

## Context and Problem Statement

The app-surface `window` selector has been **schema-valid since phase A1**
(the design fixed the shape up front: name | index | `-1` | `{title}` with
`/regex/`, the shared browser grammar minus `url`) but runtime-deferred:
`find`/`screenshot`/`swipe`/`closeSurface` FAILed with "lands in a later
part of this phase", `record` SKIPped (an A7 review-round divergence), and
`type` **silently ignored** the selector — three different behaviors for one
field. Meanwhile two real capability gaps sat behind the guards: dialogs and
secondary windows (the design doc's headline use case) were unreachable, and
a **latent A7 bug** meant Mac2's `getWindowRect()` — which the recording
crop and swipe math used — returns the WHOLE main screen, so macOS
"window-scoped" recordings were actually full-display and mac swipe centers
were screen centers.

Rather than aligning the guards, implement the feature on the desktop
drivers (owner decision). How should window addressing work on each driver,
which selector forms can each honor honestly, and what happens on mobile?

## Decision Drivers

- One authoring grammar (the shared selector), per-driver honesty about what
  it can honor — FAIL loudly for the rest (the established Phase 3 pattern).
- The shared surface contract: "the targeted surface stays focused
  afterward" — window selection must be sticky.
- No schema changes (the shape shipped in A1); mobile apps are single-window.
- Driver reality, verified from source: NovaWindows v1.4.1 has W3C window
  handles but they are DESKTOP-GLOBAL and its switch-by-title branch has a
  `trySetForegroundWindow(NaN)` bug; Mac2 has NO window routes at all, but
  windows are addressable `XCUIElementTypeWindow` elements with rects and
  element screenshots.

## Considered Options

1. **Per-driver model**: (a) force one model (handles everywhere — impossible
   on Mac2), vs. (b) two models behind one seam: Windows "switch-then-act"
   (switchToWindow re-roots the session; everything follows), macOS
   "window-as-element" (hold the element; scope finds under it, use its rect
   and element screenshot).
2. **Windows title matching**: (a) the driver's `switchToWindow(title)`
   (built-in retry), vs. (b) probe candidate handles and match titles
   ourselves.
3. **Windows window adoption**: handles are desktop-global — (a) match
   against every handle, (b) filter by the root element's `ProcessId`
   against the app's pid (best-effort), with baseline handles probed lazily
   on first selector use (the app may launch with several of its own).
4. **Mobile**: (a) tolerate index 0/-1 as the single window, vs. (b) FAIL
   with one shared message.
5. **Closing the last window** via `{app, window}`: allow (ends the app as a
   side effect) vs. refuse with guidance.

## Decision Outcome

Chosen: **two models behind one seam (1b)** — `src/core/tests/appWindows.ts`
strategies keyed like the driver/gesture tables; **self-matched handle
probing (2b)**; **pid-filtered adoption (3b)**; **shared mobile FAIL (4b)**;
**last-window refusal (5)**.

- **Windows (switch-then-act)**: never call the driver's title switch (the
  NaN-foreground bug, plus a 20×500ms internal retry burned per miss) —
  handles only. New desktop windows are adopted per surface when their root
  `ProcessId` matches the app's pid (captured at startSurface; unreadable
  pid degrades to unfiltered adoption, documented). Windows already present
  at the surface snapshot are recorded as baseline handles and pid-probed
  lazily on the first selector use — same-pid ones adopt as OLD (right after
  main in adoption order, so they never shadow a new dialog under `-1`),
  other-pid ones are remembered as foreign and never probed again. This
  keeps an app's own launch windows (splash + main, multiple documents)
  selectable without paying a desktop-wide probe sweep at startSurface.
  `-1` = the most recently adopted window (the dialog case); title/`{name}`/`{title}`
  match by probing candidates; **`index ≥ 0` FAILs** (no app-scoped creation
  order exists). A match leaves the session rooted there — sticky by
  construction. Close = `windows: closeApp` on the switched root, then
  re-root to a survivor; teardown re-roots to the main window before
  `deleteSession` (which closes whatever the current root is).
- **macOS (window-as-element)**: enumerate `//XCUIElementTypeWindow`
  (app-rooted), match on element titles, `index` = query order (documented
  caveat), `-1` = (title, frame) set-diff against the startSurface baseline.
  The held element is the sticky active window (stale → one re-resolve by
  stored title → clear). Scoped finds re-anchor compiled `//…` locators to
  `.//` (an absolute XPath in an element-scoped find escapes the subtree).
  Close = the `_XCUI:CloseWindow` stoplight button (the same `_XCUI:` family
  WDA clicks for fullscreen/minimize; fixture-verified) with a
  title-bar-click + Cmd+W fallback. No per-window raise exists without
  insecure server features — the title-bar click is the practical raise.
- **Rects and captures become window-true**: recording crops and swipe
  coordinate math resolve through the strategy — on Windows the switched
  root's `getWindowRect` (physical px, unchanged), on macOS the window
  ELEMENT's rect (absolute points + the existing A7 capture-frame-derived
  scale). This **fixes the latent A7 bug**: selector-less macOS app
  recordings/swipes previously used the full-screen `getWindowRect`;
  they now use the default window element (sticky active window, else the
  app's first window). Selector-less macOS app screenshots likewise switch
  to window-element capture (owner-approved).
- **Every consumer, one wording**: find/click/type/screenshot/record/swipe/
  closeSurface all resolve window selectors; mobile selectors FAIL with one
  shared message ("<platform> app surfaces are single-window…") — including
  `record`, whose A7 mobile-window SKIP becomes a FAIL (behavior change,
  recorded here). `type`'s silent ignore is fixed by implementation.
- **`closeSurface {app, window}` closes ONE window**, keeps the surface; a
  no-match is an idempotent absent no-op (browser parity); the last window
  is refused with guidance toward the bare form (closing it would end the
  app as a side effect the author didn't spell).

Two additional decisions came out of live fixture verification:

- **Windows app left-clicks use the UIA Invoke pattern** (`windows: invoke`)
  with a physical-click fallback for non-invokable elements. The driver's
  physical click is real mouse input at absolute coordinates and lands
  off-target on scaled (HiDPI) displays — verified live: the click's UIA
  SetFocus reached the button (focus rectangle visible) while the mouse
  click missed, on a 3840×2160 display at 175 %. Every prior fixture
  "passed" clicks without asserting their effect, which is why this went
  unnoticed. Non-left and duration clicks keep the physical paths
  (`windows: click`) — they have no pattern equivalent.
- **The Windows fixture targets a purpose-built two-window WinForms app**
  (`two-windows.ps1` via `powershell.exe -EncodedCommand`) — the app-surface
  counterpart of the test-server pages. Every candidate System32 dialog app
  carries a confounder: odbcad32/osk/eudcedit have highestAvailable/uiAccess
  manifests (CreateProcess fails with "requires elevation" for admin users),
  dxdiag gates its buttons behind a hardware scan and shows crash-recovery
  modals, and menu popups are separate top-level HWNDs the one-root-window
  driver can't reach. `-EncodedCommand` (not `-File`) because **NovaWindows
  v1.4.1 silently ignores the `appWorkingDir` capability** — a latent A1 gap
  (the `workingDirectory` field never reached the launched process) worth an
  upstream report; a unit test pins the embedded blob against the `.ps1`.

### Consequences

- Good: dialogs and secondary windows — the design doc's headline case —
  are now addressable end-to-end on both desktop drivers, with recording
  crops and screenshots that actually bound the chosen window.
- Good: macOS recordings and swipes stop silently operating on the whole
  screen (bug fix; existing fixtures assert success only and stay green,
  with crops shrinking to the real window).
- Trade-off: Windows `-1` is best-effort under pid-read failure (the diff is
  desktop-global); probing briefly switches through candidate windows
  (foreground flashes, bounded to our-app + new-since-baseline handles).
- Trade-off: macOS `index` is element query order, not creation order; a
  sibling window of the same app can still occlude the target (no AXRaise
  without `--allow-insecure` features — deliberately not enabled).
- Slow no-match paths are bounded by the step timeout (one probe pass per
  ~250ms poll).

### Confirmation

- Unit: `test/app-windows.test.js` (both strategy models, pid filtering,
  NaN-bug avoidance, `-1` diffs, staleness, close/fallback sequencing,
  mobile wording, rect validation), plus rewritten consumer suites
  (`app-actions-coverage`, `app-recording`, `swipe`,
  `closesurface-coverage`, `app-surface` — snapshot baseline, teardown
  re-root, mac element-rect late-bind).
- Fixtures (apps group, REQUIRE_PASS on windows/mac):
  `apps/app-windows.spec.json` — odbcad32's "Create New Data Source" dialog
  (title-regex find, sticky proof, window screenshot, window-selected
  recording, `-1` close, survivor); `apps/app-windows-macos.spec.json` —
  TextEdit File→New second document (title-regex find, window-element
  screenshot, single-window close — the live `_XCUI:CloseWindow`
  verification — survivor typing).

## Pros and Cons of the Options

### Windows: driver title switch vs. self-matched handle probe (chosen: probe)

- Driver title switch — Good: one call. Bad: the title branch never
  foregrounds (NaN bug), input then lands in the wrong window; a miss burns
  a 10-second internal retry; no regex.
- Handle probe (chosen) — Good: correct foregrounding (handle branch),
  regex/exact semantics identical to the browser grammar
  (`matchesExpectedOutput`), pid filtering possible. Bad: more round-trips
  (bounded by the candidate set).

### Windows adoption: unfiltered vs. pid-filtered (chosen: pid-filtered)

- Unfiltered — Good: no pid read. Bad: `-1` and title matches can adopt
  another process's window (handles are desktop-global).
- Pid-filtered (chosen) — Good: selectors mean "this app's windows". Bad:
  depends on the `ProcessId` attribute; degrades to unfiltered when
  unreadable (documented).

### Mobile: tolerate vs. FAIL (chosen: FAIL)

- Tolerating index 0/-1 as "the one window" would make specs silently
  platform-dependent; the shared FAIL names the fix (omit `window`) and
  keeps the schema shape available if a future phase gains real handles.
