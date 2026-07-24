// Unit tests for the any-browser → any-available-browser fallback primitives:
// buildFallbackCandidates (engine selection + policy) and driverSkipDiagnostic
// (the diagnostic skip message), plus ensureContextBrowserInstalled's Layer 3
// repair behavior (force-reinstalling a present-but-broken driver).
import assert from "node:assert";

let buildFallbackCandidates;
let driverSkipDiagnostic;
let ensureContextBrowserInstalled;
let resolveBrowserFallbackPolicy;
let resolveRetryPolicy;
let runContextWithRetries;
let shouldRepairBeforeFallback;

before(async function () {
  ({
    buildFallbackCandidates,
    driverSkipDiagnostic,
    ensureContextBrowserInstalled,
    resolveBrowserFallbackPolicy,
    resolveRetryPolicy,
    runContextWithRetries,
    shouldRepairBeforeFallback,
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

describe("resolveRetryPolicy (context overrides config, 0 preserved)", function () {
  it("uses the context-level retries when set, overriding config", function () {
    assert.equal(resolveRetryPolicy({ context: { retries: 3 }, config: { retries: 1 } }), 3);
  });

  it("falls back to the config-level retries when the context has none", function () {
    assert.equal(resolveRetryPolicy({ context: {}, config: { retries: 2 } }), 2);
  });

  it("defaults to 1 when neither context nor config sets retries", function () {
    assert.equal(resolveRetryPolicy({ context: {}, config: {} }), 1);
  });

  it("preserves an explicit 0 (disable) at either level — not treated as falsy", function () {
    // The whole point of `??` over `||`: retries:0 must disable, not fall
    // through to the default.
    assert.equal(resolveRetryPolicy({ context: { retries: 0 }, config: { retries: 5 } }), 0);
    assert.equal(resolveRetryPolicy({ context: {}, config: { retries: 0 } }), 0);
  });
});

describe("runContextWithRetries (mid-run session-death retry)", function () {
  // A fake runContext that FAILs with the retry hint for the first `failTimes`
  // attempts, then PASSes. Mirrors runContext's returned report shape; the
  // wrapper reads `_sessionDied` by property access.
  // No-op backoff so these tests don't pay the real 500ms-per-attempt sleep.
  const noDelay = () => 0;
  function fakeRunContext({ failTimes, died = true }) {
    let calls = 0;
    const fn = async (args) => {
      calls++;
      if (calls <= failTimes) {
        const report = { result: "FAIL", contextId: args.context.contextId, steps: [] };
        // Match production: the wrapper reads `_sessionDied` by name, and it is
        // non-enumerable on the real report.
        if (died) {
          Object.defineProperty(report, "_sessionDied", {
            value: true,
            enumerable: false,
            configurable: true,
          });
        }
        return report;
      }
      return { result: "PASS", contextId: args.context.contextId, steps: [] };
    };
    fn.calls = () => calls;
    return fn;
  }

  it("retries a dead-session FAIL and returns the fresh-session PASS, stamping retries", async function () {
    const fn = fakeRunContext({ failTimes: 1 });
    const report = await runContextWithRetries(
      { context: { contextId: "c1" }, config: { retries: 1 } },
      fn,
      noDelay
    );
    assert.equal(report.result, "PASS");
    assert.equal(fn.calls(), 2, "should have retried once");
    assert.equal(report.retries, 1, "recovered report should record 1 retry");
  });

  it("does NOT retry a live-session FAIL (no _sessionDied) — a real bug still fails", async function () {
    const fn = fakeRunContext({ failTimes: 1, died: false });
    const report = await runContextWithRetries(
      { context: { contextId: "c1" }, config: { retries: 3 } },
      fn,
      noDelay
    );
    assert.equal(report.result, "FAIL");
    assert.equal(fn.calls(), 1, "a live-session assertion FAIL must not retry");
    assert.equal(report.retries, undefined, "no retries stamped when none happened");
  });

  it("stops after exhausting the retries budget, returning the last FAIL", async function () {
    const fn = fakeRunContext({ failTimes: 99 }); // always dies
    const report = await runContextWithRetries(
      { context: { contextId: "c1" }, config: { retries: 2 } },
      fn,
      noDelay
    );
    assert.equal(report.result, "FAIL");
    assert.equal(fn.calls(), 3, "1 initial attempt + 2 retries");
    assert.equal(report.retries, 2, "exhausted report should record 2 retries");
  });

  it("does not retry when retries is 0 (disabled)", async function () {
    const fn = fakeRunContext({ failTimes: 1 });
    const report = await runContextWithRetries(
      { context: { contextId: "c1" }, config: { retries: 0 } },
      fn,
      noDelay
    );
    assert.equal(report.result, "FAIL");
    assert.equal(fn.calls(), 1);
  });

  it("restores the non-idempotent context fields (openApi/browser) before each retry", async function () {
    // The fake mutates context the way runContext does — appends openApi and
    // narrows browser to a fallback — so the wrapper must restore before the
    // retry, or attempt 2 would see accumulated openApi and the narrowed engine.
    const seen = [];
    const fn = async (args) => {
      seen.push({
        openApiLen: (args.context.openApi || []).length,
        browser: args.context.browser && { ...args.context.browser },
      });
      args.context.openApi = [...(args.context.openApi || []), { spec: "x" }];
      args.context.browser = { name: "firefox" }; // narrowed fallback
      if (seen.length === 1) {
        const r = { result: "FAIL", steps: [] };
        Object.defineProperty(r, "_sessionDied", {
          value: true,
          enumerable: false,
          configurable: true,
        });
        return r;
      }
      return { result: "PASS", steps: [] };
    };
    const context = { contextId: "c1", browser: { name: "chrome" } };
    await runContextWithRetries({ context, config: { retries: 1 } }, fn, noDelay);
    assert.equal(seen.length, 2, "should have run twice");
    assert.equal(seen[1].openApiLen, 0, "openApi restored, not accumulated");
    assert.deepEqual(
      seen[1].browser,
      { name: "chrome" },
      "browser restored to the originally-requested engine"
    );
  });
});

describe("shouldRepairBeforeFallback (repair before substituting engines)", function () {
  it("repairs the requested engine when it has driver assets and wasn't attempted yet", function () {
    assert.equal(
      shouldRepairBeforeFallback({
        candidateName: "firefox",
        requestedName: "firefox",
        installAttempts: new Map(),
      }),
      true
    );
  });

  it("treats webkit/safari as the same engine for the requested-match check", function () {
    assert.equal(
      shouldRepairBeforeFallback({
        candidateName: "safari",
        requestedName: "webkit",
        installAttempts: new Map(),
      }),
      // safari has no installable driver assets → not repairable
      false
    );
  });

  it("does NOT repair a fallback substitute (candidate != requested)", function () {
    assert.equal(
      shouldRepairBeforeFallback({
        candidateName: "chrome",
        requestedName: "firefox",
        installAttempts: new Map(),
      }),
      false
    );
  });

  it("does NOT repair an engine already attempted this run (memoized)", function () {
    assert.equal(
      shouldRepairBeforeFallback({
        candidateName: "firefox",
        requestedName: "firefox",
        installAttempts: new Map([["firefox", "failed"]]),
      }),
      false
    );
  });

  it("does NOT repair a browser with no installable driver assets (safari)", function () {
    assert.equal(
      shouldRepairBeforeFallback({
        candidateName: "safari",
        requestedName: "safari",
        installAttempts: new Map(),
      }),
      false
    );
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
  it("forces a clean reinstall of EVERY component (browser + driver) when repair=true", async function () {
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
    // Both the browser binary and its driver are forced — a partial/corrupt
    // component of either kind gets replaced, not just installed-if-missing.
    assert.deepEqual(calls, [
      { asset: "firefox", force: true },
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
