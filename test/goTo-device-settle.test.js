import assert from "node:assert/strict";
import { isDeviceWebContext } from "../dist/core/utils.js";
import { goTo } from "../dist/core/tests/goTo.js";

// ---------------------------------------------------------------------------
// isDeviceWebContext: the gating predicate for the post-navigation settle.
// It must be true ONLY for a device (iOS/Android) session that is in a web
// (browser) context, and false for every desktop browser context and every
// native-app context — so desktop / app control flow stays byte-identical.
// ---------------------------------------------------------------------------

describe("isDeviceWebContext predicate", function () {
  it("is true for an iOS Safari (mobile web) driver", function () {
    const driver = {
      isMobile: true,
      isIOS: true,
      isAndroid: false,
      capabilities: { platformName: "iOS", browserName: "Safari" },
    };
    assert.equal(isDeviceWebContext(driver), true);
  });

  it("is true for an Android Chrome (mobile web) driver", function () {
    const driver = {
      isMobile: true,
      isIOS: false,
      isAndroid: true,
      capabilities: { platformName: "Android", browserName: "Chrome" },
    };
    assert.equal(isDeviceWebContext(driver), true);
  });

  it("is false for a desktop Chrome driver (isMobile falsy)", function () {
    const driver = {
      isMobile: false,
      capabilities: { platformName: "Mac", browserName: "chrome" },
    };
    assert.equal(isDeviceWebContext(driver), false);
  });

  it("is false for a desktop driver that omits isMobile entirely", function () {
    const driver = { capabilities: { browserName: "firefox" } };
    assert.equal(isDeviceWebContext(driver), false);
  });

  it("is false for a native mobile-app driver (no browserName capability)", function () {
    const driver = {
      isMobile: true,
      isIOS: true,
      capabilities: { platformName: "iOS", "appium:automationName": "XCUITest" },
    };
    assert.equal(isDeviceWebContext(driver), false);
  });

  it("is false for a null / undefined driver", function () {
    assert.equal(isDeviceWebContext(null), false);
    assert.equal(isDeviceWebContext(undefined), false);
  });
});

// ---------------------------------------------------------------------------
// goTo post-navigation settle: device web contexts only.
//
// After goTo's existing readiness gate (document.readyState complete +
// network-idle + DOM-stable) passes, a freshly-built WDA iOS Safari session
// under load can momentarily hand back an EMPTY element tree to WebDriver even
// though readyState reports complete. The settle bounds-waits for the element
// tree to become queryable before returning, so the next `find` doesn't race
// an empty tree. Desktop contexts must NOT get this extra wait.
// ---------------------------------------------------------------------------

// A live-ish driver: execute() invokes the passed fn against a browser stub,
// waitUntil polls the condition like webdriverio, and we record every
// waitUntil call so we can prove the settle fired (or didn't).
function installBrowserStub({ ready = "complete" } = {}) {
  global.document = { readyState: ready, body: {} };
  global.window = { fetch: async () => ({}) };
  global.XMLHttpRequest = { prototype: { open: function () {} } };
  global.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
    }
    observe() {}
    disconnect() {}
  };
}
function uninstallBrowserStub() {
  delete global.document;
  delete global.window;
  delete global.XMLHttpRequest;
  delete global.MutationObserver;
}

// `$$` returns a growing tree: empties until `emptyPolls` `$$` calls have
// elapsed, then a non-empty array. Records waitUntil invocations.
function makeSettleDriver({
  mobile = false,
  ios = false,
  android = false,
  browserName = "chrome",
  emptyTreePolls = 0,
} = {}) {
  const record = { waitUntilCount: 0, dollarDollarCalls: 0 };
  const driver = {
    isMobile: mobile,
    isIOS: ios,
    isAndroid: android,
    capabilities: browserName ? { browserName } : {},
    url: async (u) => u,
    execute: async (fn, ...args) => fn(...args),
    waitUntil: async (condition, { timeout } = {}) => {
      record.waitUntilCount++;
      const start = Date.now();
      for (let i = 0; i < 2000; i++) {
        if (await condition()) return true;
        if (timeout !== undefined && Date.now() - start > timeout) {
          throw new Error("waitUntil timeout");
        }
        await new Promise((r) => setTimeout(r, 2));
      }
      throw new Error("waitUntil exhausted");
    },
    pause: async () => {},
    $$: async () => {
      record.dollarDollarCalls++;
      if (record.dollarDollarCalls <= emptyTreePolls) return [];
      return [{ elementId: "el-1" }];
    },
    $: async () => null,
  };
  return { driver, record };
}

