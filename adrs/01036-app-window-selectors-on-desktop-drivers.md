---
status: accepted
date: 2026-07-07
decision-makers: [hawkeyexl]
---

# App window selectors on desktop drivers

## Context and Problem Statement

The app-surface `window` selector has been **schema-valid since phase A1**,
but runtime-deferred. The design fixed the shape up front: name, index, `-1`,
or `{title}` with `/regex/`, the shared browser grammar minus `url`. One field
then had three different behaviors. `find`, `screenshot`, `swipe`, and
`closeSurface` FAILed with "lands in a later part of this phase". `record`
SKIPped, an A7 review-round divergence. And `type` **silently ignored** the
selector. Meanwhile two real capability gaps sat behind the guards. Dialogs and
secondary windows, the design doc's headline use case, were unreachable. And a
**latent A7 bug** meant Mac2's `getWindowRect()` returns the WHOLE main screen.
The recording crop and swipe math used it. So macOS "window-scoped" recordings
were actually full-display, and mac swipe centers were screen centers.

Rather than aligning the guards, implement the feature on the desktop
drivers (owner decision). How should window addressing work on each driver,
which selector forms can each honor honestly, and what happens on mobile?

## Decision Drivers

- One authoring grammar, the shared selector, with per-driver honesty about
  what it can honor. FAIL loudly for the rest, the established Phase 3 pattern.
- The shared surface contract says "the targeted surface stays focused
  afterward". So window selection must be sticky.
- No schema changes, since the shape shipped in A1. Mobile apps are
  single-window.
- Driver reality, verified from source. NovaWindows v1.4.1 has W3C window
  handles, but they are DESKTOP-GLOBAL, and its switch-by-title branch has a
  `trySetForegroundWindow(NaN)` bug. Mac2 has NO window routes at all. But its
  windows are addressable `XCUIElementTypeWindow` elements, with rects and
  element screenshots.

## Considered Options

1. **Per-driver model.** Either (a) force one model, handles everywhere, which
   is impossible on Mac2. Or (b) two models behind one seam. Windows does
   "switch-then-act", where switchToWindow re-roots the session and everything
   follows. macOS does "window-as-element": hold the element, scope finds under
   it, and use its rect and element screenshot.
2. **Windows title matching.** Either (a) the driver's `switchToWindow(title)`,
   with its built-in retry, or (b) probe candidate handles and match titles
   ourselves.
3. **Windows window adoption.** Handles are desktop-global. Either (a) match
   against every handle. Or (b) filter by the root element's `ProcessId`
   against the app's pid, best-effort. Baseline handles are then probed lazily
   on first selector use. The app may launch with several of its own.
4. **Mobile**: (a) tolerate index 0/-1 as the single window, vs. (b) FAIL
   with one shared message.
5. **Closing the last window** via `{app, window}`: allow (ends the app as a
   side effect) vs. refuse with guidance.

## Decision Outcome

Chosen: **two models behind one seam (1b)**, with `src/core/tests/appWindows.ts`
strategies keyed like the driver and gesture tables. Then **self-matched handle
probing (2b)**, **pid-filtered adoption (3b)**, **a shared mobile FAIL (4b)**,
and **last-window refusal (5)**.

- **Windows uses switch-then-act.** It never calls the driver's title switch,
  because of the NaN-foreground bug, plus a 20×500ms internal retry burned per
  miss. It uses handles only. New desktop windows are adopted per surface when
  their root `ProcessId` matches the app's pid, captured at startSurface. An
  unreadable pid degrades to unfiltered adoption, which is documented. Windows
  already present at the surface snapshot are recorded as baseline handles, and
  pid-probed lazily on the first selector use. Same-pid ones adopt as OLD,
  right after main in adoption order, so they never shadow a new dialog under
  `-1`. Other-pid ones are remembered as foreign, and never probed again. This
  keeps an app's own launch windows selectable, without paying a desktop-wide
  probe sweep at startSurface. Those include a splash plus main, and multiple
  documents. `-1` is the most recently adopted window, the dialog case. A
  title, `{name}`, or `{title}` matches by probing candidates. **`index ≥ 0`
  FAILs**, since no app-scoped creation order exists. A match leaves the
  session rooted there, so it's sticky by construction. Close is
  `windows: closeApp` on the switched root, then a re-root to a survivor.
  Teardown re-roots to the main window before `deleteSession`, which closes
  whatever the current root is.
