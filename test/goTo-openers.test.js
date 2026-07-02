import assert from "node:assert/strict";
import sinon from "sinon";
import { goTo } from "../dist/core/tests/goTo.js";
import { closeSurface } from "../dist/core/tests/closeSurface.js";
import { ensureSurfaceState } from "../dist/core/tests/browserSurface.js";
import {
  createSessionRegistry,
  registerSession,
  lookupSessionByName,
} from "../dist/core/tests/browserSessions.js";

// Stub driver for opener tests: real handle bookkeeping, but `url()` records
// the navigation and throws so goTo short-circuits before its wait loop
// (pattern: test/goTo.test.js).
function stubDriver({ engine = "firefox" } = {}) {
  let counter = 100;
  const driver = {
    state: { engine },
    _handles: ["h0"],
    _current: "h0",
    _created: [],
    _urls: [],
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
    },
    async closeWindow() {
      this._handles = this._handles.filter((h) => h !== this._current);
    },
    async createWindow(type) {
      const handle = `h${counter++}`;
      this._handles.push(handle);
      this._created.push(type);
      return { handle, type };
    },
    async url(u) {
      this._urls.push({ url: u, handle: this._current });
      throw new Error("stub-short-circuit");
    },
    async getTitle() {
      return "";
    },
    async getUrl() {
      return "";
    },
    _deleted: false,
    async deleteSession() {
      this._deleted = true;
    },
  };
  return driver;
}

// A context-style session registry over stub drivers: the launcher records
// launches and hands out fresh stubs, like runContext's startDriverForBrowser
// closure does with real sessions.
function stubRegistry(defaultDriver, { engine = "firefox" } = {}) {
  const launches = [];
  const registry = createSessionRegistry({
    open: async (eng) => {
      launches.push(eng);
      return stubDriver({ engine: eng });
    },
  });
  registerSession(registry, { name: engine, engine, driver: defaultDriver });
  return { registry, launches };
}

describe("goTo newTab/newWindow openers", function () {
  this.timeout(5000);

  it("newTab opens a tab in the current window, names it, and navigates it", async function () {
    const driver = stubDriver();
    await goTo({
      config: {},
      step: { goTo: { url: "https://example.com/cart", newTab: "cart" } },
      driver,
    });
    assert.deepEqual(driver._created, ["tab"]);
    const state = ensureSurfaceState(driver);
    const tab = state.windows.find((w) => w.tabName === "cart");
    assert.ok(tab, "new tab registered by name");
    assert.equal(tab.parentWindow, "h0");
    assert.equal(tab.isWindowLead, false);
    // Navigation happened in the NEW tab.
    assert.equal(driver._urls[0].handle, tab.handle);
  });

  it("newWindow opens a window lead carrying both window and tab names", async function () {
    const driver = stubDriver();
    await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com/admin",
          newWindow: { name: "admin", tab: "overview" },
        },
      },
      driver,
    });
    assert.deepEqual(driver._created, ["window"]);
    const state = ensureSurfaceState(driver);
    const lead = state.windows.find((w) => w.windowName === "admin");
    assert.ok(lead, "new window registered by name");
    assert.equal(lead.isWindowLead, true);
    assert.equal(lead.tabName, "overview");
    assert.equal(driver._urls[0].handle, lead.handle);
  });

  it("newTab: true opens an anonymous tab", async function () {
    const driver = stubDriver();
    await goTo({
      config: {},
      step: { goTo: { url: "https://example.com", newTab: true } },
      driver,
    });
    assert.deepEqual(driver._created, ["tab"]);
    const state = ensureSurfaceState(driver);
    assert.equal(state.windows.length, 2);
    assert.equal(state.windows[1].tabName, undefined);
  });

  it("newTab: false is a plain navigation (no tab opened)", async function () {
    const driver = stubDriver();
    await goTo({
      config: {},
      step: { goTo: { url: "https://example.com", newTab: false } },
      driver,
    });
    assert.deepEqual(driver._created, []);
    assert.equal(driver._urls[0].handle, "h0");
  });

  it("a duplicate tab name FAILs without leaving an orphan tab", async function () {
    const driver = stubDriver();
    await goTo({
      config: {},
      step: { goTo: { url: "https://example.com/a", newTab: "cart" } },
      driver,
    });
    const handlesAfterFirst = driver._handles.length;
    const result = await goTo({
      config: {},
      step: { goTo: { url: "https://example.com/b", newTab: "cart" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /cart/);
    assert.match(result.description, /unique/);
    assert.equal(driver._handles.length, handlesAfterFirst);
  });

  it("an engine-mismatched surface FAILs before any window opens (no session registry)", async function () {
    // Without a session registry there is no launcher, so even goTo cannot
    // open a second browser — the single-session check FAILs the reference.
    const driver = stubDriver({ engine: "chrome" });
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          surface: "firefox",
          newTab: true,
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /is not open in this context/);
    assert.deepEqual(driver._created, []);
  });
});

