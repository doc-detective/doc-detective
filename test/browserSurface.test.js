import assert from "node:assert/strict";
import {
  parseSurfaceRef,
  ensureSurfaceState,
  syncHandles,
  registerOpenedHandle,
  resolveWindowTarget,
  switchToSurface,
  closeHandle,
  resolveCloseTargets,
  RESERVED_ENGINE_KEYWORDS,
} from "../dist/core/tests/browserSurface.js";

// Stateful stub driver: models the W3C flat-handle surface (handles, focus,
// per-handle title/url) without webdriverio. Handles are opened/closed by
// mutating `_handles`; `_switches` records every switchToWindow for
// focus-restoration assertions.
function stubDriver({ engine = "firefox", handles = ["h0"] } = {}) {
  let counter = 100;
  const driver = {
    state: { engine },
    _handles: [...handles],
    _current: handles[0],
    _pages: {},
    _switches: [],
    async getWindowHandles() {
      return [...this._handles];
    },
    async getWindowHandle() {
      if (!this._handles.includes(this._current))
        throw new Error("no such window");
      return this._current;
    },
    async switchToWindow(handle) {
      if (!this._handles.includes(handle))
        throw new Error(`no such window: ${handle}`);
      this._current = handle;
      this._switches.push(handle);
    },
    async closeWindow() {
      this._handles = this._handles.filter((h) => h !== this._current);
    },
    async createWindow(type) {
      const handle = `h${counter++}`;
      this._handles.push(handle);
      return { handle, type };
    },
    async getTitle() {
      return this._pages[this._current]?.title ?? "";
    },
    async getUrl() {
      return this._pages[this._current]?.url ?? "";
    },
  };
  return driver;
}

// Open a page-tracked handle directly on the stub (simulates target=_blank /
// window.open — the runner did not open it, so it is unregistered).
function pageOpens(driver, handle, page = {}) {
  driver._handles.push(handle);
  driver._pages[handle] = page;
}

describe("browserSurface: parseSurfaceRef", function () {
  it("maps omitted surfaces to kind none", function () {
    assert.deepEqual(parseSurfaceRef(undefined), { kind: "none" });
    assert.deepEqual(parseSurfaceRef(null), { kind: "none" });
  });

  it("maps non-engine strings to process names (Phase 1 behavior)", function () {
    assert.deepEqual(parseSurfaceRef("node"), { kind: "process", name: "node" });
    assert.deepEqual(parseSurfaceRef(" web "), { kind: "process", name: "web" });
  });

  it("maps engine keyword strings to browser surfaces", function () {
    for (const engine of RESERVED_ENGINE_KEYWORDS) {
      const parsed = parseSurfaceRef(engine);
      assert.equal(parsed.kind, "browser", engine);
      assert.equal(parsed.engine, engine);
    }
    // Trim + case-insensitive
    assert.equal(parseSurfaceRef(" CHROME ").kind, "browser");
    assert.equal(parseSurfaceRef(" CHROME ").engine, "chrome");
  });

  it("maps process objects to process surfaces", function () {
    assert.deepEqual(parseSurfaceRef({ process: " db " }), {
      kind: "process",
      name: "db",
    });
  });

  it("maps browser objects with selectors to browser surfaces", function () {
    const parsed = parseSurfaceRef({
      browser: "chrome",
      window: "main",
      tab: -1,
    });
    assert.equal(parsed.kind, "browser");
    assert.equal(parsed.engine, "chrome");
    assert.equal(parsed.window, "main");
    assert.equal(parsed.tab, -1);
  });

  it("carries the reserved name field through", function () {
    assert.equal(parseSurfaceRef({ browser: "chrome", name: "x" }).name, "x");
  });

  it("maps anything else to unsupported", function () {
    assert.equal(parseSurfaceRef(42).kind, "unsupported");
    assert.equal(parseSurfaceRef({ app: "calc" }).kind, "unsupported");
  });
});

