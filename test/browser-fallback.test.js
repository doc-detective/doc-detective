// Unit tests for the any-browser → any-available-browser fallback primitives:
// buildFallbackCandidates (engine selection + policy) and driverSkipDiagnostic
// (the diagnostic skip message), plus ensureContextBrowserInstalled's Layer 3
// repair behavior (force-reinstalling a present-but-broken driver).
import assert from "node:assert";

let buildFallbackCandidates;
let driverSkipDiagnostic;
let ensureContextBrowserInstalled;
let resolveBrowserFallbackPolicy;

before(async function () {
  ({
    buildFallbackCandidates,
    driverSkipDiagnostic,
    ensureContextBrowserInstalled,
    resolveBrowserFallbackPolicy,
  } = await import("../dist/core/tests.js"));
});

const apps = (...names) => names.map((name) => ({ name }));

describe("buildFallbackCandidates", function () {
  it("tries the requested engine first when it is available", function () {
    const out = buildFallbackCandidates({
      requestedName: "firefox",
      explicit: true,
      policy: "auto",
      availableApps: apps("firefox", "chrome"),
    });
    assert.equal(out[0], "firefox");
  });

  it("auto policy falls back from any browser to any other available browser (both directions)", function () {
    // firefox → chrome
    assert.deepEqual(
      buildFallbackCandidates({
        requestedName: "firefox",
        explicit: true,
        policy: "auto",
        availableApps: apps("firefox", "chrome"),
      }),
      ["firefox", "chrome"]
    );
    // chrome → firefox
    assert.deepEqual(
      buildFallbackCandidates({
        requestedName: "chrome",
        explicit: true,
        policy: "auto",
        availableApps: apps("firefox", "chrome"),
      }),
      ["chrome", "firefox"]
    );
  });

  it("includes safari/webkit as both a source and a target", function () {
    // safari (webkit) → chrome
    assert.deepEqual(
      buildFallbackCandidates({
        requestedName: "webkit",
        explicit: false,
        policy: "auto",
        availableApps: apps("safari", "chrome"),
      }),
      ["webkit", "chrome"]
    );
    // chrome → safari
    assert.deepEqual(
      buildFallbackCandidates({
        requestedName: "chrome",
        explicit: false,
        policy: "auto",
        availableApps: apps("chrome", "safari"),
      }),
      ["chrome", "safari"]
    );
  });

  it("falls straight to other engines when the requested engine is unavailable (broken driver excluded by Layer 2)", function () {
    const out = buildFallbackCandidates({
      requestedName: "firefox",
      explicit: true,
      policy: "auto",
      availableApps: apps("chrome"), // firefox not available
    });
    assert.deepEqual(out, ["chrome"]);
  });

  it("explicit policy does NOT fall back for an explicitly pinned browser", function () {
    const out = buildFallbackCandidates({
      requestedName: "firefox",
      explicit: true,
      policy: "explicit",
      availableApps: apps("firefox", "chrome"),
    });
    assert.deepEqual(out, ["firefox"]);
  });

  it("explicit policy DOES fall back for an auto-selected (non-explicit) browser", function () {
    const out = buildFallbackCandidates({
      requestedName: "firefox",
      explicit: false,
      policy: "explicit",
      availableApps: apps("firefox", "chrome"),
    });
    assert.deepEqual(out, ["firefox", "chrome"]);
  });

  it("off policy never falls back — only the requested engine if available", function () {
    assert.deepEqual(
      buildFallbackCandidates({
        requestedName: "firefox",
        explicit: false,
        policy: "off",
        availableApps: apps("firefox", "chrome"),
      }),
      ["firefox"]
    );
    // requested unavailable + off → no candidates → caller skips
    assert.deepEqual(
      buildFallbackCandidates({
        requestedName: "firefox",
        explicit: false,
        policy: "off",
        availableApps: apps("chrome"),
      }),
      []
    );
  });

  it("returns an empty list when nothing is available", function () {
    assert.deepEqual(
      buildFallbackCandidates({
        requestedName: "firefox",
        explicit: true,
        policy: "auto",
        availableApps: [],
      }),
      []
    );
  });
});

describe("resolveBrowserFallbackPolicy (context overrides config)", function () {
  it("uses the context-level policy when set, overriding config", function () {
    assert.equal(
      resolveBrowserFallbackPolicy({
        context: { browserFallback: "off" },
        config: { browserFallback: "auto" },
      }),
      "off"
    );
  });

  it("falls back to the config-level policy when the context has none", function () {
    assert.equal(
      resolveBrowserFallbackPolicy({
        context: {},
        config: { browserFallback: "explicit" },
      }),
      "explicit"
    );
  });

  it("defaults to 'auto' when neither context nor config sets a policy", function () {
    assert.equal(resolveBrowserFallbackPolicy({ context: {}, config: {} }), "auto");
  });
});

describe("driverSkipDiagnostic", function () {
  it("names the requested engine and the partial-download cause", function () {
    const msg = driverSkipDiagnostic({
      requestedName: "firefox",
      platform: "windows",
      platformMatches: true,
      attemptedFallback: false,
    });
    assert.match(msg, /firefox/);
    assert.match(msg, /partial/i);
  });

  it("names the driver for the actual requested engine (not always geckodriver)", function () {
    const chrome = driverSkipDiagnostic({
      requestedName: "chrome",
      platform: "linux",
      platformMatches: true,
      attemptedFallback: false,
    });
    assert.match(chrome, /chromedriver/);
    const webkit = driverSkipDiagnostic({
      requestedName: "webkit",
      platform: "mac",
      platformMatches: true,
      attemptedFallback: false,
    });
    assert.match(webkit, /safaridriver/);
  });

  it("notes when a cross-browser fallback was attempted but exhausted", function () {
    const msg = driverSkipDiagnostic({
      requestedName: "firefox",
      platform: "windows",
      platformMatches: true,
      attemptedFallback: true,
      lastError: "boom",
    });
    assert.match(msg, /no other available browser/i);
    assert.match(msg, /boom/);
  });

  it("reports a platform mismatch distinctly (no fallback implied)", function () {
    const msg = driverSkipDiagnostic({
      requestedName: "firefox",
      platform: "mac",
      platformMatches: false,
      attemptedFallback: false,
    });
    assert.match(msg, /different platform/i);
  });
});

describe("ensureContextBrowserInstalled repair (Layer 3)", function () {
  it("forces a clean reinstall of the driver asset (not the browser binary) when repair=true", async function () {
    const calls = [];
    const result = await ensureContextBrowserInstalled({
      browserName: "firefox",
      config: {},
      installAttempts: new Map(),
      deps: {
        ensureBrowser: async (asset, options) => {
          calls.push({ asset, force: !!options.force });
        },
      },
      repair: true,
    });
    assert.equal(result, "installed");
    // Driver asset forced; browser binary not forced.
    assert.deepEqual(calls, [
      { asset: "firefox", force: false },
      { asset: "geckodriver", force: true },
    ]);
  });

  it("does not force anything when repair is omitted (back-compat)", async function () {
    const calls = [];
    await ensureContextBrowserInstalled({
      browserName: "chrome",
      config: {},
      installAttempts: new Map(),
      deps: {
        ensureBrowser: async (asset, options) => {
          calls.push({ asset, force: !!options.force });
        },
      },
    });
    assert.deepEqual(calls, [
      { asset: "chrome", force: false },
      { asset: "chromedriver", force: false },
    ]);
  });
});
