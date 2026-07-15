// Unit tests for the Phase 5 browser session-reuse machinery
// (src/core/sessionReuse.ts, compiled to dist/core/sessionReuse.js).
//
// Everything here is hermetic: the engine tiering, the freshSession gate, the
// pool-key derivation, the per-port session pool, and the CDP reset protocol
// are all pure or dependency-injected, so no real driver, Appium server, or
// browser is involved. The real reuse/leakage behavior is gated by the
// test/core-artifacts/sessions/ fixtures on CI headed-Chromium legs.
import assert from "node:assert/strict";
import {
  isReusableEngine,
  normalizeReuseEngine,
  shouldReuseSession,
  contextUsesRecording,
  deriveSessionPoolKey,
  createSessionPool,
  resetChromiumSession,
  bestEffortDeleteSession,
} from "../dist/core/sessionReuse.js";

describe("session-reuse tiering", function () {
  it("classifies the Chromium family as reusable", function () {
    for (const name of ["chrome", "Chrome", "CHROME", "chromium", "edge", " edge "]) {
      assert.equal(isReusableEngine(name), true, `expected reusable: ${name}`);
    }
  });

  it("classifies non-Chromium engines and app surfaces as NOT reusable", function () {
    for (const name of ["firefox", "webkit", "safari", "", undefined, null, "mac2", "windows"]) {
      assert.equal(isReusableEngine(name), false, `expected NOT reusable: ${name}`);
    }
  });

  it("normalizes engine names (trim + lowercase)", function () {
    assert.equal(normalizeReuseEngine("  Chrome "), "chrome");
    assert.equal(normalizeReuseEngine(undefined), "");
  });
});

describe("shouldReuseSession (tiering + freshSession gate)", function () {
  it("reuses a Chromium engine when freshSession is absent (falsy-when-absent)", function () {
    assert.equal(shouldReuseSession({ engineName: "chrome" }), true);
    assert.equal(shouldReuseSession({ engineName: "chrome", freshSession: undefined }), true);
    assert.equal(shouldReuseSession({ engineName: "chrome", freshSession: false }), true);
  });

  it("forces a fresh session for Chromium when freshSession is true", function () {
    assert.equal(shouldReuseSession({ engineName: "chrome", freshSession: true }), false);
  });

  it("never reuses non-Chromium engines regardless of freshSession", function () {
    assert.equal(shouldReuseSession({ engineName: "firefox" }), false);
    assert.equal(shouldReuseSession({ engineName: "firefox", freshSession: false }), false);
    assert.equal(shouldReuseSession({ engineName: "webkit", freshSession: true }), false);
  });
});

describe("contextUsesRecording (recording exclusion)", function () {
  it("is true when autoRecord is resolved on", function () {
    assert.equal(contextUsesRecording({ steps: [] }, true), true);
  });

  it("is true when a step records", function () {
    assert.equal(contextUsesRecording({ steps: [{ goTo: "x" }, { record: true }] }), true);
    assert.equal(contextUsesRecording({ steps: [{ startRecord: {} }] }), true);
  });

  it("treats record:false as NOT recording", function () {
    assert.equal(contextUsesRecording({ steps: [{ record: false }] }), false);
  });

  it("is false for a plain non-recording context", function () {
    assert.equal(contextUsesRecording({ steps: [{ goTo: "x" }, { find: "y" }] }), false);
    assert.equal(contextUsesRecording({}), false);
  });
});