describe("browserSurface: registry seeding and sync", function () {
  it("seeds the first handle as the order-0 window lead", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    const state = ensureSurfaceState(driver);
    assert.equal(state.windows.length, 1);
    assert.equal(state.windows[0].handle, "h0");
    assert.equal(state.windows[0].order, 0);
    assert.equal(state.windows[0].isWindowLead, true);
  });

  it("registers page-opened handles in first-seen order as parentless tabs", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    pageOpens(driver, "p1");
    pageOpens(driver, "p2");
    await syncHandles(driver);
    const state = ensureSurfaceState(driver);
    assert.deepEqual(
      state.windows.map((w) => [w.handle, w.order]),
      [["h0", 0], ["p1", 1], ["p2", 2]]
    );
    assert.equal(state.windows[1].isWindowLead, false);
    assert.equal(state.windows[1].parentWindow, undefined);
  });

  it("prunes closed handles and never reuses ordinals", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    pageOpens(driver, "p1");
    await syncHandles(driver);
    // p1 closes behind our back
    driver._handles = driver._handles.filter((h) => h !== "p1");
    pageOpens(driver, "p2");
    await syncHandles(driver);
    const state = ensureSurfaceState(driver);
    assert.deepEqual(
      state.windows.map((w) => [w.handle, w.order]),
      [["h0", 0], ["p2", 2]]
    );
  });

  it("rejects duplicate tab and window names", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    pageOpens(driver, "t1");
    pageOpens(driver, "t2");
    registerOpenedHandle(driver, { handle: "t1", tabName: "cart" });
    assert.throws(
      () => registerOpenedHandle(driver, { handle: "t2", tabName: "cart" }),
      /cart/
    );
    registerOpenedHandle(driver, {
      handle: "t2",
      isWindowLead: true,
      windowName: "admin",
    });
    pageOpens(driver, "t3");
    assert.throws(
      () =>
        registerOpenedHandle(driver, {
          handle: "t3",
          isWindowLead: true,
          windowName: "admin",
        }),
      /admin/
    );
  });
});