describe("closeSurface browser forms (step level)", function () {
  this.timeout(5000);

  async function openNamedTab(driver, name, url = "https://example.com") {
    await goTo({
      config: {},
      step: { goTo: { url, newTab: name } },
      driver,
    });
  }

  it("closes a named tab and reports it closed", async function () {
    const driver = stubDriver();
    await openNamedTab(driver, "cart");
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { browser: "firefox", tab: "cart" } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.closedCount, 1);
    assert.equal(driver._handles.length, 1);
  });

  it("re-closing the same tab is an idempotent PASS no-op", async function () {
    const driver = stubDriver();
    await openNamedTab(driver, "cart");
    const step = { closeSurface: { browser: "firefox", tab: "cart" } };
    await closeSurface({ config: {}, step: JSON.parse(JSON.stringify(step)), driver });
    // The second close doesn't find "cart" (already closed) and retries for
    // up to the production 2s bound (ADR 01017) before resolving as absent.
    // Fake timers fast-forward that wait instead of costing real wall-clock
    // time — same pattern as the stopRecording download-timeout test.
    const clock = sinon.useFakeTimers();
    try {
      const promise = closeSurface({
        config: {},
        step: JSON.parse(JSON.stringify(step)),
        driver,
      });
      await clock.tickAsync(2100);
      const result = await promise;
      assert.equal(result.status, "PASS");
      assert.equal(result.outputs.absentCount, 1);
    } finally {
      clock.restore();
    }
  });

  it("closes a named window with its tabs (children first, lead last)", async function () {
    const driver = stubDriver();
    await goTo({
      config: {},
      step: { goTo: { url: "https://example.com/admin", newWindow: "admin" } },
      driver,
    });
    // A tab opened while the admin window is active belongs to it.
    await openNamedTab(driver, "settings");
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { browser: "firefox", window: "admin" } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(driver._handles, ["h0"]);
  });

  it("FAILs a bare-engine (whole browser) close without a session registry", async function () {
    // Whole-browser closes are session-level; with no registry to close
    // against, the reference cannot be honored.
    const driver = stubDriver();
    const result = await closeSurface({
      config: {},
      step: { closeSurface: "firefox" },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /session/);
  });

  it("FAILs a browser reference when no driver is running", async function () {
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { browser: "chrome", tab: "cart" } },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /No browser is running/);
  });

  it("refuses to close the last open tab", async function () {
    const driver = stubDriver();
    const state = ensureSurfaceState(driver);
    // Seed and name the only tab so the selector matches it.
    state.windows.push({ handle: "h0", order: state.nextOrder++, isWindowLead: true, tabName: "only" });
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { browser: "firefox", tab: "only" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /last open tab/);
    assert.deepEqual(driver._handles, ["h0"]);
  });
});

