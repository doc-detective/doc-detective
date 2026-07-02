import assert from "node:assert/strict";
import { goTo } from "../dist/core/tests/goTo.js";
import { replaceEnvs } from "../dist/core/utils.js";

// Minimal driver stub: captures the URL passed to `driver.url()` and then
// throws so goTo short-circuits its wait-loop. We only care about the URL
// resolution side-effect on `step.goTo.url`, which happens before the driver
// is invoked.
function stubDriver() {
  const calls = { url: undefined };
  return {
    driver: {
      url: async (u) => {
        calls.url = u;
        throw new Error("stub-short-circuit");
      },
    },
    calls,
  };
}

describe("goTo originParams / params", function () {
  this.timeout(5000);

  it("appends config.originParams to URL resolved against origin", async function () {
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "/dashboard" } };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: { __clerk_testing_token: "abc" },
      },
      step,
      driver,
    });
    assert.equal(calls.url, "https://my-app.com/dashboard?__clerk_testing_token=abc");
  });

  it("merges step params with config.originParams; step wins on collision", async function () {
    const { driver, calls } = stubDriver();
    const step = {
      goTo: { url: "/p", params: { token: "step-wins", extra: "e" } },
    };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: { token: "config-loses", keep: "k" },
      },
      step,
      driver,
    });
    const qs = new URLSearchParams(calls.url.split("?")[1]);
    assert.equal(qs.get("token"), "step-wins");
    assert.equal(qs.get("extra"), "e");
    assert.equal(qs.get("keep"), "k");
  });

  it("does NOT apply config.originParams to an absolute step URL", async function () {
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "https://my-app.com/dashboard" } };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: { should_not_appear: "1" },
      },
      step,
      driver,
    });
    assert.notEqual(calls.url, undefined, "driver.url was never invoked");
    assert.equal(calls.url, "https://my-app.com/dashboard");
  });

  it("still applies step.params to an absolute step URL", async function () {
    const { driver, calls } = stubDriver();
    const step = {
      goTo: {
        url: "https://other.com/x",
        params: { from_step: "yes" },
      },
    };
    await goTo({
      config: { originParams: { not_mine: "n" } },
      step,
      driver,
    });
    assert.notEqual(calls.url, undefined, "driver.url was never invoked");
    const qs = new URLSearchParams(calls.url.split("?")[1]);
    assert.equal(qs.get("from_step"), "yes");
    assert.equal(qs.get("not_mine"), null, "config params must not leak onto absolute URLs");
  });

  it("substitutes $VAR in originParams via replaceEnvs", async function () {
    process.env.TEST_DD_GOTO_TOKEN = "goto-env-xyz";
    try {
      const { driver, calls } = stubDriver();
      const step = { goTo: { url: "/dashboard" } };
      const config = {
        origin: "https://my-app.com",
        originParams: { token: "$TEST_DD_GOTO_TOKEN" },
      };
      const resolvedConfig = replaceEnvs(config);
      await goTo({ config: resolvedConfig, step, driver });
      assert.notEqual(calls.url, undefined, "driver.url was never invoked");
      const qs = new URLSearchParams(calls.url.split("?")[1]);
      assert.equal(qs.get("token"), "goto-env-xyz");
    } finally {
      delete process.env.TEST_DD_GOTO_TOKEN;
    }
  });

  it("preserves a URL fragment when merging params", async function () {
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "/p#section" } };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: { t: "x" },
      },
      step,
      driver,
    });
    assert.equal(calls.url, "https://my-app.com/p?t=x#section");
  });

  it("replaces an existing query-string key rather than duplicating it", async function () {
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "/p?token=old&keep=y" } };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: { token: "new" },
      },
      step,
      driver,
    });
    const qs = new URLSearchParams(calls.url.split("?")[1]);
    assert.deepEqual(qs.getAll("token"), ["new"]);
    assert.equal(qs.get("keep"), "y");
  });

  it("leaves URL unchanged when neither config nor step provides params", async function () {
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "/p" } };
    await goTo({
      config: { origin: "https://my-app.com" },
      step,
      driver,
    });
    assert.equal(calls.url, "https://my-app.com/p");
  });

  it("ignores array-shaped config.originParams (no sneak-past via spread)", async function () {
    // If originParams was pre-merged via object spread, an accidentally
    // array-shaped value (`["x", "y"]`) would become `{0: "x", 1: "y"}`
    // and bypass appendQueryParams's Array.isArray guard. Two-pass apply
    // routes each source through the guard independently. (config isn't
    // re-validated at the goTo runtime layer, so this is the realistic
    // sneak-past path.)
    const { driver, calls } = stubDriver();
    const step = { goTo: { url: "/p" } };
    await goTo({
      config: {
        origin: "https://my-app.com",
        originParams: ["bad-config-array"],
      },
      step,
      driver,
    });
    assert.notEqual(calls.url, undefined);
    assert.equal(calls.url, "https://my-app.com/p");
  });
});