const baseStep = () => ({
  goTo: {
    url: "https://example.com",
    timeout: 4000,
    waitUntil: { networkIdleTime: null, domIdleTime: null },
  },
});

describe("goTo post-navigation settle (device web only)", function () {
  this.timeout(10000);
  afterEach(function () {
    uninstallBrowserStub();
  });

  it("iOS web context with a briefly-empty element tree waits for it, then PASSes", async function () {
    installBrowserStub({ ready: "complete" });
    // Element tree is empty for the first two $$ polls, then populates.
    const { driver, record } = makeSettleDriver({
      mobile: true,
      ios: true,
      browserName: "Safari",
      emptyTreePolls: 2,
    });
    const result = await goTo({ config: {}, step: baseStep(), driver });
    assert.equal(result.status, "PASS");
    // The settle must have run its own waitUntil (in addition to the
    // document-ready waitUntil) — i.e. at least 2 waitUntil calls total.
    assert.ok(
      record.waitUntilCount >= 2,
      `expected a settle waitUntil to fire on iOS web; got ${record.waitUntilCount} waitUntil calls`
    );
    // And it must have polled the tree until it became non-empty.
    assert.ok(
      record.dollarDollarCalls > 2,
      `expected the settle to re-poll past the empty tree; got ${record.dollarDollarCalls} $$ calls`
    );
  });

  it("desktop web context does NOT run the settle (element-tree poll never happens)", async function () {
    installBrowserStub({ ready: "complete" });
    const { driver, record } = makeSettleDriver({
      mobile: false,
      browserName: "chrome",
      emptyTreePolls: 0,
    });
    const result = await goTo({ config: {}, step: baseStep(), driver });
    assert.equal(result.status, "PASS");
    // Exactly one waitUntil (the document-ready gate). No settle.
    assert.equal(
      record.waitUntilCount,
      1,
      "desktop must not add a settle waitUntil"
    );
    // The settle is the only thing that would call $$ here (no find step, no
    // network/dom monitors since both are null). Desktop must never poll it.
    assert.equal(
      record.dollarDollarCalls,
      0,
      "desktop must not poll the element tree post-navigation"
    );
  });

  it("Android web context whose $$ returns a non-array truthy value settles and PASSes", async function () {
    installBrowserStub({ ready: "complete" });
    const { driver } = makeSettleDriver({
      mobile: true,
      android: true,
      browserName: "Chrome",
    });
    // Override $$ to return a truthy non-array (some driver shims do) — the
    // settle must treat that as "tree present" via its `!!elements` fallback.
    driver.$$ = async () => ({ length: 1 });
    const result = await goTo({ config: {}, step: baseStep(), driver });
    assert.equal(result.status, "PASS");
  });

  it("iOS web context with no settle budget left (remaining <= 0) skips the settle and PASSes", async function () {
    installBrowserStub({ ready: "complete" });
    const { driver, record } = makeSettleDriver({
      mobile: true,
      ios: true,
      browserName: "Safari",
    });
    // A tiny timeout that the document-ready pause (100ms) already overruns,
    // so by the time the settle computes its ceiling there is no budget left
    // and it must not poll the tree at all.
    const step = {
      goTo: {
        url: "https://example.com",
        timeout: 50,
        waitUntil: { networkIdleTime: null, domIdleTime: null },
      },
    };
    const result = await goTo({ config: {}, step, driver });
    assert.equal(result.status, "PASS");
    assert.equal(
      record.dollarDollarCalls,
      0,
      "settle must not poll the tree when no time budget remains"
    );
  });

  it("iOS web context whose tree stays empty past the ceiling still PROCEEDS to PASS (settle never fails goTo)", async function () {
    installBrowserStub({ ready: "complete" });
    // emptyTreePolls huge: the tree never populates within the settle ceiling.
    const { driver } = makeSettleDriver({
      mobile: true,
      ios: true,
      browserName: "Safari",
      emptyTreePolls: 100000,
    });
    const result = await goTo({ config: {}, step: baseStep(), driver });
    // The settle is best-effort: a timed-out settle must NOT turn a
    // successful navigation into a FAIL. It hands control to find, which
    // owns the real "element genuinely absent" verdict.
    assert.equal(result.status, "PASS");
  });
});