describe("deriveSessionPoolKey", function () {
  const capsA = {
    platformName: "windows",
    "appium:automationName": "Chromium",
    browserName: "chrome",
    "goog:chromeOptions": {
      args: [
        "--enable-chrome-browser-cloud-management",
        "--auto-select-desktop-capture-source=browser-ctx-AAAA",
      ],
      prefs: { "download.default_directory": "/tmp/ctx-AAAA" },
      binary: "/path/to/chrome",
    },
  };
  const capsB = JSON.parse(JSON.stringify(capsA));
  capsB["goog:chromeOptions"].args[1] = "--auto-select-desktop-capture-source=browser-ctx-BBBB";
  capsB["goog:chromeOptions"].prefs["download.default_directory"] = "/tmp/ctx-BBBB";

  it("is stable across key ordering", function () {
    const reordered = {
      browserName: "chrome",
      "appium:automationName": "Chromium",
      platformName: "windows",
      "goog:chromeOptions": capsA["goog:chromeOptions"],
    };
    assert.equal(deriveSessionPoolKey(capsA), deriveSessionPoolKey(reordered));
  });

  it("ignores per-context recording identifiers (capture source + download dir)", function () {
    assert.equal(
      deriveSessionPoolKey(capsA),
      deriveSessionPoolKey(capsB),
      "two non-recording contexts of the same engine/headless must share a key"
    );
  });

  it("ignores per-context recording identifiers under ms:edgeOptions too (Edge reuse)", function () {
    // Chromium Edge puts the same per-context args/prefs under `ms:edgeOptions`
    // rather than `goog:chromeOptions`. If those aren't stripped, an Edge
    // context's take-key (with the download dir) never matches its park-key
    // (without it), silently disabling Edge reuse.
    const edgeA = {
      platformName: "windows",
      "appium:automationName": "Chromium",
      browserName: "edge",
      "ms:edgeOptions": {
        args: [
          "--enable-chrome-browser-cloud-management",
          "--auto-select-desktop-capture-source=browser-ctx-AAAA",
        ],
        prefs: { "download.default_directory": "/tmp/ctx-AAAA" },
        binary: "/path/to/edge",
      },
    };
    const edgeB = JSON.parse(JSON.stringify(edgeA));
    edgeB["ms:edgeOptions"].args[1] =
      "--auto-select-desktop-capture-source=browser-ctx-BBBB";
    edgeB["ms:edgeOptions"].prefs["download.default_directory"] = "/tmp/ctx-BBBB";
    assert.equal(
      deriveSessionPoolKey(edgeA),
      deriveSessionPoolKey(edgeB),
      "two non-recording Edge contexts of the same engine/headless must share a key"
    );
  });

  it("strips the per-attempt chromedriver port", function () {
    const withPort = JSON.parse(JSON.stringify(capsA));
    withPort["appium:chromedriverPort"] = 51234;
    assert.equal(deriveSessionPoolKey(capsA), deriveSessionPoolKey(withPort));
  });

  it("distinguishes headless from headed (an isolation-relevant arg)", function () {
    const headless = JSON.parse(JSON.stringify(capsA));
    headless["goog:chromeOptions"].args.push("--headless", "--disable-gpu");
    assert.notEqual(deriveSessionPoolKey(capsA), deriveSessionPoolKey(headless));
  });

  it("distinguishes different engines", function () {
    const edge = JSON.parse(JSON.stringify(capsA));
    edge.browserName = "edge";
    assert.notEqual(deriveSessionPoolKey(capsA), deriveSessionPoolKey(edge));
  });
});

describe("bestEffortDeleteSession (bounded, swallowing)", function () {
  it("deletes a live driver session", async function () {
    let called = false;
    await bestEffortDeleteSession({
      deleteSession: async () => {
        called = true;
      },
    });
    assert.equal(called, true);
  });

  it("swallows a throwing deleteSession (never propagates)", async function () {
    await bestEffortDeleteSession({
      deleteSession: async () => {
        throw new Error("device lost");
      },
    });
  });

  it("is a no-op for null/undefined or a driver without deleteSession", async function () {
    await bestEffortDeleteSession(undefined);
    await bestEffortDeleteSession(null);
    await bestEffortDeleteSession({});
  });

  it("times out (and resolves) when deleteSession hangs — never blocks", async function () {
    const start = Date.now();
    await bestEffortDeleteSession({ deleteSession: () => new Promise(() => {}) }, 20);
    assert.ok(
      Date.now() - start < 1000,
      "a hung deleteSession must be time-boxed, not awaited forever"
    );
  });
});

describe("createSessionPool (per-Appium-port parking)", function () {
  it("takes a parked driver only on an exact key match, on the same port", function () {
    const pool = createSessionPool();
    const d = { id: "d1" };
    pool.park(4723, "keyA", d);
    assert.equal(pool.take(4724, "keyA"), undefined, "different port must not match");
    assert.equal(pool.take(4723, "keyB"), undefined, "different key must not match");
    assert.equal(pool.take(4723, "keyA"), d, "same port + key returns the driver");
    // Taken entries are removed.
    assert.equal(pool.take(4723, "keyA"), undefined);
  });

  it("evicts whatever is parked on a port (for a fresh-start replace)", function () {
    const pool = createSessionPool();
    const d = { id: "d1" };
    pool.park(4723, "keyA", d);
    assert.equal(pool.evict(4723), d);
    assert.equal(pool.evict(4723), undefined);
  });

  it("keeps at most one parked driver per port (park replaces)", function () {
    const pool = createSessionPool();
    const d1 = { id: "d1" };
    const d2 = { id: "d2" };
    pool.park(4723, "keyA", d1);
    pool.park(4723, "keyB", d2);
    assert.equal(pool.size(), 1);
    assert.equal(pool.take(4723, "keyB"), d2);
  });

  it("drains every parked driver for run-end sweep", function () {
    const pool = createSessionPool();
    const d1 = { id: "d1" };
    const d2 = { id: "d2" };
    pool.park(4723, "k", d1);
    pool.park(4724, "k", d2);
    const drained = pool.drain();
    assert.deepEqual(new Set(drained), new Set([d1, d2]));
    assert.equal(pool.size(), 0);
  });
});

