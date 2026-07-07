// App window selectors (ADR 01036): the per-platform window strategy module.
// Windows (NovaWindows) is "switch-then-act" — switchToWindow(handle) re-roots
// the session; handles are desktop-global, so adoption is pid-filtered and the
// driver's buggy title-switch branch is never used (handles only). macOS
// (Mac2) is "window-as-element" — windows are XCUIElementTypeWindow elements,
// finds chain under them, and there are no window handles at all. Mobile is
// single-window and FAILs with one shared message.
import assert from "node:assert/strict";
import fs from "node:fs";

import {
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
} from "../dist/core/tests/appWindows.js";

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

// A NovaWindows-shaped fake: desktop-global window table, one current root.
// `windows`: [{ handle, title, pid, rect? }]. Mutate the array to simulate
// windows opening; entries gain `closed: true` via "windows: closeApp".
function fakeWinDriver(windows) {
  const state = { current: windows[0].handle, switchArgs: [], executed: [] };
  const live = () => windows.filter((w) => !w.closed);
  const byHandle = (h) => live().find((w) => w.handle === h);
  return {
    state,
    windows,
    async getWindowHandles() {
      return live().map((w) => w.handle);
    },
    async getWindowHandle() {
      return state.current;
    },
    async switchToWindow(arg) {
      state.switchArgs.push(arg);
      const w = byHandle(arg);
      if (!w) throw new Error(`no such window: ${arg}`);
      state.current = w.handle;
    },
    async getTitle() {
      return byHandle(state.current)?.title ?? "";
    },
    async $(_selector) {
      const w = byHandle(state.current);
      return {
        async getAttribute(name) {
          if (name === "ProcessId") return String(w?.pid ?? "");
          return null;
        },
      };
    },
    async execute(cmd) {
      state.executed.push(cmd);
      if (cmd === "windows: closeApp") {
        const w = byHandle(state.current);
        if (w) w.closed = true;
      }
    },
    async getWindowRect() {
      const w = byHandle(state.current);
      return w?.rect ?? { x: 1, y: 2, width: 300, height: 200 };
    },
    async saveScreenshot(p) {
      state.screenshotPath = p;
    },
  };
}

// A Mac2-shaped fake: app-rooted window elements. `windows`: [{ id, title,
// rect, stale?, closed?, closeButton? }]. closeButton: true gives the window
// a findable `_XCUI:CloseWindow` stoplight button.
function fakeMacDriver(windows) {
  const state = { executed: [], clicks: [], screenshots: [] };
  const makeButton = (w) => ({
    async isExisting() {
      return Boolean(w.closeButton);
    },
    async click() {
      state.clicks.push(`close:${w.id}`);
      w.closed = true;
    },
  });
  const makeEl = (w) => ({
    elementId: w.id,
    async getAttribute(name) {
      if (w.stale) throw new Error("stale element reference");
      if (name === "title") return w.title;
      return null;
    },
    async isExisting() {
      return !w.stale && !w.closed;
    },
    async $(selector) {
      state.lastScopedSelector = selector;
      return makeButton(w);
    },
    async saveScreenshot(p) {
      state.screenshots.push({ id: w.id, path: p });
    },
  });
  return {
    state,
    windows,
    async $$(_xpath) {
      return windows.filter((w) => !w.closed).map(makeEl);
    },
    async getElementRect(id) {
      const w = windows.find((x) => x.id === id);
      return w?.rect ?? { x: 0, y: 0, width: 10, height: 10 };
    },
    async execute(cmd, opts) {
      state.executed.push({ cmd, opts });
    },
  };
}

function winEntry(driver, overrides = {}) {
  return {
    name: "odbc",
    appId: "odbcad32.exe",
    driver,
    launchedByUs: true,
    platform: "windows",
    ...overrides,
  };
}

