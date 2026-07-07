// App window selectors on desktop app surfaces (ADR 01036).
//
// Two driver models, one grammar (the shared window selector: title string |
// {name}/{title} criteria with /regex/ | negative index for "newest"):
//
// - Windows (NovaWindows) — "switch-then-act". The session has ONE root
//   window; switchToWindow(handle) re-roots it and everything (finds, rect,
//   screenshot) follows. Handles are DESKTOP-GLOBAL in Z-order, so windows
//   are adopted into per-surface state filtered by the root element's
//   ProcessId against the app's pid (best-effort — unfiltered adoption when
//   the attribute can't be read). The driver's switch-by-TITLE branch is
//   never used: it has a trySetForegroundWindow(NaN) bug and burns a 20×500ms
//   internal retry on misses — we probe by handle and match titles ourselves.
//
// - macOS (Mac2) — "window-as-element". There are no window routes at all;
//   an app's windows are XCUIElementTypeWindow elements of the app-rooted
//   tree. A selected window is a held element: finds chain under it, its
//   rect is the window rect (absolute points), element screenshot captures
//   it. Elements go stale when windows close — the sticky state revalidates
//   and re-resolves by stored title once.
//
// - Mobile (android/ios) — single-window; every selector FAILs with one
//   shared message.
//
// Sticky semantics (the shared surface contract): resolving a window updates
// the surface's ACTIVE window; later steps without `window` act on it. On
// Windows the session root is inherently sticky; on macOS the element is
// stored on the surface entry.

import { matchesExpectedOutput } from "../utils.js";
import { isMobileTargetPlatform } from "./mobilePlatform.js";

export {
  snapshotAppWindows,
  resolveAppWindow,
  activeAppWindow,
  defaultAppWindow,
  appWindowRect,
  appWindowScreenshot,
  scopedFindRoot,
  closeAppWindow,
  unsupportedWindowSelectorMessage,
  rewriteXPathForScopedFind,
};

export type AppWindowTarget =
  | { kind: "switched" }
  | { kind: "element"; element: any; title: string };

type ResolveResult =
  | { ok: true; target: AppWindowTarget }
  | { ok: false; message: string };

type CloseResult =
  | { ok: true; closed: boolean }
  | { ok: false; message: string };

const MAC_WINDOW_XPATH = "//XCUIElementTypeWindow";
const MAC_CLOSE_BUTTON_XPATH =
  './/XCUIElementTypeButton[@identifier="_XCUI:CloseWindow"]';
// Mac2 "macos: keys" modifier flag for Command (XCUIKeyModifierCommand).
const MAC_COMMAND_MODIFIER = 1 << 20;
const RESOLVE_POLL_MS = 250;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// One wording source for the mobile single-window rejection, so every
// consumer (find/type/screenshot/record/swipe/closeSurface) FAILs with the
// same sentence and tests pin one string.
function unsupportedWindowSelectorMessage(platform: string): string {
  return `${platform} app surfaces are single-window; window selectors aren't supported there — omit \`window\` to act on the app.`;
}

function windowsIndexUnsupportedMessage(): string {
  return `Window index selectors aren't supported on Windows app surfaces — the Windows driver can't enumerate an app's windows in creation order. Select by title (e.g. {"title": "/Open/"}) or use -1 for the newest window.`;
}

function noMatchMessage(
  selector: any,
  entryName: string,
  timeoutMs: number,
  seenTitles: string[]
): string {
  return `No app window matched ${JSON.stringify(selector)} on surface "${entryName}" within ${timeoutMs}ms. Windows seen: ${
    seenTitles.length > 0 ? seenTitles.join(", ") : "(none)"
  }.`;
}

function lastWindowRefusalMessage(entryName: string): string {
  return `Refusing to close the last window of app surface "${entryName}" — that would end the app. Close the whole surface instead ({"closeSurface": {"app": "${entryName}"}}).`;
}

// Anchor an absolute XPath to a scope element: a W3C element-scoped find
// evaluates `//X` against the WHOLE document, so the compiled app locators
// (which all start with `//`) must become `.//` to stay inside the window
// subtree. Non-XPath selectors (accessibility id `~…`) pass through.
function rewriteXPathForScopedFind(selector: string): string {
  if (typeof selector !== "string") return selector;
  if (selector.startsWith(".//")) return selector;
  if (selector.startsWith("//")) return `.${selector}`;
  if (selector.startsWith("(//")) return `(.${selector.slice(1)}`;
  return selector;
}