describe("browserSurface: resolveWindowTarget", function () {
  async function threeTabs() {
    const driver = stubDriver();
    await syncHandles(driver);
    pageOpens(driver, "t1", { title: "Cart — My Shop", url: "https://shop.example/checkout" });
    pageOpens(driver, "t2", { title: "Orders", url: "https://shop.example/orders/123" });
    await syncHandles(driver);
    registerOpenedHandle(driver, { handle: "t1", tabName: "cart" });
    return driver;
  }

  it("resolves a tab by name", async function () {
    const driver = await threeTabs();
    const res = await resolveWindowTarget(driver, parseSurfaceRef({ browser: "firefox", tab: "cart" }));
    assert.equal(res.ok, true);
    assert.equal(res.handle, "t1");
  });

  it("resolves tabs by index, negative index, and -1 newest", async function () {
    const driver = await threeTabs();
    for (const [tab, expected] of [
      [0, "h0"],
      [1, "t1"],
      [-1, "t2"],
      [-2, "t1"],
    ]) {
      const res = await resolveWindowTarget(driver, parseSurfaceRef({ browser: "firefox", tab }));
      assert.equal(res.ok, true, `tab ${tab}`);
      assert.equal(res.handle, expected, `tab ${tab}`);
    }
  });

  it("resolves tabs by title/url criteria with substring and /regex/", async function () {
    const driver = await threeTabs();
    const byTitle = await resolveWindowTarget(
      driver,
      parseSurfaceRef({ browser: "firefox", tab: { title: "/^Cart/" } })
    );
    assert.equal(byTitle.handle, "t1");
    const byUrl = await resolveWindowTarget(
      driver,
      parseSurfaceRef({ browser: "firefox", tab: { url: "/orders/" } })
    );
    assert.equal(byUrl.handle, "t2");
  });

  it("restores focus when criteria match nothing, and names the selector", async function () {
    const driver = await threeTabs();
    await driver.switchToWindow("h0");
    const res = await resolveWindowTarget(
      driver,
      parseSurfaceRef({ browser: "firefox", tab: { title: "Nope" } })
    );
    assert.equal(res.ok, false);
    assert.match(res.message, /Nope/);
    assert.equal(driver._current, "h0");
  });

  it("reports an out-of-range index naming the selector", async function () {
    const driver = await threeTabs();
    const res = await resolveWindowTarget(driver, parseSurfaceRef({ browser: "firefox", tab: 9 }));
    assert.equal(res.ok, false);
    assert.match(res.message, /9/);
  });

  it("excludes internal (recorder) tabs from index, newest, and criteria", async function () {
    const driver = await threeTabs();
    pageOpens(driver, "rec", { title: "RECORDER" });
    await syncHandles(driver);
    // Too late to register cleanly via sync — mark it internal explicitly.
    const state = ensureSurfaceState(driver);
    state.windows.find((w) => w.handle === "rec").internal = true;
    const newest = await resolveWindowTarget(driver, parseSurfaceRef({ browser: "firefox", tab: -1 }));
    assert.equal(newest.handle, "t2");
    const byTitle = await resolveWindowTarget(
      driver,
      parseSurfaceRef({ browser: "firefox", tab: { title: "RECORDER" } })
    );
    assert.equal(byTitle.ok, false);
  });

  it("scopes tab search to a window group when window is given", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    // A named window with one child tab, plus a stray page-opened tab.
    pageOpens(driver, "w1");
    registerOpenedHandle(driver, { handle: "w1", isWindowLead: true, windowName: "admin" });
    pageOpens(driver, "w1t", { title: "Overview" });
    registerOpenedHandle(driver, { handle: "w1t", parentWindow: "w1", tabName: "overview" });
    pageOpens(driver, "stray", { title: "Overview" });
    await syncHandles(driver);

    const inWindow = await resolveWindowTarget(
      driver,
      parseSurfaceRef({ browser: "firefox", window: "admin", tab: { title: "Overview" } })
    );
    assert.equal(inWindow.handle, "w1t");

    // Window selector by index: leads only (h0 is 0, admin is 1).
    const byIndex = await resolveWindowTarget(
      driver,
      parseSurfaceRef({ browser: "firefox", window: -1, tab: "overview" })
    );
    assert.equal(byIndex.handle, "w1t");

    const noWindow = await resolveWindowTarget(
      driver,
      parseSurfaceRef({ browser: "firefox", window: "missing" })
    );
    assert.equal(noWindow.ok, false);
    assert.match(noWindow.message, /missing/);
  });

  it("FAILs an engine mismatch with the active engine named", async function () {
    const driver = stubDriver({ engine: "chrome" });
    await syncHandles(driver);
    const res = await resolveWindowTarget(driver, parseSurfaceRef({ browser: "firefox", tab: -1 }));
    assert.equal(res.ok, false);
    assert.match(res.message, /firefox/);
    assert.match(res.message, /chrome/);
    assert.match(res.message, /later phase/);
  });

  it("treats edge as chrome for the engine check (context transform parity)", async function () {
    const driver = stubDriver({ engine: "chrome" });
    await syncHandles(driver);
    const res = await resolveWindowTarget(driver, parseSurfaceRef({ browser: "edge" }));
    assert.equal(res.ok, true);
  });

  it("skips the engine check when the driver has no engine stashed", async function () {
    const driver = stubDriver({ engine: undefined });
    await syncHandles(driver);
    const res = await resolveWindowTarget(driver, parseSurfaceRef("firefox"));
    assert.equal(res.ok, true);
  });

  it("FAILs a named browser surface as a later-phase feature", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    const res = await resolveWindowTarget(
      driver,
      parseSurfaceRef({ browser: "firefox", name: "secondary" })
    );
    assert.equal(res.ok, false);
    assert.match(res.message, /later phase/);
  });

  it("resolves an engine-only surface to the current handle (no switch)", async function () {
    const driver = await threeTabs();
    await driver.switchToWindow("t1");
    driver._switches.length = 0;
    const res = await switchToSurface(driver, "firefox");
    assert.equal(res.ok, true);
    assert.equal(res.handle, "t1");
    assert.deepEqual(driver._switches, []);
  });
});