- **macOS uses window-as-element.** It enumerates `//XCUIElementTypeWindow`,
  app-rooted, and matches on element titles. `index` is query order, a
  documented caveat. `-1` is a (title, frame) set-diff against the startSurface
  baseline. The held element is the sticky active window. A stale one gets one
  re-resolve by stored title, then clears. Scoped finds re-anchor compiled
  `//…` locators to `.//`, because an absolute XPath in an element-scoped find
  escapes the subtree. Close is the `_XCUI:CloseWindow` stoplight button, the
  same `_XCUI:` family WDA clicks for fullscreen and minimize, and it's
  fixture-verified. There's a title-bar-click plus Cmd+W fallback. No
  per-window raise exists without insecure server features, so the title-bar
  click is the practical raise.
- **Rects and captures become window-true.** Recording crops and swipe
  coordinate math resolve through the strategy. On Windows that's the switched
  root's `getWindowRect`, in physical px, unchanged. On macOS it's the window
  ELEMENT's rect, in absolute points, with the existing A7
  capture-frame-derived scale. This **fixes the latent A7 bug**. Selector-less
  macOS app recordings and swipes previously used the full-screen
  `getWindowRect`. They now use the default window element, the sticky active
  window, or else the app's first window. Selector-less macOS app screenshots
  likewise switch to window-element capture, owner-approved.
- **Every consumer, one wording.** `find`, `click`, `type`, `screenshot`,
  `record`, `swipe`, and `closeSurface` all resolve window selectors. Mobile
  selectors FAIL with one shared message, "<platform> app surfaces are
  single-window…". That includes `record`, whose A7 mobile-window SKIP becomes
  a FAIL, a behavior change recorded here. `type`'s silent ignore is fixed by
  implementation.
- **`closeSurface {app, window}` closes ONE window**, and keeps the surface. A
  no-match is an idempotent absent no-op, matching browser parity. The last
  window is refused, with guidance toward the bare form. Closing it would end
  the app as a side effect the author didn't spell.

Two additional decisions came out of live fixture verification:

- **Windows app left-clicks use the UIA Invoke pattern**, `windows: invoke`,
  with a physical-click fallback for non-invokable elements. The driver's
  physical click is real mouse input at absolute coordinates, and lands
  off-target on scaled HiDPI displays. That was verified live. The click's UIA
  SetFocus reached the button, with the focus rectangle visible, while the
  mouse click missed, on a 3840×2160 display at 175 %. Every prior fixture
  "passed" clicks without asserting their effect, which is why this went
  unnoticed. Non-left and duration clicks keep the physical paths,
  `windows: click`, since they have no pattern equivalent.
- **The Windows fixture targets a purpose-built two-window WinForms app.**
  That's `two-windows.ps1`, run through `powershell.exe -EncodedCommand`. It's
  the app-surface counterpart of the test-server pages. Every candidate
  System32 dialog app carries a confounder. odbcad32, osk, and eudcedit have
  highestAvailable or uiAccess manifests, so CreateProcess fails with "requires
  elevation" for admin users. dxdiag gates its buttons behind a hardware scan,
  and shows crash-recovery modals. And menu popups are separate top-level
  HWNDs the one-root-window driver can't reach. It uses `-EncodedCommand`
  rather than `-File`, because **NovaWindows v1.4.1 silently ignores the
  `appWorkingDir` capability**. That's a latent A1 gap, where the
  `workingDirectory` field never reached the launched process. A unit test pins
  the embedded blob against the `.ps1`.