// A selector form we can't honor on Windows: non-negative index (there is no
// app-scoped creation order to index into).
function isNonNegativeIndexSelector(selector: any): boolean {
  if (typeof selector === "number" && selector >= 0) return true;
  if (
    selector &&
    typeof selector === "object" &&
    typeof selector.index === "number" &&
    selector.index >= 0
  ) {
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Windows (NovaWindows) — switch-then-act
// ---------------------------------------------------------------------------

// Read the ProcessId of the CURRENT root window, best-effort.
async function readCurrentRootPid(driver: any): Promise<number | null> {
  try {
    const root = await driver.$("/*");
    const raw = await root.getAttribute("ProcessId");
    const pid = Number(raw);
    return Number.isFinite(pid) && raw !== null && raw !== "" ? pid : null;
  } catch {
    return null;
  }
}

// Adopt new desktop windows that belong to this app (pid-filtered,
// best-effort) into entry.knownWindows; everything else is remembered as
// foreign so it's never probed again. Restores the original root.
async function syncWindowsHandles(entry: any): Promise<void> {
  const driver = entry.driver;
  entry.knownWindows = entry.knownWindows ?? [];
  entry.foreignWindows = entry.foreignWindows ?? new Set<string>();
  const all: string[] = await driver.getWindowHandles();
  // Drop dead handles from the known list (closed windows).
  entry.knownWindows = entry.knownWindows.filter((h: string) =>
    all.includes(h)
  );
  const unknown = all.filter(
    (h) => !entry.knownWindows.includes(h) && !entry.foreignWindows.has(h)
  );
  if (unknown.length === 0) return;
  const original = await driver.getWindowHandle();
  for (const handle of unknown) {
    try {
      await driver.switchToWindow(handle);
      const pid = await readCurrentRootPid(driver);
      // Adopt on pid match — or best-effort when either side is unreadable
      // (documented caveat: adoption degrades to an unfiltered diff).
      if (pid === null || entry.appPid == null || pid === entry.appPid) {
        entry.knownWindows.push(handle);
      } else {
        entry.foreignWindows.add(handle);
      }
    } catch {
      // Window vanished mid-probe — ignore.
    }
  }
  try {
    await driver.switchToWindow(original);
  } catch {
    // The original root itself vanished; stay where we are.
  }
}

// Match the selector against this app's known windows. Switches through
// candidates to read titles; on success LEAVES the session rooted at the
// match (sticky by construction). Returns the matched handle or null, plus
// the titles seen (for the no-match message).
async function matchWindowsSelector(
  entry: any,
  selector: any
): Promise<{ handle: string | null; seenTitles: string[] }> {
  const driver = entry.driver;
  const known: string[] = entry.knownWindows ?? [];
  const seenTitles: string[] = [];
  // Negative index: from the end of the adoption-ordered known list — the
  // most recently adopted window is the newest (-1, the dialog case).
  if (typeof selector === "number" && selector < 0) {
    const handle = known.at(selector) ?? null;
    return { handle, seenTitles };
  }
  const wantExact =
    typeof selector === "string"
      ? selector.trim()
      : typeof selector?.name === "string"
        ? selector.name
        : null;
  const wantTitle =
    selector && typeof selector === "object" && selector.title !== undefined
      ? selector.title
      : null;
  for (const handle of known) {
    try {
      await driver.switchToWindow(handle);
      const title = String(await driver.getTitle());
      seenTitles.push(title);
      if (wantExact !== null && title !== wantExact) continue;
      if (wantTitle !== null && !matchesExpectedOutput(title, wantTitle))
        continue;
      if (wantExact === null && wantTitle === null) continue;
      return { handle, seenTitles };
    } catch {
      // Window vanished — skip.
    }
  }
  return { handle: null, seenTitles };
}

async function resolveWindowsWindow({
  entry,
  selector,
  timeoutMs,
}: {
  entry: any;
  selector: any;
  timeoutMs: number;
}): Promise<ResolveResult> {
  if (isNonNegativeIndexSelector(selector)) {
    return { ok: false, message: windowsIndexUnsupportedMessage() };
  }
  const driver = entry.driver;
  const original = await driver.getWindowHandle();
  const deadline = Date.now() + timeoutMs;
  let seenTitles: string[] = [];
  for (;;) {
    await syncWindowsHandles(entry);
    const match = await matchWindowsSelector(entry, selector);
    if (match.handle) {
      await driver.switchToWindow(match.handle);
      entry.activeWindow = { handle: match.handle };
      return { ok: true, target: { kind: "switched" } };
    }
    seenTitles = match.seenTitles;
    // Restore the original root between attempts (and before failing) so a
    // no-match probe never leaves the session rooted somewhere surprising.
    try {
      await driver.switchToWindow(original);
    } catch {
      /* original gone */
    }
    if (Date.now() >= deadline) break;
    await sleep(RESOLVE_POLL_MS);
  }
  return {
    ok: false,
    message: noMatchMessage(selector, entry.name, timeoutMs, seenTitles),
  };
}

async function closeWindowsWindow({
  entry,
  selector,
}: {
  entry: any;
  selector: any;
}): Promise<CloseResult> {
  if (isNonNegativeIndexSelector(selector)) {
    return { ok: false, message: windowsIndexUnsupportedMessage() };
  }
  const driver = entry.driver;
  const original = await driver.getWindowHandle();
  await syncWindowsHandles(entry);
  const match = await matchWindowsSelector(entry, selector);
  if (!match.handle) {
    // Idempotent: the window is already gone (or never existed).
    try {
      await driver.switchToWindow(original);
    } catch {
      /* original gone */
    }
    return { ok: true, closed: false };
  }
  if ((entry.knownWindows?.length ?? 0) <= 1) {
    try {
      await driver.switchToWindow(original);
    } catch {
      /* original gone */
    }
    return { ok: false, message: lastWindowRefusalMessage(entry.name) };
  }
  // matchWindowsSelector left the session rooted at the match.
  await driver.execute("windows: closeApp");
  entry.knownWindows = (entry.knownWindows ?? []).filter(
    (h: string) => h !== match.handle
  );
  if (entry.activeWindow?.handle === match.handle) delete entry.activeWindow;
  // Switch to a survivor: prefer the app's main window, else the most
  // recently adopted survivor. Teardown closes whatever the root is, so the
  // session must never be left rooted at a dead handle.
  const survivor =
    entry.mainWindowHandle &&
    entry.knownWindows.includes(entry.mainWindowHandle)
      ? entry.mainWindowHandle
      : entry.knownWindows.at(-1);
  if (survivor) {
    try {
      await driver.switchToWindow(survivor);
    } catch {
      /* best-effort */
    }
  }
  return { ok: true, closed: true };
}

// ---------------------------------------------------------------------------
// macOS (Mac2) — window-as-element
// ---------------------------------------------------------------------------

type MacWindowCandidate = { element: any; title: string; frameKey: string };

async function enumerateMacWindows(entry: any): Promise<MacWindowCandidate[]> {
  const driver = entry.driver;
  const elements: any[] = await driver.$$(MAC_WINDOW_XPATH);
  const candidates: MacWindowCandidate[] = [];
  for (const element of elements) {
    try {
      const title = String((await element.getAttribute("title")) ?? "");
      let frameKey = "";
      try {
        const rect = await driver.getElementRect(element.elementId);
        frameKey = JSON.stringify(rect);
      } catch {
        /* rect unavailable — title-only key */
      }
      candidates.push({ element, title, frameKey });
    } catch {
      // Stale element — skip.
    }
  }
  return candidates;
}

function macBaselineKeys(candidates: MacWindowCandidate[]): string[] {
  return candidates.map((c) => `${c.title} ${c.frameKey}`);
}

function matchMacSelector(
  candidates: MacWindowCandidate[],
  selector: any,
  baseline: string[] | undefined
): MacWindowCandidate | null {
  if (typeof selector === "number") {
    if (selector >= 0) return candidates[selector] ?? null;
    if (selector === -1) {
      // Newest = the window that's new since the baseline (set-diff on
      // title+frame). Exactly one new → it; several → the last in query
      // order; none → last in query order (best-effort, the browser -1
      // semantics degraded to what the driver exposes).
      const base = new Set(baseline ?? []);
      const fresh = candidates.filter(
        (c) => !base.has(`${c.title} ${c.frameKey}`)
      );
      if (fresh.length > 0) return fresh.at(-1)!;
      return candidates.at(-1) ?? null;
    }
    return candidates.at(selector) ?? null;
  }
  const wantExact =
    typeof selector === "string"
      ? selector.trim()
      : typeof selector?.name === "string"
        ? selector.name
        : null;
  const wantTitle =
    selector && typeof selector === "object" && selector.title !== undefined
      ? selector.title
      : null;
  for (const candidate of candidates) {
    if (wantExact !== null && candidate.title !== wantExact) continue;
    if (
      wantTitle !== null &&
      !matchesExpectedOutput(candidate.title, wantTitle)
    )
      continue;
    if (wantExact === null && wantTitle === null) continue;
    return candidate;
  }
  return null;
}

async function resolveMacWindow({
  entry,
  selector,
  timeoutMs,
}: {
  entry: any;
  selector: any;
  timeoutMs: number;
}): Promise<ResolveResult> {
  const deadline = Date.now() + timeoutMs;
  let seenTitles: string[] = [];
  for (;;) {
    const candidates = await enumerateMacWindows(entry);
    seenTitles = candidates.map((c) => c.title);
    const match = matchMacSelector(candidates, selector, entry.windowBaseline);
    if (match) {
      entry.activeWindow = { element: match.element, title: match.title };
      return {
        ok: true,
        target: { kind: "element", element: match.element, title: match.title },
      };
    }
    if (Date.now() >= deadline) break;
    await sleep(RESOLVE_POLL_MS);
  }
  return {
    ok: false,
    message: noMatchMessage(selector, entry.name, timeoutMs, seenTitles),
  };
}

async function closeMacWindow({
  entry,
  selector,
}: {
  entry: any;
  selector: any;
}): Promise<CloseResult> {
  const driver = entry.driver;
  const candidates = await enumerateMacWindows(entry);
  const match = matchMacSelector(candidates, selector, entry.windowBaseline);
  if (!match) return { ok: true, closed: false };
  if (candidates.length <= 1) {
    return { ok: false, message: lastWindowRefusalMessage(entry.name) };
  }
  // Preferred: the stoplight close button inside the window (the same
  // `_XCUI:` identifier family WDA itself clicks for fullscreen/minimize).
  let clicked = false;
  try {
    const button = await match.element.$(MAC_CLOSE_BUTTON_XPATH);
    if (await button.isExisting()) {
      await button.click();
      clicked = true;
    }
  } catch {
    /* fall through to the keyboard fallback */
  }
  if (!clicked) {
    // Fallback: focus the window via a title-bar click (the practical raise
    // on macOS — there is no per-window AXRaise without insecure server
    // features), then Cmd+W.
    try {
      const rect = await driver.getElementRect(match.element.elementId);
      await driver.execute("macos: click", {
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + 10),
      });
    } catch {
      /* best-effort raise */
    }
    await driver.execute("macos: keys", {
      keys: [{ key: "w", modifierFlags: MAC_COMMAND_MODIFIER }],
    });
  }
  if (entry.activeWindow?.title === match.title) delete entry.activeWindow;
  // Refresh the baseline so a later -1 doesn't resolve to a ghost.
  try {
    entry.windowBaseline = macBaselineKeys(await enumerateMacWindows(entry));
  } catch {
    /* best-effort */
  }
  return { ok: true, closed: true };
}

// ---------------------------------------------------------------------------
// Shared API (platform dispatch)
// ---------------------------------------------------------------------------

// Capture the window baseline for a freshly opened app surface. Called by
// startAppSurface after registration; all fields are best-effort.
async function snapshotAppWindows(entry: any): Promise<void> {
  const platform = entry.platform ?? "windows";
  if (isMobileTargetPlatform(platform)) return;
  try {
    if (platform === "mac") {
      entry.windowBaseline = macBaselineKeys(await enumerateMacWindows(entry));
      return;
    }
    // Windows: the current root is the app's main window; every other
    // desktop window present at baseline belongs to someone else.
    const driver = entry.driver;
    const main = await driver.getWindowHandle();
    entry.mainWindowHandle = main;
    entry.knownWindows = [main];
    entry.foreignWindows = new Set<string>(
      (await driver.getWindowHandles()).filter((h: string) => h !== main)
    );
    entry.appPid = await readCurrentRootPid(driver);
  } catch {
    // Baseline capture is best-effort: without it, -1 degrades and pid
    // filtering is skipped, both documented.
  }
}

// Resolve a window selector on an app surface and make it sticky (the
// surface's active window). Retries until timeoutMs.
async function resolveAppWindow({
  entry,
  selector,
  timeoutMs = 5000,
}: {
  entry: any;
  selector: any;
  timeoutMs?: number;
}): Promise<ResolveResult> {
  const platform = entry.platform ?? "windows";
  if (isMobileTargetPlatform(platform)) {
    return { ok: false, message: unsupportedWindowSelectorMessage(platform) };
  }
  if (platform === "mac") return resolveMacWindow({ entry, selector, timeoutMs });
  return resolveWindowsWindow({ entry, selector, timeoutMs });
}

// The sticky window for steps WITHOUT a selector. Windows: null — the
// session root already IS the sticky window. macOS: revalidate the held
// element (stale → one re-resolve by stored exact title → else clear).
async function activeAppWindow(entry: any): Promise<AppWindowTarget | null> {
  const platform = entry.platform ?? "windows";
  if (platform !== "mac") return null;
  const held = entry.activeWindow;
  if (!held?.element) return null;
  try {
    if (await held.element.isExisting()) {
      return { kind: "element", element: held.element, title: held.title };
    }
  } catch {
    /* stale — re-resolve below */
  }
  const candidates = await enumerateMacWindows(entry);
  const again = candidates.find((c) => c.title === held.title);
  if (again) {
    entry.activeWindow = { element: again.element, title: again.title };
    return { kind: "element", element: again.element, title: again.title };
  }
  delete entry.activeWindow;
  return null;
}

// The window a selector-less capture/crop should use. macOS: the sticky
// window, else the app's first window element (documented heuristic).
// Windows: null — the current root is already the window.
async function defaultAppWindow(entry: any): Promise<AppWindowTarget | null> {
  const platform = entry.platform ?? "windows";
  if (platform !== "mac") return null;
  const active = await activeAppWindow(entry);
  if (active) return active;
  const candidates = await enumerateMacWindows(entry);
  const first = candidates[0];
  if (!first) return null;
  return { kind: "element", element: first.element, title: first.title };
}

// The selected window's rect in the driver's units — Windows: current root
// via getWindowRect (physical px, scale 1); macOS: the window ELEMENT's rect
// (absolute points; the caller applies the capture-frame-derived scale).
async function appWindowRect(
  entry: any,
  target?: AppWindowTarget | null
): Promise<{ x: number; y: number; w: number; h: number } | null> {
  const platform = entry.platform ?? "windows";
  if (isMobileTargetPlatform(platform)) return null;
  const driver = entry.driver;
  let rect: any;
  if (platform === "mac") {
    const fallback =
      target && target.kind === "element" ? null : await defaultAppWindow(entry);
    const element =
      target && target.kind === "element"
        ? target.element
        : fallback && fallback.kind === "element"
          ? fallback.element
          : null;
    if (!element) return null;
    rect = await driver.getElementRect(element.elementId);
  } else {
    rect = await driver.getWindowRect();
  }
  const finite = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v);
  if (
    !rect ||
    !finite(rect.x) ||
    !finite(rect.y) ||
    !finite(rect.width) ||
    !finite(rect.height) ||
    rect.width <= 0 ||
    rect.height <= 0
  ) {
    return null;
  }
  return { x: rect.x, y: rect.y, w: rect.width, h: rect.height };
}