// A driver stub that records the ordered sequence of operations, so the reset
// protocol's ORDER (new window first, close others, CDP clears, reapply
// viewport, navigate) can be asserted without a browser.
function makeDriverStub(overrides = {}) {
  const calls = [];
  const stub = {
    calls,
    async newWindow(url) {
      calls.push(`newWindow:${url}`);
      return { handle: "win-new" };
    },
    async getWindowHandle() {
      calls.push("getWindowHandle");
      return "win-new";
    },
    async getWindowHandles() {
      calls.push("getWindowHandles");
      return ["win-old", "win-new"];
    },
    async switchToWindow(h) {
      calls.push(`switchToWindow:${h}`);
    },
    async closeWindow() {
      calls.push("closeWindow");
    },
    async url(u) {
      calls.push(`url:${u}`);
    },
    ...overrides,
  };
  return stub;
}

describe("resetChromiumSession (reset protocol + fail-closed)", function () {
  it("runs the protocol steps in the documented order", async function () {
    const cdpCalls = [];
    const driver = makeDriverStub();
    const viewportCalls = [];
    await resetChromiumSession({
      driver,
      cdp: async (method, params) => {
        cdpCalls.push({ method, params });
      },
      reapplyViewport: async () => {
        viewportCalls.push("viewport");
      },
      timeoutMs: 1000,
    });
    // Fresh window opens BEFORE any close (last-window-close ends the session).
    const firstClose = driver.calls.indexOf("closeWindow");
    const newWindowIdx = driver.calls.findIndex((c) => c.startsWith("newWindow:about:blank"));
    assert.ok(newWindowIdx >= 0, "opened a fresh about:blank window");
    assert.ok(firstClose > newWindowIdx, "fresh window must open before other windows close");
    // The other (old) window was closed.
    assert.ok(driver.calls.includes("switchToWindow:win-old"));
    assert.ok(driver.calls.includes("closeWindow"));
    // CDP global clears, in order.
    assert.deepEqual(
      cdpCalls.map((c) => c.method),
      [
        "Storage.clearDataForOrigin",
        "Network.clearBrowserCookies",
        "Network.clearBrowserCache",
        "Browser.resetPermissions",
        "Emulation.clearDeviceMetricsOverride",
        "Emulation.clearGeolocationOverride",
      ]
    );
    assert.deepEqual(cdpCalls[0].params, { origin: "*", storageTypes: "all" });
    // Viewport reapplied, then a final navigate to about:blank.
    assert.deepEqual(viewportCalls, ["viewport"]);
    assert.ok(driver.calls[driver.calls.length - 1] === "url:about:blank");
  });

  it("fails closed when a CDP step throws", async function () {
    const driver = makeDriverStub();
    await assert.rejects(
      resetChromiumSession({
        driver,
        cdp: async (method) => {
          if (method === "Storage.clearDataForOrigin") throw new Error("cdp unsupported");
        },
        reapplyViewport: async () => {},
        timeoutMs: 1000,
      }),
      /cdp unsupported/
    );
  });

  it("fails closed (times out) when a step hangs past the bound", async function () {
    const driver = makeDriverStub({
      newWindow: () => new Promise(() => {}), // never resolves
    });
    await assert.rejects(
      resetChromiumSession({
        driver,
        cdp: async () => {},
        reapplyViewport: async () => {},
        timeoutMs: 20,
      }),
      /timed out/i
    );
  });

  it("fails closed when the window sweep throws", async function () {
    const driver = makeDriverStub({
      getWindowHandles: async () => {
        throw new Error("session gone");
      },
    });
    await assert.rejects(
      resetChromiumSession({
        driver,
        cdp: async () => {},
        reapplyViewport: async () => {},
        timeoutMs: 1000,
      }),
      /session gone/
    );
  });
});