function macEntry(driver, overrides = {}) {
  return {
    name: "TextEdit",
    appId: "com.apple.TextEdit",
    driver,
    launchedByUs: true,
    platform: "mac",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Windows — switch-then-act
// ---------------------------------------------------------------------------

describe("appWindows: Windows (switch-then-act)", function () {
  it("snapshot captures the main handle and app pid; other windows are probed lazily", async function () {
    // Baseline windows are NOT pre-damned as foreign: the app may have
    // launched with several of its own windows open (splash + main, multiple
    // documents). They stay unprobed until a selector is actually used.
    const driver = fakeWinDriver([
      { handle: "0xA", title: "ODBC Data Source Administrator", pid: 100 },
      { handle: "0xF", title: "Some other app", pid: 999 },
    ]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    assert.equal(entry.mainWindowHandle, "0xA");
    assert.equal(entry.appPid, 100);
    assert.deepEqual(entry.knownWindows, ["0xA"]);
    assert.equal(entry.foreignWindows.size, 0);
    // A selector probe classifies the other-pid baseline window as foreign.
    const res = await resolveAppWindow({
      entry,
      selector: { title: "Nonexistent" },
      timeoutMs: 300,
    });
    assert.equal(res.ok, false);
    assert.ok(entry.foreignWindows.has("0xF"));
  });

  it("adopts the app's own pre-existing windows (launch splash/extra document) on first selector use", async function () {
    const driver = fakeWinDriver([
      { handle: "0xA", title: "Main", pid: 100 },
      // The app's own second window, already open when the surface snapshot
      // ran — it must stay adoptable, not be permanently foreign.
      { handle: "0xB", title: "Welcome Splash", pid: 100 },
      { handle: "0xF", title: "Some other app", pid: 999 },
    ]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    const res = await resolveAppWindow({
      entry,
      selector: { title: "Welcome Splash" },
      timeoutMs: 1000,
    });
    assert.equal(res.ok, true);
    assert.equal(driver.state.current, "0xB");
    assert.ok(entry.knownWindows.includes("0xB"));
    assert.ok(entry.foreignWindows.has("0xF"));
  });

  it("-1 prefers a window opened after launch over the app's pre-existing ones", async function () {
    // Baseline same-pid windows adopt as OLD (right after main in adoption
    // order), so -1 = newest still lands on the post-launch dialog even when
    // both are probed in the same sweep.
    const driver = fakeWinDriver([
      { handle: "0xA", title: "Main", pid: 100 },
      { handle: "0xB", title: "Welcome Splash", pid: 100 },
    ]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    driver.windows.push({ handle: "0xC", title: "Dialog", pid: 100 });
    const res = await resolveAppWindow({ entry, selector: -1, timeoutMs: 1000 });
    assert.equal(res.ok, true);
    assert.equal(driver.state.current, "0xC");
    assert.deepEqual(entry.knownWindows, ["0xA", "0xB", "0xC"]);
  });

  it("resolves a title regex to a new same-pid window and sticks (session root)", async function () {
    const driver = fakeWinDriver([
      { handle: "0xA", title: "ODBC Data Source Administrator", pid: 100 },
    ]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    driver.windows.push({
      handle: "0xB",
      title: "Create New Data Source",
      pid: 100,
    });
    const res = await resolveAppWindow({
      entry,
      selector: { title: "/Data Source$/" },
      timeoutMs: 1000,
    });
    assert.equal(res.ok, true);
    assert.equal(res.target.kind, "switched");
    assert.equal(driver.state.current, "0xB");
    assert.equal(entry.activeWindow.handle, "0xB");
    // NaN-foreground-bug avoidance: switchToWindow only ever receives real
    // handles, never title strings.
    for (const arg of driver.state.switchArgs) {
      assert.ok(
        driver.windows.some((w) => w.handle === arg),
        `switchToWindow called with a non-handle: ${arg}`
      );
    }
  });

  it("ignores another process's window even when its title matches", async function () {
    const driver = fakeWinDriver([
      { handle: "0xA", title: "Main", pid: 100 },
    ]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    driver.windows.push({ handle: "0xF2", title: "Create New Data Source", pid: 999 });
    const res = await resolveAppWindow({
      entry,
      selector: { title: "Create New Data Source" },
      timeoutMs: 300,
    });
    assert.equal(res.ok, false);
    assert.match(res.message, /No app window matched/);
    assert.ok(entry.foreignWindows.has("0xF2"));
    // Root restored after the failed probe.
    assert.equal(driver.state.current, "0xA");
  });

  it("resolves -1 to the newest adopted window", async function () {
    const driver = fakeWinDriver([{ handle: "0xA", title: "Main", pid: 100 }]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    driver.windows.push({ handle: "0xB", title: "Dialog", pid: 100 });
    const res = await resolveAppWindow({ entry, selector: -1, timeoutMs: 1000 });
    assert.equal(res.ok, true);
    assert.equal(driver.state.current, "0xB");
  });

  it("FAILs non-negative index selectors with title/-1 guidance", async function () {
    const driver = fakeWinDriver([{ handle: "0xA", title: "Main", pid: 100 }]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    for (const selector of [0, 1, { index: 2 }]) {
      const res = await resolveAppWindow({ entry, selector, timeoutMs: 300 });
      assert.equal(res.ok, false, JSON.stringify(selector));
      assert.match(res.message, /index selectors aren't supported on Windows/i);
      assert.match(res.message, /title|newest/);
    }
  });

  it("reports the windows it saw on a no-match FAIL and restores the root", async function () {
    const driver = fakeWinDriver([
      { handle: "0xA", title: "Main", pid: 100 },
      { handle: "0xB", title: "Dialog", pid: 100 },
    ]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    const res = await resolveAppWindow({
      entry,
      selector: { title: "Nonexistent" },
      timeoutMs: 300,
    });
    assert.equal(res.ok, false);
    assert.match(res.message, /No app window matched/);
    assert.match(res.message, /Window titles seen:.*Main/);
    assert.equal(driver.state.current, "0xA");
  });

  it("closes one window and switches back to a survivor", async function () {
    const driver = fakeWinDriver([{ handle: "0xA", title: "Main", pid: 100 }]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    driver.windows.push({ handle: "0xB", title: "Dialog", pid: 100 });
    const res = await closeAppWindow({ entry, selector: "Dialog" });
    assert.deepEqual(res, { ok: true, closed: true });
    assert.ok(driver.state.executed.includes("windows: closeApp"));
    assert.equal(driver.state.current, "0xA");
    assert.equal(driver.windows.find((w) => w.handle === "0xB").closed, true);
    assert.ok(!entry.knownWindows.includes("0xB"));
  });

  it("closes the newest window (selector -1) rooted at the match, not the current root", async function () {
    // The negative-index path in matchWindowsSelector returns the handle
    // without switching, and syncWindowsHandles restores the session to the
    // original root. closeWindowsWindow must switch to the match before
    // `windows: closeApp` or it closes the wrong (original) window. This is a
    // clean-session close (no preceding sticky `find`), so the session sits at
    // the main window — exactly the scenario the E2E fixture can't reproduce.
    const driver = fakeWinDriver([{ handle: "0xA", title: "Main", pid: 100 }]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    driver.windows.push({ handle: "0xB", title: "Dialog", pid: 100 });
    // Adopt the dialog into known windows (as a live app would after opening
    // it), but leave the session rooted at Main — no sticky selection.
    await resolveAppWindow({ entry, selector: -1, timeoutMs: 1000 });
    await driver.switchToWindow("0xA");
    const res = await closeAppWindow({ entry, selector: -1 });
    assert.deepEqual(res, { ok: true, closed: true });
    assert.ok(driver.state.executed.includes("windows: closeApp"));
    // The DIALOG (0xB), not Main (0xA), was closed.
    assert.equal(driver.windows.find((w) => w.handle === "0xB").closed, true);
    assert.equal(driver.windows.find((w) => w.handle === "0xA").closed, undefined);
    // And the session ends rooted at the surviving main window.
    assert.equal(driver.state.current, "0xA");
  });

  it("clears mainWindowHandle when the main window itself is closed", async function () {
    // Closing main while a dialog survives is allowed (only the LAST window
    // is refused). The stale handle must not linger: the teardown re-root
    // guard would otherwise switch to a dead window before deleteSession.
    const driver = fakeWinDriver([{ handle: "0xA", title: "Main", pid: 100 }]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    driver.windows.push({ handle: "0xB", title: "Dialog", pid: 100 });
    // Adopt the dialog first so it's a known survivor.
    await resolveAppWindow({ entry, selector: "Dialog", timeoutMs: 1000 });
    const res = await closeAppWindow({ entry, selector: "Main" });
    assert.deepEqual(res, { ok: true, closed: true });
    assert.equal(entry.mainWindowHandle, undefined);
    assert.equal(driver.state.current, "0xB");
  });

  it("refuses to close the last window (that would end the app)", async function () {
    const driver = fakeWinDriver([{ handle: "0xA", title: "Main", pid: 100 }]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    const res = await closeAppWindow({ entry, selector: "Main" });
    assert.equal(res.ok, false);
    assert.match(res.message, /Refusing to close the last window/);
    assert.match(res.message, /closeSurface/);
  });

  it("treats a selector that matches nothing as an idempotent no-op close", async function () {
    const driver = fakeWinDriver([{ handle: "0xA", title: "Main", pid: 100 }]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    driver.windows.push({ handle: "0xB", title: "Dialog", pid: 100 });
    const res = await closeAppWindow({ entry, selector: "Long gone" });
    assert.deepEqual(res, { ok: true, closed: false });
  });

  it("appWindowRect returns the current root's rect; activeAppWindow is null (root is sticky)", async function () {
    const driver = fakeWinDriver([
      { handle: "0xA", title: "Main", pid: 100, rect: { x: 5, y: 6, width: 640, height: 480 } },
    ]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    assert.deepEqual(await appWindowRect(entry), { x: 5, y: 6, w: 640, h: 480 });
    assert.equal(await activeAppWindow(entry), null);
    assert.equal(scopedFindRoot(entry, { kind: "switched" }), null);
  });

  it("appWindowRect returns null for missing, non-finite, or non-positive geometry", async function () {
    for (const rect of [
      null,
      { x: NaN, y: 0, width: 100, height: 100 },
      { x: 0, y: Infinity, width: 100, height: 100 },
      { x: 0, y: 0, width: 0, height: 100 },
      { x: 0, y: 0, width: 100, height: -5 },
      { x: 0, y: 0, width: "100", height: 100 },
    ]) {
      const entry = winEntry({ getWindowRect: async () => rect });
      assert.equal(await appWindowRect(entry), null, JSON.stringify(rect));
    }
  });

  it("appWindowScreenshot captures via the driver (root window capture)", async function () {
    const driver = fakeWinDriver([{ handle: "0xA", title: "Main", pid: 100 }]);
    const entry = winEntry(driver);
    await snapshotAppWindows(entry);
    await appWindowScreenshot(entry, { kind: "switched" }, "out.png");
    assert.equal(driver.state.screenshotPath, "out.png");
  });
});

// ---------------------------------------------------------------------------
// macOS — window-as-element
// ---------------------------------------------------------------------------

describe("appWindows: macOS (window-as-element)", function () {
  it("snapshot records a (title, frame) baseline", async function () {
    const driver = fakeMacDriver([
      { id: "w1", title: "Untitled", rect: { x: 0, y: 0, width: 600, height: 400 } },
    ]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    assert.equal(entry.windowBaseline.length, 1);
  });

  it("resolves by exact title, title regex, and query-order index", async function () {
    const driver = fakeMacDriver([
      { id: "w1", title: "Untitled", rect: { x: 0, y: 0, width: 1, height: 1 } },
      { id: "w2", title: "Untitled 2", rect: { x: 5, y: 5, width: 2, height: 2 } },
    ]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);

    const byString = await resolveAppWindow({ entry, selector: "Untitled 2", timeoutMs: 500 });
    assert.equal(byString.ok, true);
    assert.equal(byString.target.kind, "element");
    assert.equal(byString.target.element.elementId, "w2");
    assert.equal(entry.activeWindow.title, "Untitled 2");

    const byRegex = await resolveAppWindow({ entry, selector: { title: "/^Untitled$/" }, timeoutMs: 500 });
    assert.equal(byRegex.ok, true);
    assert.equal(byRegex.target.element.elementId, "w1");

    const byIndex = await resolveAppWindow({ entry, selector: 1, timeoutMs: 500 });
    assert.equal(byIndex.ok, true);
    assert.equal(byIndex.target.element.elementId, "w2");
  });

  it("resolves -1 to the window that's new since the baseline", async function () {
    const driver = fakeMacDriver([
      { id: "w1", title: "Untitled", rect: { x: 0, y: 0, width: 1, height: 1 } },
    ]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    driver.windows.push({
      id: "w2",
      title: "Untitled 2",
      rect: { x: 9, y: 9, width: 3, height: 3 },
    });
    const res = await resolveAppWindow({ entry, selector: -1, timeoutMs: 500 });
    assert.equal(res.ok, true);
    assert.equal(res.target.element.elementId, "w2");
  });

  it("activeAppWindow revalidates a stale element by its stored title", async function () {
    const w1 = { id: "w1", title: "Doc", rect: { x: 0, y: 0, width: 1, height: 1 } };
    const driver = fakeMacDriver([w1]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    await resolveAppWindow({ entry, selector: "Doc", timeoutMs: 500 });
    // The held element goes stale (window re-created with the same title).
    w1.stale = true;
    driver.windows.push({ id: "w1b", title: "Doc", rect: { x: 0, y: 0, width: 1, height: 1 } });
    const target = await activeAppWindow(entry);
    assert.ok(target);
    assert.equal(target.element.elementId, "w1b");
  });

  it("activeAppWindow clears when the stored window is gone for good", async function () {
    const w1 = { id: "w1", title: "Doc", rect: { x: 0, y: 0, width: 1, height: 1 } };
    const driver = fakeMacDriver([
      w1,
      { id: "w0", title: "Other", rect: { x: 0, y: 0, width: 1, height: 1 } },
    ]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    await resolveAppWindow({ entry, selector: "Doc", timeoutMs: 500 });
    w1.stale = true;
    w1.closed = true;
    const target = await activeAppWindow(entry);
    assert.equal(target, null);
    assert.equal(entry.activeWindow, undefined);
  });

  it("defaultAppWindow falls back to the first window element", async function () {
    const driver = fakeMacDriver([
      { id: "w1", title: "Untitled", rect: { x: 0, y: 0, width: 1, height: 1 } },
      { id: "w2", title: "Untitled 2", rect: { x: 0, y: 0, width: 1, height: 1 } },
    ]);
    const entry = macEntry(driver);
    const target = await defaultAppWindow(entry);
    assert.ok(target);
    assert.equal(target.kind, "element");
    assert.equal(target.element.elementId, "w1");
  });

  it("activeAppWindow degrades to null (not a rejection) when window enumeration throws", async function () {
    // Selector-less callers (record's crop, find, type, swipe) await this
    // without their own catch — a driver hiccup during the stale re-resolve
    // must not bubble as an unhandled rejection.
    const w1 = { id: "w1", title: "Doc", rect: { x: 0, y: 0, width: 1, height: 1 } };
    const driver = fakeMacDriver([w1]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    await resolveAppWindow({ entry, selector: "Doc", timeoutMs: 500 });
    w1.stale = true;
    driver.$$ = async () => {
      throw new Error("session deleted");
    };
    const target = await activeAppWindow(entry);
    assert.equal(target, null);
    // Transient enumeration failure: the held window is NOT cleared, so a
    // later call can still re-resolve it once the driver recovers.
    assert.ok(entry.activeWindow);
  });

  it("defaultAppWindow degrades to null when window enumeration throws", async function () {
    const driver = fakeMacDriver([]);
    driver.$$ = async () => {
      throw new Error("session deleted");
    };
    const entry = macEntry(driver);
    const target = await defaultAppWindow(entry);
    assert.equal(target, null);
  });

  it("appWindowRect uses the window ELEMENT rect (absolute points)", async function () {
    const driver = fakeMacDriver([
      { id: "w1", title: "Doc", rect: { x: 40, y: 50, width: 800, height: 600 } },
    ]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    const res = await resolveAppWindow({ entry, selector: "Doc", timeoutMs: 500 });
    assert.deepEqual(await appWindowRect(entry, res.target), {
      x: 40,
      y: 50,
      w: 800,
      h: 600,
    });
  });

  it("appWindowRect returns null (not a rejection) when the element rect read throws", async function () {
    // The selected window can go stale between resolution and the rect read
    // (the app closed it). Same null-degrade contract as the geometry
    // validation below it.
    const driver = fakeMacDriver([
      { id: "w1", title: "Doc", rect: { x: 40, y: 50, width: 800, height: 600 } },
    ]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    const res = await resolveAppWindow({ entry, selector: "Doc", timeoutMs: 500 });
    driver.getElementRect = async () => {
      throw new Error("stale element reference");
    };
    assert.equal(await appWindowRect(entry, res.target), null);
  });

  it("appWindowScreenshot captures the window element; scopedFindRoot returns it", async function () {
    const driver = fakeMacDriver([
      { id: "w1", title: "Doc", rect: { x: 0, y: 0, width: 1, height: 1 } },
    ]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    const res = await resolveAppWindow({ entry, selector: "Doc", timeoutMs: 500 });
    await appWindowScreenshot(entry, res.target, "win.png");
    assert.deepEqual(driver.state.screenshots, [{ id: "w1", path: "win.png" }]);
    assert.equal(scopedFindRoot(entry, res.target), res.target.element);
  });

  it("closes one window via the _XCUI:CloseWindow stoplight button", async function () {
    const driver = fakeMacDriver([
      { id: "w1", title: "Untitled", rect: { x: 0, y: 0, width: 1, height: 1 }, closeButton: true },
      { id: "w2", title: "Untitled 2", rect: { x: 0, y: 0, width: 1, height: 1 }, closeButton: true },
    ]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    const res = await closeAppWindow({ entry, selector: "Untitled 2" });
    assert.deepEqual(res, { ok: true, closed: true });
    assert.ok(driver.state.clicks.includes("close:w2"));
    assert.match(String(driver.state.lastScopedSelector), /_XCUI:CloseWindow/);
  });

  it("falls back to a title-bar click + Cmd+W when the stoplight button isn't findable", async function () {
    const driver = fakeMacDriver([
      { id: "w1", title: "Untitled", rect: { x: 0, y: 0, width: 1, height: 1 } },
      { id: "w2", title: "Untitled 2", rect: { x: 100, y: 200, width: 400, height: 300 } },
    ]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    const res = await closeAppWindow({ entry, selector: "Untitled 2" });
    assert.equal(res.ok, true);
    // Fallback sequence: a macos: click (focus/raise via the title bar), then
    // macos: keys with Cmd+W.
    const cmds = driver.state.executed.map((e) => e.cmd);
    const clickIdx = cmds.indexOf("macos: click");
    const keysIdx = cmds.indexOf("macos: keys");
    assert.ok(clickIdx !== -1, "expected a macos: click focus/raise");
    assert.ok(keysIdx > clickIdx, "expected macos: keys after the click");
  });

  it("refuses to close the last remaining window", async function () {
    const driver = fakeMacDriver([
      { id: "w1", title: "Untitled", rect: { x: 0, y: 0, width: 1, height: 1 }, closeButton: true },
    ]);
    const entry = macEntry(driver);
    await snapshotAppWindows(entry);
    const res = await closeAppWindow({ entry, selector: "Untitled" });
    assert.equal(res.ok, false);
    assert.match(res.message, /Refusing to close the last window/);
  });
});

// ---------------------------------------------------------------------------
// Mobile + shared helpers
// ---------------------------------------------------------------------------

describe("appWindows: mobile + helpers", function () {
  it("resolveAppWindow FAILs on android/ios with the shared single-window message", async function () {
    for (const platform of ["android", "ios"]) {
      const entry = { name: "chat", appId: "x", driver: {}, platform };
      const res = await resolveAppWindow({ entry, selector: -1, timeoutMs: 300 });
      assert.equal(res.ok, false, platform);
      assert.match(res.message, /single-window/);
      assert.match(res.message, new RegExp(platform));
      assert.equal(res.message, unsupportedWindowSelectorMessage(platform));
    }
  });

  it("closeAppWindow FAILs on mobile with the same message", async function () {
    const entry = { name: "chat", appId: "x", driver: {}, platform: "android" };
    const res = await closeAppWindow({ entry, selector: -1 });
    assert.equal(res.ok, false);
    assert.match(res.message, /single-window/);
  });

  it("the windows fixture's -EncodedCommand blob matches two-windows.ps1", function () {
    // The fixture app ships as two-windows.ps1 (the readable source of
    // truth) but launches via -EncodedCommand, because NovaWindows v1.4.1
    // ignores the appWorkingDir capability and relative -File paths don't
    // resolve. This pin keeps the embedded blob from drifting.
    // Compare EOL-normalized: git checks the .ps1 out with platform line
    // endings (CRLF on the Windows CI runner, LF elsewhere), and CRLF vs LF
    // doesn't change what -EncodedCommand executes — only real script edits
    // should trip this pin.
    const normalize = (s) => s.replace(/\r\n/g, "\n");
    const ps1 = fs.readFileSync(
      "test/core-artifacts/apps/two-windows.ps1",
      "utf8"
    );
    const expected = normalize(ps1);
    const spec = JSON.parse(
      fs.readFileSync("test/core-artifacts/apps/app-windows.spec.json", "utf8")
    );
    for (const t of spec.tests) {
      const args = t.steps[0].startSurface.args;
      const blob = args[args.indexOf("-EncodedCommand") + 1];
      const embedded = normalize(Buffer.from(blob, "base64").toString("utf16le"));
      assert.equal(embedded, expected, `${t.testId} embeds a stale app blob`);
    }
  });

  it("rewriteXPathForScopedFind anchors absolute XPaths to the scope element", function () {
    assert.equal(rewriteXPathForScopedFind("//A/B"), ".//A/B");
    assert.equal(rewriteXPathForScopedFind("(//A)[1]"), "(.//A)[1]");
    assert.equal(rewriteXPathForScopedFind(".//A"), ".//A");
    // Non-XPath selectors (accessibility id) pass through untouched.
    assert.equal(rewriteXPathForScopedFind("~save_button"), "~save_button");
  });
});