describe("browserSurface: closeHandle", function () {
  async function twoTabs() {
    const driver = stubDriver();
    await syncHandles(driver);
    pageOpens(driver, "t1");
    await syncHandles(driver);
    return driver;
  }

  it("refuses to close the last open tab", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    const res = await closeHandle(driver, "h0");
    assert.equal(res.ok, false);
    assert.match(res.message, /last/i);
    assert.deepEqual(driver._handles, ["h0"]);
  });

  it("closing the active tab focuses its parent window's lead", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    pageOpens(driver, "child");
    registerOpenedHandle(driver, { handle: "child", parentWindow: "h0", tabName: "c" });
    await driver.switchToWindow("child");
    const res = await closeHandle(driver, "child");
    assert.equal(res.ok, true);
    assert.equal(driver._current, "h0");
  });

  it("closing the active tab without a parent focuses the newest remaining tab", async function () {
    const driver = await twoTabs();
    pageOpens(driver, "t2");
    await syncHandles(driver);
    await driver.switchToWindow("t1");
    const res = await closeHandle(driver, "t1");
    assert.equal(res.ok, true);
    assert.equal(driver._current, "t2");
  });

  it("closing a non-active tab restores the previously active tab", async function () {
    const driver = await twoTabs();
    await driver.switchToWindow("h0");
    const res = await closeHandle(driver, "t1");
    assert.equal(res.ok, true);
    assert.equal(driver._current, "h0");
    assert.deepEqual(driver._handles, ["h0"]);
  });

  it("keeps the registry pruned after close", async function () {
    const driver = await twoTabs();
    await closeHandle(driver, "t1");
    const state = ensureSurfaceState(driver);
    assert.deepEqual(state.windows.map((w) => w.handle), ["h0"]);
  });
});

describe("browserSurface: resolveCloseTargets", function () {
  it("resolves a tab reference to that single handle", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    pageOpens(driver, "t1");
    await syncHandles(driver);
    registerOpenedHandle(driver, { handle: "t1", tabName: "cart" });
    const res = await resolveCloseTargets(driver, parseSurfaceRef({ browser: "firefox", tab: "cart" }));
    assert.equal(res.ok, true);
    assert.deepEqual(res.handles, ["t1"]);
  });

  it("resolves a window reference to its tabs then the lead", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    pageOpens(driver, "w1");
    registerOpenedHandle(driver, { handle: "w1", isWindowLead: true, windowName: "admin" });
    pageOpens(driver, "w1t");
    registerOpenedHandle(driver, { handle: "w1t", parentWindow: "w1", tabName: "overview" });
    await syncHandles(driver);
    const res = await resolveCloseTargets(
      driver,
      parseSurfaceRef({ browser: "firefox", window: "admin" })
    );
    assert.equal(res.ok, true);
    assert.deepEqual(res.handles, ["w1t", "w1"]);
  });

  it("returns an empty list for a selector that matches nothing (idempotent close)", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    const res = await resolveCloseTargets(
      driver,
      parseSurfaceRef({ browser: "firefox", tab: "never-existed" })
    );
    assert.equal(res.ok, true);
    assert.deepEqual(res.handles, []);
  });

  it("FAILs a whole-browser close with later-phase guidance", async function () {
    const driver = stubDriver();
    await syncHandles(driver);
    for (const ref of [parseSurfaceRef("firefox"), parseSurfaceRef({ browser: "firefox" })]) {
      const res = await resolveCloseTargets(driver, ref);
      assert.equal(res.ok, false);
      assert.match(res.message, /later phase/);
      assert.match(res.message, /tab/);
    }
  });

  it("FAILs an engine mismatch", async function () {
    const driver = stubDriver({ engine: "chrome" });
    await syncHandles(driver);
    const res = await resolveCloseTargets(driver, parseSurfaceRef({ browser: "firefox", tab: -1 }));
    assert.equal(res.ok, false);
    assert.match(res.message, /not the active browser/);
  });
});