- **`workingDirectory` on a Windows app surface now FAILs with guidance**,
  matching the macOS LaunchServices precedent, instead of mapping a capability
  the driver ignores. A1 mapped `workingDirectory` to `appium:appWorkingDir`.
  But NovaWindows v1.4.1 discards it, and the launched process inherits the
  driver's PowerShell-session cwd. So the field was a silent no-op on Windows,
  the same failure mode the macOS row already rejects. The runner drops the
  dead caps mapping, and adds a `workingDirectory` entry to the Windows
  `unsupportedFields`. The guidance says to launch through runShell if the cwd
  matters. The schema description says the field is reserved until a driver
  honors it. It's reported upstream as
  [appium-novawindows-driver#85](https://github.com/AutomateThePlanet/appium-novawindows-driver/issues/85)
  alongside the HiDPI click miss. If a future driver gains real
  working-directory support, the field can be re-honored on that pinned
  version.

### Consequences

- Good: dialogs and secondary windows, the design doc's headline case, are now
  addressable end-to-end on both desktop drivers. Recording crops and
  screenshots actually bound the chosen window.
- Good: macOS recordings and swipes stop silently operating on the whole
  screen. That's a bug fix. Existing fixtures assert success only and stay
  green, with crops shrinking to the real window.
- Trade-off: Windows `-1` is best-effort under pid-read failure, since the diff
  is desktop-global. Probing briefly switches through candidate windows, so the
  foreground flashes, bounded to our-app and new-since-baseline handles.
- Trade-off: macOS `index` is element query order, rather than creation order.
  A sibling window of the same app can still occlude the target. There's no
  AXRaise without `--allow-insecure` features, deliberately not enabled.
- Slow no-match paths are bounded by the step timeout (one probe pass per
  ~250ms poll).

### Confirmation

- Unit tests in `test/app-windows.test.js` cover both strategy models, pid
  filtering, NaN-bug avoidance, `-1` diffs, staleness, close and fallback
  sequencing, mobile wording, and rect validation. The consumer suites were
  rewritten too: `app-actions-coverage`, `app-recording`, `swipe`,
  `closesurface-coverage`, and `app-surface`, covering the snapshot baseline,
  the teardown re-root, and the mac element-rect late-bind.
- Fixtures live in the apps group, with REQUIRE_PASS on windows and mac.
  `apps/app-windows.spec.json` drives odbcad32's "Create New Data Source"
  dialog. It covers a title-regex find, sticky proof, a window screenshot, a
  window-selected recording, a `-1` close, and the survivor.
  `apps/app-windows-macos.spec.json` drives TextEdit File→New's second
  document. It covers a title-regex find, a window-element screenshot, a
  single-window close, which is the live `_XCUI:CloseWindow` verification, and
  survivor typing.

## Pros and Cons of the Options

### Windows: driver title switch vs. self-matched handle probe (chosen: probe)

- Driver title switch. Good: one call. Bad: the title branch never foregrounds,
  from the NaN bug, so input lands in the wrong window. A miss burns a
  10-second internal retry, and there's no regex.
- Handle probe (chosen). Good: correct foregrounding, through the handle
  branch. Regex and exact semantics are identical to the browser grammar, per
  `matchesExpectedOutput`, and pid filtering is possible. Bad: more
  round-trips, bounded by the candidate set.

### Windows adoption: unfiltered vs. pid-filtered (chosen: pid-filtered)

- Unfiltered. Good: no pid read. Bad: `-1` and title matches can adopt another
  process's window, since handles are desktop-global.
- Pid-filtered (chosen). Good: selectors mean "this app's windows". Bad: it
  depends on the `ProcessId` attribute, and degrades to unfiltered when that's
  unreadable, which is documented.

### Mobile: tolerate vs. FAIL (chosen: FAIL)

- Tolerating index 0 or -1 as "the one window" would make specs silently
  platform-dependent. The shared FAIL names the fix, which is to omit `window`.
  It keeps the schema shape available if a future phase gains real handles.
