import assert from "node:assert/strict";
import {
  createSessionRegistry,
  registerSession,
  resolveSessionForRef,
  lookupSessionByName,
  closeSession,
  sweepSessions,
  activeDriver,
} from "../dist/core/tests/browserSessions.js";
import {
  parseSurfaceRef,
  switchToSurface,
} from "../dist/core/tests/browserSurface.js";

// Multi-surface Phase 4 (ADR 01019): several concurrent WebDriver sessions
// keyed by surface name. These tests drive the context-scoped session
// registry with stub drivers — no webdriverio, no Appium.

// Same shape as the browserSurface.test.js stub, plus deleteSession so the
// registry can end sessions. `_deleted` records teardown for assertions.
function stubDriver({ engine = "chrome", handles = ["h0"] } = {}) {
  let counter = 100;
  const driver = {
    state: { engine },
    _handles: [...handles],
    _current: handles[0],
    _pages: {},
    _switches: [],
    _deleted: false,
    async getWindowHandles() {
      if (this._deleted) throw new Error("session deleted");
      return [...this._handles];
    },
    async getWindowHandle() {
      if (this._deleted) throw new Error("session deleted");
      if (!this._handles.includes(this._current))
        throw new Error("no such window");
      return this._current;
    },
    async switchToWindow(handle) {
      if (this._deleted) throw new Error("session deleted");
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
    async deleteSession() {
      this._deleted = true;
    },
  };
  return driver;
}

// Registry with a stub launcher: `open(engine)` returns a fresh stub driver
// and records the launch; set `failWith` to make launches fail.
function stubRegistry({ failWith, isNameTaken } = {}) {
  const launches = [];
  const registry = createSessionRegistry({
    open: async (engine) => {
      launches.push(engine);
      if (failWith) throw new Error(failWith);
      return stubDriver({ engine });
    },
    ...(isNameTaken ? { isNameTaken } : {}),
  });
  return { registry, launches };
}

describe("browserSessions: registration", function () {
  it("registers the default session under its engine name and activates it", function () {
    const { registry } = stubRegistry();
    const driver = stubDriver({ engine: "chrome" });
    registerSession(registry, { name: "chrome", engine: "chrome", driver });
    assert.equal(registry.activeName, "chrome");
    assert.equal(activeDriver(registry), driver);
    assert.equal(lookupSessionByName(registry, "chrome").driver, driver);
  });

  it("back-links every registered driver to the registry", function () {
    const { registry } = stubRegistry();
    const driver = stubDriver();
    registerSession(registry, { name: "chrome", engine: "chrome", driver });
    assert.equal(driver.state.sessionRegistry, registry);
  });

  it("stamps the engine on the driver state", function () {
    const { registry } = stubRegistry();
    const driver = stubDriver();
    delete driver.state;
    registerSession(registry, { name: "shopper", engine: "Chrome", driver });
    assert.equal(driver.state.engine, "chrome");
  });

  it("rejects duplicate session names", function () {
    const { registry } = stubRegistry();
    registerSession(registry, {
      name: "chrome",
      engine: "chrome",
      driver: stubDriver(),
    });
    assert.throws(
      () =>
        registerSession(registry, {
          name: "chrome",
          engine: "firefox",
          driver: stubDriver({ engine: "firefox" }),
        }),
      /already/
    );
  });

  it("rejects a name already taken by another surface kind", function () {
    const { registry } = stubRegistry({ isNameTaken: (n) => n === "api" });
    assert.throws(
      () =>
        registerSession(registry, {
          name: "api",
          engine: "chrome",
          driver: stubDriver(),
        }),
      /across kinds/
    );
  });

  it("rejects naming a session after a foreign engine keyword", function () {
    const { registry } = stubRegistry();
    assert.throws(
      () =>
        registerSession(registry, {
          name: "firefox",
          engine: "chrome",
          driver: stubDriver(),
        }),
      /engine keyword/
    );
  });

  it("allows a session named after its own engine keyword (incl. edge≡chrome)", function () {
    const { registry } = stubRegistry();
    // Own engine keyword — the default-session case — is fine.
    registerSession(registry, { name: "chrome", engine: "chrome", driver: stubDriver() });
    // edge normalizes to chrome, so an edge alias for a chrome session is allowed.
    registerSession(registry, { name: "edge", engine: "chrome", driver: stubDriver() });
    assert.ok(lookupSessionByName(registry, "chrome"));
    assert.ok(lookupSessionByName(registry, "edge"));
  });
});

describe("browserSessions: resolveSessionForRef", function () {
  it("rejects non-browser references", async function () {
    const { registry } = stubRegistry();
    const result = await resolveSessionForRef(
      registry,
      parseSurfaceRef({ process: "api" })
    );
    assert.equal(result.ok, false);
  });

  it("resolves a bare engine reference to the default session", async function () {
    const { registry } = stubRegistry();
    const driver = stubDriver({ engine: "chrome" });
    registerSession(registry, { name: "chrome", engine: "chrome", driver });
    const result = await resolveSessionForRef(registry, parseSurfaceRef("chrome"));
    assert.equal(result.ok, true);
    assert.equal(result.driver, driver);
  });

  it("resolves a named reference and re-activates that session", async function () {
    const { registry } = stubRegistry();
    const chrome = stubDriver({ engine: "chrome" });
    const shopper = stubDriver({ engine: "chrome" });
    registerSession(registry, { name: "chrome", engine: "chrome", driver: chrome });
    registerSession(registry, { name: "shopper", engine: "chrome", driver: shopper });
    assert.equal(registry.activeName, "shopper");
    const result = await resolveSessionForRef(
      registry,
      parseSurfaceRef({ browser: "chrome", name: "shopper" })
    );
    assert.equal(result.ok, true);
    assert.equal(result.driver, shopper);
    // Resolving the engine-named default re-activates it.
    await resolveSessionForRef(registry, parseSurfaceRef("chrome"));
    assert.equal(registry.activeName, "chrome");
  });

  it("fails a named reference whose engine conflicts with the session", async function () {
    const { registry } = stubRegistry();
    registerSession(registry, {
      name: "shopper",
      engine: "chrome",
      driver: stubDriver({ engine: "chrome" }),
    });
    const result = await resolveSessionForRef(
      registry,
      parseSurfaceRef({ browser: "firefox", name: "shopper" })
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /chrome/);
    assert.match(result.message, /firefox/);
  });

  it("falls back to a unique session of the referenced engine", async function () {
    const { registry } = stubRegistry();
    const shopper = stubDriver({ engine: "chrome" });
    registerSession(registry, { name: "shopper", engine: "chrome", driver: shopper });
    // No session named "chrome", but exactly one chrome-engine session exists.
    const result = await resolveSessionForRef(registry, parseSurfaceRef("chrome"));
    assert.equal(result.ok, true);
    assert.equal(result.driver, shopper);
  });

  it("treats edge as chrome for the engine fallback (context normalization)", async function () {
    const { registry } = stubRegistry();
    const chrome = stubDriver({ engine: "chrome" });
    registerSession(registry, { name: "main", engine: "chrome", driver: chrome });
    const result = await resolveSessionForRef(registry, parseSurfaceRef("edge"));
    assert.equal(result.ok, true);
    assert.equal(result.driver, chrome);
  });

  it("fails an ambiguous engine reference naming the candidates", async function () {
    const { registry } = stubRegistry();
    registerSession(registry, {
      name: "shopper",
      engine: "chrome",
      driver: stubDriver({ engine: "chrome" }),
    });
    registerSession(registry, {
      name: "admin",
      engine: "chrome",
      driver: stubDriver({ engine: "chrome" }),
    });
    const result = await resolveSessionForRef(registry, parseSurfaceRef("chrome"));
    assert.equal(result.ok, false);
    assert.match(result.message, /shopper/);
    assert.match(result.message, /admin/);
  });

  it("fails an unopened reference without allowOpen, pointing at goTo", async function () {
    const { registry } = stubRegistry();
    registerSession(registry, {
      name: "chrome",
      engine: "chrome",
      driver: stubDriver({ engine: "chrome" }),
    });
    const result = await resolveSessionForRef(registry, parseSurfaceRef("firefox"));
    assert.equal(result.ok, false);
    assert.match(result.message, /goTo/);
  });

  it("opens an unopened engine reference with allowOpen and activates it", async function () {
    const { registry, launches } = stubRegistry();
    registerSession(registry, {
      name: "chrome",
      engine: "chrome",
      driver: stubDriver({ engine: "chrome" }),
    });
    const result = await resolveSessionForRef(
      registry,
      parseSurfaceRef("firefox"),
      { allowOpen: true }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(launches, ["firefox"]);
    assert.equal(registry.activeName, "firefox");
    assert.equal(lookupSessionByName(registry, "firefox").driver, result.driver);
  });

  it("opens a named browser surface with allowOpen under that name", async function () {
    const { registry, launches } = stubRegistry();
    registerSession(registry, {
      name: "chrome",
      engine: "chrome",
      driver: stubDriver({ engine: "chrome" }),
    });
    const result = await resolveSessionForRef(
      registry,
      parseSurfaceRef({ browser: "chrome", name: "shopper" }),
      { allowOpen: true }
    );
    assert.equal(result.ok, true);
    assert.deepEqual(launches, ["chrome"]);
    assert.equal(registry.activeName, "shopper");
    assert.notEqual(
      lookupSessionByName(registry, "shopper").driver,
      lookupSessionByName(registry, "chrome").driver
    );
  });

  it("fails the open when the launcher fails, with its message", async function () {
    const { registry } = stubRegistry({ failWith: "no such driver" });
    const result = await resolveSessionForRef(
      registry,
      parseSurfaceRef("firefox"),
      { allowOpen: true }
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /no such driver/);
  });

  it("fails the open when the name is taken by another surface kind", async function () {
    const { registry } = stubRegistry({
      isNameTaken: (name) => name === "api",
    });
    const result = await resolveSessionForRef(
      registry,
      parseSurfaceRef({ browser: "chrome", name: "api" }),
      { allowOpen: true }
    );
    assert.equal(result.ok, false);
    assert.match(result.message, /api/);
  });
});

describe("browserSessions: closeSession and sweep", function () {
  it("closes a session, deregisters it, and reports closed", async function () {
    const { registry } = stubRegistry();
    const driver = stubDriver({ engine: "chrome" });
    registerSession(registry, { name: "chrome", engine: "chrome", driver });
    const result = await closeSession(registry, "chrome");
    assert.deepEqual(result, { ok: true, closed: true });
    assert.equal(driver._deleted, true);
    assert.equal(lookupSessionByName(registry, "chrome"), undefined);
    assert.equal(registry.activeName, null);
  });

  it("is an idempotent no-op for an unknown name", async function () {
    const { registry } = stubRegistry();
    const result = await closeSession(registry, "ghost");
    assert.deepEqual(result, { ok: true, closed: false });
  });

  it("falls the active surface back to the most recently focused survivor", async function () {
    const { registry } = stubRegistry();
    const chrome = stubDriver({ engine: "chrome" });
    const admin = stubDriver({ engine: "firefox" });
    const shopper = stubDriver({ engine: "chrome" });
    registerSession(registry, { name: "chrome", engine: "chrome", driver: chrome });
    registerSession(registry, { name: "admin", engine: "firefox", driver: admin });
    registerSession(registry, { name: "shopper", engine: "chrome", driver: shopper });
    // Registration order: chrome, admin, shopper. Re-focus admin, then close
    // it — the fallback is the most recently focused survivor (shopper, which
    // was focused after chrome).
    await resolveSessionForRef(registry, parseSurfaceRef({ browser: "firefox", name: "admin" }));
    assert.equal(registry.activeName, "admin");
    await closeSession(registry, "admin");
    assert.equal(registry.activeName, "shopper");
    assert.equal(activeDriver(registry), shopper);
  });

  it("keeps the active surface when a non-active session closes", async function () {
    const { registry } = stubRegistry();
    const chrome = stubDriver({ engine: "chrome" });
    const admin = stubDriver({ engine: "firefox" });
    registerSession(registry, { name: "chrome", engine: "chrome", driver: chrome });
    registerSession(registry, { name: "admin", engine: "firefox", driver: admin });
    assert.equal(registry.activeName, "admin");
    await closeSession(registry, "chrome");
    assert.equal(registry.activeName, "admin");
  });

  it("tolerates a deleteSession failure and still deregisters", async function () {
    const { registry } = stubRegistry();
    const driver = stubDriver({ engine: "chrome" });
    driver.deleteSession = async () => {
      throw new Error("already dead");
    };
    registerSession(registry, { name: "chrome", engine: "chrome", driver });
    const result = await closeSession(registry, "chrome");
    assert.equal(result.ok, true);
    assert.equal(lookupSessionByName(registry, "chrome"), undefined);
  });

  it("sweeps every remaining session at teardown, tolerating failures", async function () {
    const { registry } = stubRegistry();
    const chrome = stubDriver({ engine: "chrome" });
    const admin = stubDriver({ engine: "firefox" });
    admin.deleteSession = async () => {
      throw new Error("already dead");
    };
    registerSession(registry, { name: "chrome", engine: "chrome", driver: chrome });
    registerSession(registry, { name: "admin", engine: "firefox", driver: admin });
    await sweepSessions(registry);
    assert.equal(chrome._deleted, true);
    assert.equal(registry.activeName, null);
    assert.equal(lookupSessionByName(registry, "chrome"), undefined);
    assert.equal(lookupSessionByName(registry, "admin"), undefined);
  });
});

describe("browserSessions: switchToSurface across sessions", function () {
  it("switches to another session's driver and returns it", async function () {
    const { registry } = stubRegistry();
    const chrome = stubDriver({ engine: "chrome", handles: ["c0"] });
    const firefox = stubDriver({ engine: "firefox", handles: ["f0"] });
    registerSession(registry, { name: "chrome", engine: "chrome", driver: chrome });
    registerSession(registry, { name: "firefox", engine: "firefox", driver: firefox });
    const result = await switchToSurface(chrome, "firefox");
    assert.equal(result.ok, true);
    assert.equal(result.driver, firefox);
    assert.equal(result.handle, "f0");
    assert.equal(registry.activeName, "firefox");
  });

  it("resolves window/tab selectors inside the referenced session", async function () {
    const { registry } = stubRegistry();
    const chrome = stubDriver({ engine: "chrome", handles: ["c0"] });
    const firefox = stubDriver({ engine: "firefox", handles: ["f0", "f1"] });
    firefox._pages.f1 = { title: "Cart" };
    registerSession(registry, { name: "chrome", engine: "chrome", driver: chrome });
    registerSession(registry, { name: "firefox", engine: "firefox", driver: firefox });
    const result = await switchToSurface(
      chrome,
      { browser: "firefox", tab: { title: "Cart" } },
      { maxWaitMs: 50, pollIntervalMs: 10 }
    );
    assert.equal(result.ok, true);
    assert.equal(result.driver, firefox);
    assert.equal(result.handle, "f1");
    assert.equal(firefox._current, "f1");
  });

  it("fails an unopened engine reference with goTo guidance (registry present)", async function () {
    const { registry } = stubRegistry();
    const chrome = stubDriver({ engine: "chrome" });
    registerSession(registry, { name: "chrome", engine: "chrome", driver: chrome });
    const result = await switchToSurface(chrome, "firefox");
    assert.equal(result.ok, false);
    assert.match(result.message, /goTo/);
  });

  it("fails an engine mismatch without a registry, with goTo guidance", async function () {
    const driver = stubDriver({ engine: "chrome" });
    const result = await switchToSurface(driver, "firefox");
    assert.equal(result.ok, false);
    assert.match(result.message, /goTo/);
  });

  it("fails a named surface without a registry, with goTo guidance", async function () {
    const driver = stubDriver({ engine: "chrome" });
    const result = await switchToSurface(driver, {
      browser: "chrome",
      name: "shopper",
    });
    assert.equal(result.ok, false);
    assert.match(result.message, /goTo/);
  });

  it("still returns the passed driver for same-session references", async function () {
    const driver = stubDriver({ engine: "chrome", handles: ["h0"] });
    const result = await switchToSurface(driver, "chrome");
    assert.equal(result.ok, true);
    assert.equal(result.driver, driver);
  });
});
