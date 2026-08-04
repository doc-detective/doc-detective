// goTo must not report success when the browser never actually left its
// initial blank document.
//
// ADR 01084 characterized the mode: a fresh Chromium session on windows-latest
// occasionally stays parked on `data:,` — alive, not a crash page, simply never
// navigated. That ADR's remedy probes only the context's PRIMARY session, so a
// SECONDARY session opened by `startSurface` is not covered: `goTo` issues the
// navigation, the URL never changes, `goTo` reports "all wait conditions met",
// and the mystery surfaces much later as a `find` that times out against a page
// that was never loaded (issue #696).
import assert from "node:assert/strict";
import { goTo } from "../dist/core/tests/goTo.js";

// goTo's readiness gate runs `document.readyState` through `execute`, so the
// stub driver needs the same browser globals the sibling goTo suites install.
function installBrowserStub() {
  global.document = { readyState: "complete", body: {} };
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

function makeDriver({ urls }) {
  // `urls` is the sequence getUrl() returns, one per call; the last value
  // repeats once exhausted.
  const record = { navigations: [], order: [], getUrlCalls: 0 };
  let i = 0;
  const driver = {
    capabilities: { browserName: "chrome" },
    state: {},
    url: async (u) => {
      record.navigations.push(u);
      record.order.push("nav");
      return u;
    },
    getUrl: async () => {
      record.getUrlCalls++;
      const v = urls[Math.min(i, urls.length - 1)];
      i++;
      return v;
    },
    execute: async (fn, ...args) => fn(...args),
    waitUntil: async (condition) => {
      record.order.push("wait");
      for (let n = 0; n < 500; n++) {
        if (await condition()) return true;
        await new Promise((r) => setTimeout(r, 1));
      }
      throw new Error("waitUntil exhausted");
    },
    pause: async () => {},
    $$: async () => [{ elementId: "el-1" }],
    $: async () => null,
  };
  return { driver, record };
}

const step = () => ({
  goTo: {
    url: "http://localhost:8092/multi-tab-child.html?page=par1",
    timeout: 4000,
    waitUntil: { networkIdleTime: null, domIdleTime: null },
  },
});

describe("goTo: browser never left its initial blank document", function () {
  this.timeout(10000);
  beforeEach(installBrowserStub);
  afterEach(uninstallBrowserStub);

  it("FAILs instead of reporting success when the session stays on data:,", async function () {
    // Every getUrl reports the empty data URL: the navigation silently did not
    // take. Reporting PASS here is what made #696 undiagnosable for days.
    const { driver, record } = makeDriver({ urls: ["data:,"] });
    const result = await goTo({ config: {}, step: step(), driver });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /never left|blank document|didn't navigate|did not navigate/i);
    // Exactly two probes: one pre-wait decision, one for the guard that both
    // decides AND supplies the reported URL. A third would mean the guard is
    // deciding on one observation and printing another.
    assert.equal(
      record.getUrlCalls,
      2,
      "guard must decide and report from a single URL read"
    );
  });

  it("retries the navigation once and PASSes when the retry takes", async function () {
    // First check shows the session still parked; after a re-issued navigation
    // it is on the real page. This is the flake healing itself.
    const { driver, record } = makeDriver({
      urls: ["data:,", "http://localhost:8092/multi-tab-child.html?page=par1"],
    });
    const result = await goTo({ config: {}, step: step(), driver });
    assert.equal(result.status, "PASS");
    assert.equal(
      record.navigations.length,
      2,
      "expected the navigation to be re-issued once"
    );
  });

  it("does not re-navigate a normal, successful navigation", async function () {
    // Guard against the fix costing every healthy goTo an extra round-trip.
    const { driver, record } = makeDriver({
      urls: ["http://localhost:8092/multi-tab-child.html?page=par1"],
    });
    const result = await goTo({ config: {}, step: step(), driver });
    assert.equal(result.status, "PASS");
    assert.equal(record.navigations.length, 1);
    // ADR 01088 claims the healthy path costs exactly one extra getUrl(). Pin
    // it: the post-wait guard is gated on a retry having fired, so a clean
    // navigation must not pay a second probe.
    assert.equal(
      record.getUrlCalls,
      1,
      "healthy navigation must probe the URL exactly once"
    );
  });

  it("re-navigates BEFORE the wait conditions run, not after", async function () {
    // The whole point of the fix is that the readiness gate must be evaluated
    // against the real page. Retrying after the waits would leave goTo saying
    // "all wait conditions met" for conditions only ever checked against the
    // blank document — the same report-success-without-verifying bug this fix
    // exists to remove.
    const { driver, record } = makeDriver({
      urls: ["data:,", "http://localhost:8092/multi-tab-child.html?page=par1"],
    });
    const result = await goTo({ config: {}, step: step(), driver });
    assert.equal(result.status, "PASS");
    assert.deepEqual(
      record.order.slice(0, 2),
      ["nav", "nav"],
      "the retry must precede any wait; got: " + record.order.join(",")
    );
    assert.ok(
      record.order.indexOf("wait") > record.order.lastIndexOf("nav"),
      "every wait must run after the final navigation; got: " + record.order.join(",")
    );
  });

  it("does not treat a page sitting on about:blank as unnavigated", async function () {
    // ADR 01084 excludes about:blank deliberately: unlike `data:,`, it is a page
    // a test can legitimately navigate to, so treating it as "never navigated"
    // would retry and then FAIL a correct run.
    //
    // This asserts the PREDICATE, not URL handling: the step navigates to a
    // normal URL and the session reports about:blank, which must not trigger
    // the retry or the guard. (goTo mangles a literal `about:blank` URL into
    // `https://about:blank` before validation — a real pre-existing bug, but a
    // separate one: the prefix is what makes bare `localhost:8092/x` pass the
    // schema, so fixing it needs a coordinated goTo_v3 change.)
    const { driver, record } = makeDriver({ urls: ["about:blank"] });
    const result = await goTo({ config: {}, step: step(), driver });
    assert.equal(result.status, "PASS");
    assert.equal(record.navigations.length, 1, "must not retry on about:blank");
  });
});