// ---------------------------------------------------------------------------
// Non-relative-URL guard, invalid step, and outer-catch coverage.
// ---------------------------------------------------------------------------

describe("goTo guards and top-level error handling", function () {
  this.timeout(5000);

  it("FAILs a relative URL with no origin in step or config", async function () {
    const { driver } = stubDriver();
    const result = await goTo({
      config: {},
      step: { goTo: { url: "/no-origin" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Relative URL provided without origin/);
  });

  it("adds a missing slash between origin and a bare (non-leading-slash) path", async function () {
    const { driver, calls } = stubDriver();
    // Path without a leading slash and origin without a trailing slash:
    // exercises the "add the necessary slash" branch.
    const result = await goTo({
      config: { origin: "https://my-app.com" },
      step: { goTo: { url: "dashboard" } },
      driver,
    });
    assert.notEqual(calls.url, undefined);
    assert.equal(calls.url, "https://my-app.com/dashboard");
  });

  it("resolves the shorthand string form of goTo (step.goTo as a string)", async function () {
    const { driver, calls } = stubDriver();
    await goTo({ config: {}, step: { goTo: "https://example.com/x" }, driver });
    assert.equal(calls.url, "https://example.com/x");
  });

  it("prepends https:// when the URL has no protocol (isRelativeUrl false, no '://')", async function () {
    // `mailto:` parses successfully via `new URL()` (so isRelativeUrl is
    // false -- no origin resolution needed) but contains no "://", which is
    // exactly the branch that prepends "https://".
    const { driver, calls } = stubDriver();
    await goTo({
      config: {},
      step: { goTo: { url: "mailto:test@example.com" } },
      driver,
    });
    assert.equal(calls.url, "https://mailto:test@example.com");
  });

  it("FAILs on an invalid step definition (schema rejects it)", async function () {
    const { driver } = stubDriver();
    // additionalProperties:false on the object form -- an unknown key makes
    // the resolved step invalid.
    const result = await goTo({
      config: {},
      step: { goTo: { url: "https://example.com", notAKey: true } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Invalid step definition/);
  });

  it("outer catch: driver.url rejecting -> FAIL with 'Couldn't open URL'", async function () {
    const driver = {
      url: async () => {
        throw new Error("net::ERR_CONNECTION_REFUSED");
      },
    };
    const result = await goTo({
      config: {},
      step: { goTo: { url: "https://example.com" } },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Couldn't open URL: net::ERR_CONNECTION_REFUSED/);
  });
});

// ---------------------------------------------------------------------------
// Hermetic wait-logic coverage: document-ready gate and the outer
// error-summary catch, using a lightweight fake driver whose `execute` never
// invokes the passed function (its body references `window`/`document` and
// runs in the browser, not in Node -- see the next describe block for how
// the network/DOM monitor bodies ARE exercised for real).
// ---------------------------------------------------------------------------

// A driver whose `execute` returns queued values in order, and whose
// `waitUntil` polls the given async condition function a bounded number of
// times with a short delay, mirroring webdriverio's `browser.waitUntil`
// (resolve on true, throw on exhaustion/timeout).
function makeQueueDriver({ executeQueue = [], waitUntilImpl, pauseImpl } = {}) {
  const driver = {
    url: async (u) => u,
    execute: async () => {
      if (executeQueue.length > 0) return executeQueue.shift();
      return undefined;
    },
    waitUntil:
      waitUntilImpl ||
      (async (condition, { timeout } = {}) => {
        const start = Date.now();
        for (let i = 0; i < 50; i++) {
          if (await condition()) return true;
          if (timeout !== undefined && Date.now() - start > timeout) {
            throw new Error("waitUntil timeout");
          }
          await new Promise((r) => setTimeout(r, 5));
        }
        throw new Error("waitUntil exhausted");
      }),
    pause: pauseImpl || (async () => {}),
    $$: async () => [],
    $: async () => null,
  };
  return driver;
}

describe("goTo wait logic: document-ready gate (queued driver)", function () {
  this.timeout(5000);

  it("document never becomes ready -> waitUntil throws -> FAIL, '✗ Document not ready'", async function () {
    const driver = makeQueueDriver({
      executeQueue: [], // readyState probe never resolves "complete"
      waitUntilImpl: async () => {
        throw new Error("waitUntil timeout");
      },
    });
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 200,
          waitUntil: { networkIdleTime: null, domIdleTime: null },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /goTo action timed out after \d+ms/);
    assert.match(result.description, /Document not ready/);
  });

  it("remainingTimeout <= 0 right after document-ready -> FAIL, document ready shown as passed", async function () {
    // waitTimeout is tiny; the (stubbed) `pause` sleeps just long enough that
    // elapsed time exceeds it, so remainingTimeout <= 0 triggers before any
    // parallel check starts.
    const driver = makeQueueDriver({
      executeQueue: ["complete"], // readyState probe resolves immediately
      pauseImpl: async () => new Promise((r) => setTimeout(r, 20)),
    });
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 1,
          waitUntil: { networkIdleTime: null, domIdleTime: null },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Document ready/);
  });
});

// ---------------------------------------------------------------------------
// Hermetic wait-logic coverage for waitForNetworkIdle / waitForDOMStable /
// waitUntil.find, actually INVOKING the functions passed to driver.execute
// against a minimal, controlled global window/document/XMLHttpRequest/
// MutationObserver stub (mirrors the `instantiateCursor` convention in
// test/browser-actions-coverage.test.js). This exercises the real monitor
// bodies (fetch/XHR patching, MutationObserver callback, idle/stability
// polling and cleanup) rather than skipping them -- nothing here touches a
// real browser.
// ---------------------------------------------------------------------------

function installBrowserStub({ ready = "complete" } = {}) {
  global.document = { readyState: ready, body: {} };
  global.window = {
    fetch: async () => ({}),
  };
  global.XMLHttpRequest = { prototype: { open: function () {} } };
  let observerInstance;
  global.MutationObserver = class {
    constructor(cb) {
      this.cb = cb;
      observerInstance = this;
    }
    observe() {}
    disconnect() {}
  };
  return {
    // Fire a synthetic fetch (network activity) after the given delay.
    fireRequest(afterMs) {
      setTimeout(() => {
        global.window.fetch().catch(() => {});
      }, afterMs);
    },
    // Fire a synthetic DOM mutation after the given delay.
    fireMutation(afterMs) {
      setTimeout(() => {
        if (observerInstance) observerInstance.cb();
      }, afterMs);
    },
    // Invoke the (possibly already-patched) XMLHttpRequest.prototype.open
    // after the given delay, exercising the network monitor's XHR-open
    // wrapper body the same way fireRequest exercises its fetch wrapper.
    fireXhrOpen(afterMs) {
      setTimeout(() => {
        try {
          global.XMLHttpRequest.prototype.open("GET", "https://example.com");
        } catch {
          /* ignore */
        }
      }, afterMs);
    },
  };
}

function uninstallBrowserStub() {
  delete global.document;
  delete global.window;
  delete global.XMLHttpRequest;
  delete global.MutationObserver;
}

// A findElement-compatible fake element (mirrors the convention in
// test/browser-actions-coverage.test.js).
function makeFindableElement() {
  return {
    elementId: "el-1",
    getText: async () => "item",
    getHTML: async () => "<div>item</div>",
    getTagName: async () => "div",
    getValue: async () => "",
    getLocation: async () => ({ x: 0, y: 0 }),
    getSize: async () => ({ width: 10, height: 10 }),
    isClickable: async () => true,
    isEnabled: async () => true,
    isSelected: async () => false,
    isDisplayed: async () => true,
    isExisting: async () => true,
    getAttribute: async () => "true",
    getProperty: async () => true,
    getComputedLabel: async () => "item",
    waitForExist: async () => true,
  };
}

// Driver whose execute() actually invokes the passed function under the
// browser stub, and whose waitUntil polls the condition like webdriverio.
function makeLiveDriver({ ready = "complete", find$$candidates = [] } = {}) {
  return {
    url: async (u) => u,
    execute: async (fn, ...args) => fn(...args),
    waitUntil: async (condition, { timeout } = {}) => {
      const start = Date.now();
      for (let i = 0; i < 400; i++) {
        if (await condition()) return true;
        if (timeout !== undefined && Date.now() - start > timeout) {
          throw new Error("waitUntil timeout");
        }
        await new Promise((r) => setTimeout(r, 5));
      }
      throw new Error("waitUntil exhausted");
    },
    pause: async () => {},
    $$: async () => find$$candidates,
    $: async () => null,
  };
}

describe("goTo wait logic: network/DOM monitors + find (live execute)", function () {
  this.timeout(20000);

  afterEach(function () {
    uninstallBrowserStub();
  });

  it("networkIdleTime/domIdleTime null (AJV coerces to 0) -> both active, fast path idle immediately -> PASS", async function () {
    // The goTo_v3 schema's `anyOf: [integer, null]` union coerces a
    // step-level `null` to `0` under AJV's coerceTypes (integer branch tried
    // first) -- so `null` does NOT skip these checks; it becomes an
    // immediately-idle threshold. This asserts the real, observed behavior.
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver();
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 2000,
          waitUntil: { networkIdleTime: null, domIdleTime: null },
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
    assert.equal(result.description, "Opened URL and all wait conditions met.");
  });

  it("networkIdle active + poll loop then achieves idle -> PASS", async function () {
    // A fetch AND an XHR open fire shortly after start, so the 100ms
    // fast-path check sees recent activity (via both the fetch and the
    // XMLHttpRequest.prototype.open wrapper bodies) and falls into the poll
    // loop; once idleTime (150ms) of quiet has elapsed since the last
    // request, the loop breaks and PASSes.
    const stub = installBrowserStub({ ready: "complete" });
    stub.fireRequest(30);
    stub.fireXhrOpen(35);
    const driver = makeLiveDriver();
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 2000,
          waitUntil: { networkIdleTime: 150, domIdleTime: null },
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
  });

  it("networkIdle active + poll loop times out -> FAIL mentioning network idle timeout", async function () {
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver();
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 150, // small remainingTimeout so the poll loop times out quickly
          waitUntil: { networkIdleTime: 999999, domIdleTime: null },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Network idle timeout: Network idle timeout exceeded/);
  });

  it("domStable active + poll loop then achieves stability -> PASS", async function () {
    const stub = installBrowserStub({ ready: "complete" });
    stub.fireMutation(30);
    const driver = makeLiveDriver();
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 2000,
          waitUntil: { networkIdleTime: null, domIdleTime: 150 },
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
  });

  it("domStable active + poll loop times out -> FAIL mentioning DOM stability timeout", async function () {
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver();
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 150,
          waitUntil: { networkIdleTime: null, domIdleTime: 999999 },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(
      result.description,
      /DOM stability timeout: DOM stability check failed: DOM stability timeout exceeded/
    );
  });

  it("waitUntil.find present + element found -> PASS with elementFound message", async function () {
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver({ find$$candidates: [makeFindableElement()] });
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 2000,
          waitUntil: {
            networkIdleTime: null,
            domIdleTime: null,
            find: { selector: "#ready", elementText: "item" },
          },
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
  });

  it("waitUntil.find present + element never found -> FAIL with 'Element not found'", async function () {
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver({ find$$candidates: [] });
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 200,
          waitUntil: {
            networkIdleTime: null,
            domIdleTime: null,
            find: { selector: "#missing" },
          },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Element not found \(selector: "#missing"\)/);
  });

  it("waitUntil.find by elementText only (no selector) + found -> PASS, selectorMsg falsy branch", async function () {
    // Omitting `selector` exercises the ternary's falsy arm (selectorMsg ===
    // "") in the success-message-building branch.
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver({ find$$candidates: [makeFindableElement()] });
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 2000,
          waitUntil: {
            networkIdleTime: null,
            domIdleTime: null,
            find: { elementText: "item" },
          },
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
  });

  it("waitUntil.find by elementText only (no selector) + never found -> FAIL, selectorMsg falsy branch in catch", async function () {
    // Omitting `selector` (only elementText provided) exercises the ternary's
    // falsy arm for selectorMsg inside the catch block's message-building.
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver({ find$$candidates: [] });
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 200,
          waitUntil: {
            networkIdleTime: null,
            domIdleTime: null,
            find: { elementText: "nonexistent" },
          },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Element not found \(text: "nonexistent"\)/);
  });

  it("all three checks active together and all pass -> PASS", async function () {
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver({ find$$candidates: [makeFindableElement()] });
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 2000,
          waitUntil: {
            networkIdleTime: 0,
            domIdleTime: 0,
            find: { selector: "#ready" },
          },
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
  });

  it("defaults waitUntil.networkIdleTime/domIdleTime when waitUntil is omitted entirely", async function () {
    // No waitUntil at all -> goTo fills in { networkIdleTime: 500,
    // domIdleTime: 1000 }; both are active and hit the fast idle/stable path
    // immediately (no real network/DOM activity in the stub).
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver();
    const result = await goTo({
      config: {},
      step: { goTo: { url: "https://example.com", timeout: 2000 } },
      driver,
    });
    assert.equal(result.status, "PASS");
  });

  it("defaults only the missing waitUntil sub-fields when waitUntil is a partial object", async function () {
    // waitUntil present but only domIdleTime specified -> networkIdleTime
    // defaults to 500 and is still active (fast path).
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver();
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 2000,
          waitUntil: { domIdleTime: 0 },
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
  });

   it("Promise.allSettled failures: networkIdle rejects, domStable passes -> combined FAIL message reports both", async function () {
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver();
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 150,
          waitUntil: { networkIdleTime: 999999, domIdleTime: 0 },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Network idle timeout: Network idle timeout exceeded/);
    assert.match(result.description, /DOM stable/);
  });


  it("fills domIdleTime default (1000) when waitUntil.networkIdleTime is provided but domIdleTime is omitted", async function () {
    // Mirror of the domIdleTime-only partial test above: this time
    // networkIdleTime is explicitly provided and domIdleTime is omitted, so
    // goTo defaults domIdleTime to 1000 via the sibling branch of the same
    // if/else (waitUntil truthy -> per-field undefined checks).
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver();
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 2000,
          waitUntil: { networkIdleTime: 0 },
        },
      },
      driver,
    });
    assert.equal(result.status, "PASS");
  });

  it("elementFound passes while another check fails -> the passed elementFound line still appears in the FAIL summary", async function () {
    // find succeeds quickly (fast candidate) while networkIdle times out, so
    // the combined FAIL message must show elementFound as passed (the
    // `if (waitResults.elementFound.passed)` true branch) alongside the
    // network failure.
    installBrowserStub({ ready: "complete" });
    const driver = makeLiveDriver({ find$$candidates: [makeFindableElement()] });
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 150,
          waitUntil: {
            networkIdleTime: 999999,
            domIdleTime: 0,
            find: { selector: "#ready" },
          },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Network idle timeout: Network idle timeout exceeded/);
    assert.match(result.description, /Element found \(selector: "#ready"\)/);
  });

  it("DOM poll loop: an unexpected (non-timeout) execute failure hits the catch cleanup with the monitor still present", async function () {
    // Distinct from the "poll loop times out" test above: there, the timeout
    // branch (inside the try) does its own cleanup-then-throw, so by the
    // time the catch block re-checks the monitor it is already gone. Here we
    // inject a driver.execute failure on the DOM monitor's *second*
    // state-read (the first poll-loop iteration, after the fast-path check
    // already ran) so the catch block's own disconnect+delete actually
    // executes against a monitor that is still installed.
    installBrowserStub({ ready: "complete" });
    let domStateReadCount = 0;
    const driver = {
      url: async (u) => u,
      execute: async (fn, ...args) => {
        const src = fn.toString();
        const isDomStateRead =
          src.includes("lastMutationTime") &&
          !src.includes("disconnect") &&
          !src.includes("MutationObserver");
        if (isDomStateRead) {
          domStateReadCount++;
          // 1st call = fast-path check ("not yet stable" -> enters poll loop);
          // 2nd call = first poll iteration -> inject the failure here.
          if (domStateReadCount === 2) {
            throw new Error("simulated driver.execute failure");
          }
        }
        return fn(...args);
      },
      waitUntil: async (condition) => {
        const ok = await condition();
        if (!ok) throw new Error("not ready");
        return true;
      },
      pause: async () => {},
      $$: async () => [],
      $: async () => null,
    };
    const result = await goTo({
      config: {},
      step: {
        goTo: {
          url: "https://example.com",
          timeout: 2000,
          waitUntil: { networkIdleTime: 0, domIdleTime: 999999 },
        },
      },
      driver,
    });
    assert.equal(result.status, "FAIL");
    assert.match(
      result.description,
      /DOM stability timeout: DOM stability check failed: simulated driver\.execute failure/
    );
  });
});