// Capture the selected window to a file. Windows: the driver screenshot
// already captures exactly the current root window. macOS: element
// screenshot of the window element.
async function appWindowScreenshot(
  entry: any,
  target: AppWindowTarget | null | undefined,
  filePath: string
): Promise<void> {
  const platform = entry.platform ?? "windows";
  if (platform === "mac") {
    const fallback =
      target && target.kind === "element" ? null : await defaultAppWindow(entry);
    const element =
      target && target.kind === "element"
        ? target.element
        : fallback && fallback.kind === "element"
          ? fallback.element
          : null;
    if (!element) throw new Error("No app window is available to capture.");
    await element.saveScreenshot(filePath);
    return;
  }
  await entry.driver.saveScreenshot(filePath);
}

// The root for element finds scoped to the selected window: the window
// element on macOS; null on Windows (the session root IS the window).
function scopedFindRoot(entry: any, target: AppWindowTarget | null): any {
  if (target && target.kind === "element") return target.element;
  return null;
}

// Close ONE window of an app surface. Absent selector match is an
// idempotent no-op ({closed: false}); closing the LAST window is refused
// (that would end the app — bare closeSurface does that).
async function closeAppWindow({
  entry,
  selector,
  timeoutMs = 5000,
}: {
  entry: any;
  selector: any;
  timeoutMs?: number;
}): Promise<CloseResult> {
  void timeoutMs;
  const platform = entry.platform ?? "windows";
  if (isMobileTargetPlatform(platform)) {
    return { ok: false, message: unsupportedWindowSelectorMessage(platform) };
  }
  if (platform === "mac") return closeMacWindow({ entry, selector });
  return closeWindowsWindow({ entry, selector });
}