describe("multi-browser sessions (Phase 4, step level)", function () {
  this.timeout(5000);

  it("goTo opens an unopened engine surface and navigates in it", async function () {
    const driver = stubDriver({ engine: "firefox" });
    const { registry, launches } = stubRegistry(driver);
    await goTo({
      config: {},
      step: { goTo: { url: "https://example.com/admin", surface: "chrome" } },
      driver,
    });
    assert.deepEqual(launches, ["chrome"]);
    assert.equal(registry.activeName, "chrome");
    const opened = lookupSessionByName(registry, "chrome").driver;
    // Navigation happened in the NEW session, not the default one.
    assert.equal(opened._urls.length, 1);
    assert.deepEqual(driver._urls, []);
  });

  it("goTo opens a named surface of an already-running engine", async function () {
    const driver = stubDriver({ engine: "firefox" });
    const { registry, launches } = stubRegistry(driver);
    await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          surface: { browser: "firefox", name: "admin" },
        },
      },
      driver,
    });
    assert.deepEqual(launches, ["firefox"]);
    assert.equal(registry.activeName, "admin");
    assert.notEqual(lookupSessionByName(registry, "admin").driver, driver);
  });

  it("goTo re-selects an existing session instead of opening a duplicate", async function () {
    const driver = stubDriver({ engine: "firefox" });
    const { registry, launches } = stubRegistry(driver);
    await goTo({
      config: {},
      step: { goTo: { url: "https://example.com/a", surface: "chrome" } },
      driver,
    });
    const chromeDriver = lookupSessionByName(registry, "chrome").driver;
    await goTo({
      config: {},
      step: { goTo: { url: "https://example.com/b", surface: "chrome" } },
      driver,
    });
    assert.deepEqual(launches, ["chrome"]);
    assert.equal(chromeDriver._urls.length, 2);
  });

  it("a failed launch FAILs the goTo with the launcher's error", async function () {
    const driver = stubDriver({ engine: "firefox" });
    const registry = createSessionRegistry({
      open: async () => {
        throw new Error("no such driver installed");
      },
    });
    registerSession(registry, { name: "firefox", engine: "firefox", driver });
    const result = await goTo({
      config: {},
      step: { goTo: { url: "https://example.com", surface: "chrome" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /no such driver installed/);
  });

  it("non-goTo steps FAIL on an unopened surface instead of opening it", async function () {
    const driver = stubDriver({ engine: "firefox" });
    const { registry, launches } = stubRegistry(driver);
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { browser: "chrome", tab: "cart" } },
      driver,
    });
    // A tab close in a browser that isn't open is an absent no-op…
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.absentCount, 1);
    // …and never launches anything.
    assert.deepEqual(launches, []);
    assert.equal(registry.sessions.size, 1);
  });

  it("closeSurface closes a whole browser session by bare name", async function () {
    const driver = stubDriver({ engine: "firefox" });
    const { registry } = stubRegistry(driver);
    await goTo({
      config: {},
      step: {
        goTo: { url: "https://example.com", surface: { browser: "chrome", name: "shopper" } },
      },
      driver,
    });
    const shopperDriver = lookupSessionByName(registry, "shopper").driver;
    const result = await closeSurface({
      config: {},
      step: { closeSurface: "shopper" },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.deepEqual(result.outputs.closed, ["shopper"]);
    assert.equal(shopperDriver._deleted, true);
    assert.equal(lookupSessionByName(registry, "shopper"), undefined);
    // Active falls back to the surviving default session.
    assert.equal(registry.activeName, "firefox");
  });

  it("closeSurface closes the default browser by engine keyword", async function () {
    const driver = stubDriver({ engine: "firefox" });
    const { registry } = stubRegistry(driver);
    const result = await closeSurface({
      config: {},
      step: { closeSurface: "firefox" },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(driver._deleted, true);
    assert.equal(registry.activeName, null);
  });

  it("closing an unknown browser surface is an idempotent PASS no-op", async function () {
    const driver = stubDriver({ engine: "firefox" });
    stubRegistry(driver);
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { browser: "chrome" } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.absentCount, 1);
  });

  it("FAILs a whole-browser close whose engine conflicts with the name", async function () {
    const driver = stubDriver({ engine: "firefox" });
    const { registry } = stubRegistry(driver);
    registerSession(registry, {
      name: "shopper",
      engine: "chrome",
      driver: stubDriver({ engine: "chrome" }),
    });
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { browser: "firefox", name: "shopper" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /chrome/);
  });

  it("refuses to close a browser surface with an active recording", async function () {
    const driver = stubDriver({ engine: "firefox" });
    stubRegistry(driver);
    driver.state.recordings = [{ id: "rec1" }];
    const result = await closeSurface({
      config: {},
      step: { closeSurface: "firefox" },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /recording/);
    assert.equal(driver._deleted, false);
  });

  it("closes a tab inside a NON-active session by naming its surface", async function () {
    const driver = stubDriver({ engine: "firefox" });
    const { registry } = stubRegistry(driver);
    // Open a chrome session and give it a named tab; then re-activate firefox.
    await goTo({
      config: {},
      step: { goTo: { url: "https://example.com/cart", surface: "chrome", newTab: "cart" } },
      driver,
    });
    const chromeDriver = lookupSessionByName(registry, "chrome").driver;
    await goTo({
      config: {},
      step: { goTo: { url: "https://example.com", surface: "firefox" } },
      driver,
    });
    assert.equal(registry.activeName, "firefox");
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { browser: "chrome", tab: "cart" } },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.outputs.closedCount, 1);
    assert.deepEqual(chromeDriver._handles, ["h0"]);
  });
});
