import assert from "node:assert/strict";
import {
  isSupportedContext,
  getDefaultBrowser,
  getDriverCapabilities,
} from "../dist/core/tests.js";

// A step that requires a browser driver, and one that doesn't.
const driverStep = { goTo: "https://example.com" };
const nonDriverStep = { runShell: "echo hi" };

describe("isSupportedContext", function () {
  const apps = [{ name: "chrome" }, { name: "firefox" }];

  it("supports a non-driver context on the current platform", function () {
    const context = { platform: "linux", steps: [nonDriverStep] };
    assert.equal(
      isSupportedContext({ context, apps, platform: "linux" }),
      true
    );
  });

  it("rejects a context on a different platform", function () {
    const context = { platform: "windows", steps: [nonDriverStep] };
    assert.equal(
      isSupportedContext({ context, apps, platform: "linux" }),
      false
    );
  });

  it("supports a driver context whose browser is available", function () {
    const context = {
      platform: "linux",
      browser: { name: "chrome" },
      steps: [driverStep],
    };
    assert.equal(
      isSupportedContext({ context, apps, platform: "linux" }),
      true
    );
  });

  it("rejects a driver context whose named browser is not available", function () {
    const context = {
      platform: "linux",
      browser: { name: "safari" },
      steps: [driverStep],
    };
    assert.equal(
      isSupportedContext({ context, apps, platform: "linux" }),
      false
    );
  });

  it("rejects a driver-required context with no resolvable browser name", function () {
    // This is the case that produced "Failed to start context 'undefined'":
    // a driver is required but the browser object carries no name.
    const context = {
      platform: "windows",
      browser: { headless: true },
      steps: [driverStep],
    };
    assert.equal(
      isSupportedContext({ context, apps, platform: "windows" }),
      false
    );
  });

  it("rejects a driver-required context with an empty browser object", function () {
    const context = {
      platform: "linux",
      browser: {},
      steps: [driverStep],
    };
    assert.equal(
      isSupportedContext({ context, apps, platform: "linux" }),
      false
    );
  });
});

describe("getDefaultBrowser", function () {
  it("returns the first available browser by preference order", function () {
    const runnerDetails = {
      availableApps: [{ name: "chrome" }, { name: "firefox" }],
    };
    // getDefaultBrowser walks its browserNames preference list
    // (["firefox", "chrome", "safari"] in src/core/tests.ts) and returns the
    // first available, so firefox wins over chrome here.
    assert.deepEqual(getDefaultBrowser({ runnerDetails }), {
      name: "firefox",
    });
  });

  it("returns an empty object when no supported browser is available", function () {
    const runnerDetails = { availableApps: [{ name: "node" }] };
    assert.deepEqual(getDefaultBrowser({ runnerDetails }), {});
  });
});

describe("getDriverCapabilities", function () {
  const baseRunner = {
    environment: { platform: "linux" },
    availableApps: [
      { name: "chrome", path: "/usr/bin/chrome", driver: "/usr/bin/chromedriver" },
      { name: "safari", path: "" },
    ],
  };
  const options = { width: 1200, height: 800, headless: true };

  it("throws a clear error for a missing browser name", function () {
    assert.throws(
      () =>
        getDriverCapabilities({
          runnerDetails: baseRunner,
          name: undefined,
          options,
        }),
      /unknown or missing browser name/i
    );
  });

  it("throws a clear error for an unknown browser name", function () {
    assert.throws(
      () =>
        getDriverCapabilities({
          runnerDetails: baseRunner,
          name: "edge",
          options,
        }),
      /unknown or missing browser name/i
    );
  });

  it("builds chrome capabilities", function () {
    const caps = getDriverCapabilities({
      runnerDetails: baseRunner,
      name: "chrome",
      options,
    });
    assert.equal(caps.browserName, "chrome");
  });

  it("builds safari capabilities for the webkit alias", function () {
    // resolveContexts rewrites `safari` -> `webkit`, so the runtime name is
    // `webkit`. It must still map to Safari capabilities.
    const caps = getDriverCapabilities({
      runnerDetails: baseRunner,
      name: "webkit",
      options,
    });
    assert.equal(caps.browserName, "Safari");
  });
});
