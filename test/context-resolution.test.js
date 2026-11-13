import assert from "node:assert/strict";
import {
  isSupportedContext,
  getDefaultBrowser,
  getDriverCapabilities,
  withDriverPort,
  combinationKey,
  warmUpDecision,
  contextRequirementsSkipMessage,
  prepareContextSlot,
  forcedHeadedMessage,
} from "../dist/core/tests.js";
import {
  GECKODRIVER_EXECUTABLE_ARGS,
  PROTECTED_CAPABILITIES,
  applyDriverOptions,
} from "../dist/core/tests/geckoDriver.js";
import { resolveContexts } from "../dist/core/resolveTests.js";
import { findFreePort } from "../dist/core/utils.js";

// A step that requires a browser driver, and one that doesn't.
const driverStep = { goTo: "https://example.com" };
const nonDriverStep = { runShell: "echo hi" };

describe("combinationKey", function () {
  it("builds a platform::browser key for a named browser", function () {
    assert.equal(
      combinationKey({ platform: "linux", browser: { name: "chrome" } }),
      "linux::chrome"
    );
  });

  it("normalizes webkit to safari", function () {
    assert.equal(
      combinationKey({ platform: "mac", browser: { name: "webkit" } }),
      "mac::safari"
    );
  });

  it("uses <none> when no browser is resolved", function () {
    assert.equal(
      combinationKey({ platform: "windows" }),
      "windows::<none>"
    );
  });

  it("uses <none> when the browser object has no name", function () {
    assert.equal(
      combinationKey({ platform: "linux", browser: {} }),
      "linux::<none>"
    );
  });
});

describe("warmUpDecision", function () {
  it("skips a combination that previously failed", function () {
    assert.equal(warmUpDecision("failed"), "skip");
  });

  it("attempts a combination that previously succeeded", function () {
    assert.equal(warmUpDecision("ok"), "attempt");
  });

  it("attempts a combination not yet seen this run", function () {
    assert.equal(warmUpDecision(undefined), "attempt");
  });
});

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

  it("supports a webkit context when Safari is available", function () {
    // resolveContexts normalizes safari -> webkit, but getAvailableApps reports
    // Safari as `safari`. A webkit context must still be supported on macOS so
    // it isn't skipped before getDriverCapabilities applies the same alias.
    const macApps = [{ name: "safari" }];
    const context = {
      platform: "mac",
      browser: { name: "webkit" },
      steps: [driverStep],
    };
    assert.equal(
      isSupportedContext({ context, apps: macApps, platform: "mac" }),
      true
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

describe("resolveContexts with platform-less runOn entries", function () {
  // A `requires`-only runOn entry is legal (context_v3 has no required
  // fields): it must expand without crashing, leaving `platform`/`browser`
  // unset so runContext fills them at run time — the same semantics as a
  // test with no runOn at all.
  it("expands a requires-only entry for a non-driver test", function () {
    const contexts = resolveContexts({
      contexts: [{ requires: "node" }],
      test: { testId: "t", steps: [nonDriverStep] },
      config: {},
    });
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].platform, undefined);
    assert.equal(contexts[0].requires, "node");
  });

  it("expands a requires-only entry for a driver test without a browser (runtime default fills it)", function () {
    const contexts = resolveContexts({
      contexts: [{ requires: "node" }],
      test: { testId: "t", steps: [driverStep] },
      config: {},
    });
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].browser, undefined);
    assert.equal(contexts[0].requires, "node");
  });

  it("keeps entries that differ only by requires distinct (dedupe identity)", function () {
    const contexts = resolveContexts({
      contexts: [
        { platforms: ["linux"], requires: "node" },
        { platforms: ["linux"], requires: "ffmpeg" },
        { platforms: ["linux"] },
      ],
      test: { testId: "t", steps: [nonDriverStep] },
      config: {},
    });
    assert.equal(contexts.length, 3);
    assert.deepEqual(
      contexts.map((c) => c.requires),
      ["node", "ffmpeg", undefined]
    );
  });

  it("carries requires onto each platform-expanded static context", function () {
    const contexts = resolveContexts({
      contexts: [{ platforms: ["linux", "windows"], requires: ["node"] }],
      test: { testId: "t", steps: [nonDriverStep] },
      config: {},
    });
    assert.equal(contexts.length, 2);
    for (const context of contexts) {
      assert.deepEqual(context.requires, ["node"]);
    }
    assert.deepEqual(
      contexts.map((c) => c.platform),
      ["linux", "windows"]
    );
  });
});

describe("resolveContexts safari/webkit aliasing", function () {
  // On desktop platforms `safari` is an alias for the `webkit` engine. On an
  // `ios` platform entry it must stay `safari`: mobile web on iOS drives the
  // real Safari on the managed simulator (phase A5), and `webkit` (the
  // desktop engine) is an unsupported mobile combination.
  it("rewrites safari to webkit on a desktop platform entry", function () {
    const contexts = resolveContexts({
      contexts: [{ platforms: "mac", browsers: "safari" }],
      test: { testId: "t", steps: [driverStep] },
      config: {},
    });
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].browser.name, "webkit");
  });

  it("keeps safari as safari on an ios platform entry", function () {
    const contexts = resolveContexts({
      contexts: [{ platforms: "ios", browsers: "safari" }],
      test: { testId: "t", steps: [driverStep] },
      config: {},
    });
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].browser.name, "safari");
    assert.equal(contexts[0].browser.explicit, true);
  });

  it("splits a mixed desktop+ios entry per platform: webkit on mac, safari on ios", function () {
    const contexts = resolveContexts({
      contexts: [{ platforms: ["mac", "ios"], browsers: "safari" }],
      test: { testId: "t", steps: [driverStep] },
      config: {},
    });
    assert.equal(contexts.length, 2);
    const byPlatform = Object.fromEntries(
      contexts.map((c) => [c.platform, c.browser.name])
    );
    assert.deepEqual(byPlatform, { mac: "webkit", ios: "safari" });
  });

  it("keeps safari as safari on an android platform entry (unsupported combo is a runtime SKIP, not an alias)", function () {
    const contexts = resolveContexts({
      contexts: [{ platforms: "android", browsers: "safari" }],
      test: { testId: "t", steps: [driverStep] },
      config: {},
    });
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].browser.name, "safari");
  });

  it("rewrites safari to webkit when the entry has no platforms (runtime host is desktop)", function () {
    const contexts = resolveContexts({
      contexts: [{ browsers: "safari" }],
      test: { testId: "t", steps: [driverStep] },
      config: {},
    });
    assert.equal(contexts.length, 1);
    assert.equal(contexts[0].browser.name, "webkit");
  });

  it("does not leak the per-pair rewrite across platforms via a shared browser object", function () {
    // Two entries sharing one authored browsers array shape: the ios pair must
    // not mutate the object the mac pair receives (clone-per-pair).
    const contexts = resolveContexts({
      contexts: [{ platforms: ["ios", "mac"], browsers: ["safari"] }],
      test: { testId: "t", steps: [driverStep] },
      config: {},
    });
    const ios = contexts.find((c) => c.platform === "ios");
    const mac = contexts.find((c) => c.platform === "mac");
    assert.equal(ios.browser.name, "safari");
    assert.equal(mac.browser.name, "webkit");
    assert.notEqual(ios.browser, mac.browser);
  });

  it("gives every platform pair its own browser object (no shared references even without a rewrite)", function () {
    // android+ios with one authored browser: neither pair hits the webkit
    // rewrite, but the contexts must still not share one object — a later
    // per-context mutation must never bleed into a sibling context.
    const contexts = resolveContexts({
      contexts: [{ platforms: ["android", "ios"], browsers: "safari" }],
      test: { testId: "t", steps: [driverStep] },
      config: {},
    });
    assert.equal(contexts.length, 2);
    const android = contexts.find((c) => c.platform === "android");
    const ios = contexts.find((c) => c.platform === "ios");
    assert.equal(android.browser.name, "safari");
    assert.equal(ios.browser.name, "safari");
    assert.notEqual(android.browser, ios.browser);
  });
});

describe("contextRequirementsSkipMessage", function () {
  // Deps that report nothing available / everything available.
  const nothing = {
    commandExists: () => false,
    existsSync: () => false,
    env: {},
  };
  const everything = {
    commandExists: () => true,
    existsSync: () => true,
    env: { API_TOKEN: "set" },
  };

  it("returns null when the context has no requires", function () {
    assert.equal(
      contextRequirementsSkipMessage({ context: { platform: "linux" } }),
      null
    );
  });

  it("returns null when every requirement is met", function () {
    assert.equal(
      contextRequirementsSkipMessage({
        context: {
          platform: "linux",
          requires: { commands: ["node"], env: ["API_TOKEN"] },
        },
        deps: everything,
      }),
      null
    );
  });

  it("names each unmet requirement in the skip message", function () {
    const message = contextRequirementsSkipMessage({
      context: {
        platform: "windows",
        requires: {
          commands: ["adb"],
          files: ["$HOME/.config/app.toml"],
          env: ["API_TOKEN"],
        },
      },
      deps: nothing,
    });
    assert.ok(message.startsWith("Skipped: unmet requirements: "), message);
    assert.ok(message.endsWith("."), message);
    assert.match(message, /command `adb`/);
    assert.match(message, /file `\$HOME\/\.config\/app\.toml`/);
    assert.match(message, /environment variable `API_TOKEN`/);
  });

  it("handles the string shorthand as a required command", function () {
    const message = contextRequirementsSkipMessage({
      context: { platform: "mac", requires: "claude" },
      deps: nothing,
    });
    assert.match(message, /command `claude`/);
  });
});

describe("getDefaultBrowser", function () {
  it("returns the first available browser by preference order", function () {
    const runnerDetails = {
      availableApps: [{ name: "firefox" }, { name: "chrome" }],
    };
    // getDefaultBrowser walks its browserNames preference list
    // (["chrome", "firefox", "safari"] in src/core/tests.ts, ADR 01176) and
    // returns the first available, so chrome wins over firefox here.
    assert.deepEqual(getDefaultBrowser({ runnerDetails }), {
      name: "chrome",
    });
  });

  it("falls back to firefox, then safari, when chrome isn't available", function () {
    assert.deepEqual(
      getDefaultBrowser({
        runnerDetails: { availableApps: [{ name: "safari" }, { name: "firefox" }] },
      }),
      { name: "firefox" }
    );
    assert.deepEqual(
      getDefaultBrowser({ runnerDetails: { availableApps: [{ name: "safari" }] } }),
      { name: "safari" }
    );
  });

  it("returns an empty object when no supported browser is available", function () {
    const runnerDetails = { availableApps: [{ name: "node" }] };
    assert.deepEqual(getDefaultBrowser({ runnerDetails }), {});
  });
});

// prepareContextSlot settles the default browser before the concurrency calc,
// so a record step's engine resolves to what will run (ADR 01176).
describe("prepareContextSlot default browser", function () {
  const runnerDetails = {
    availableApps: [{ name: "firefox" }, { name: "chrome" }],
  };
  const prepare = (context, config = {}) =>
    prepareContextSlot({
      config,
      spec: {},
      test: {},
      context,
      slot: 0,
      usedContextIds: new Set(),
      specGuardSkip: false,
      testGuardSkip: false,
      recordingNameConflict: null,
      runnerDetails,
      contexts: [],
      onAutoRecord: () => {},
    });

  it("gives a record context with no browser headless chrome, not headed chrome", function () {
    const context = { steps: [driverStep, { record: true }, { stopRecord: true }] };
    const result = prepare(context);
    assert.equal(result.kind, "job");
    assert.deepEqual(context.browser, { name: "chrome" });
  });

  it("gives any browser context with no browser the default browser", function () {
    const context = { steps: [driverStep] };
    prepare(context);
    assert.deepEqual(context.browser, { name: "chrome" });
  });

  it("keeps an authored browser", function () {
    const context = {
      browser: { name: "firefox", headless: true },
      steps: [driverStep, { record: true }],
    };
    prepare(context);
    assert.deepEqual(context.browser, { name: "firefox", headless: true });
  });

  it("leaves non-browser and mobile contexts without a browser", function () {
    const shell = { steps: [nonDriverStep] };
    prepare(shell);
    assert.equal(shell.browser, undefined);
    const mobile = { platform: "android", steps: [driverStep, { record: true }] };
    prepare(mobile);
    assert.equal(mobile.browser, undefined);
  });
});

// ADR 01177, DA1a: autoRecord runs headless Firefox headed so ffmpeg can
// record it, but only when the preflight says the host can capture.
describe("prepareContextSlot forced headed", function () {
  const runnerDetails = { availableApps: [{ name: "chrome" }, { name: "firefox" }] };
  const prepare = (context, { config = {}, recordingPreflight } = {}) => {
    const forced = [];
    const result = prepareContextSlot({
      config: { logLevel: "silent", ...config },
      spec: {},
      test: {},
      context,
      slot: 0,
      usedContextIds: new Set(),
      specGuardSkip: false,
      testGuardSkip: false,
      recordingNameConflict: null,
      runnerDetails,
      contexts: [],
      onAutoRecord: () => {},
      onForcedHeaded: () => forced.push(context.contextId),
      recordingPreflight,
    });
    return { result, forced };
  };
  const passed = { ffmpeg: { ok: true } };
  const failed = { ffmpeg: { ok: false, reason: "r", fix: "f" } };
  const firefox = () => ({ browser: { name: "firefox", headless: true }, steps: [driverStep] });

  it("runs headless Firefox headed when autoRecord is on and the preflight passed", function () {
    for (const config of [{}, { autoRecord: true }]) {
      const context = firefox();
      const { forced } = prepare(context, { config, recordingPreflight: passed });
      assert.equal(context.browser.headless, false, JSON.stringify(config));
      assert.equal(forced.length, 1);
      assert.equal(context.steps[0].record.engine, "ffmpeg");
    }
  });

  it("keeps headless Firefox headless when the preflight failed", function () {
    const context = firefox();
    const { forced } = prepare(context, { recordingPreflight: failed });
    assert.equal(context.browser.headless, true);
    assert.equal(forced.length, 0);
    // Unset: nothing to record.
    assert.ok(!context.steps.some((s) => s.__autoRecord));
  });

  it("leaves headless Firefox alone when autoRecord is false", function () {
    const context = firefox();
    const { forced } = prepare(context, {
      config: { autoRecord: false },
      recordingPreflight: passed,
    });
    assert.equal(context.browser.headless, true);
    assert.equal(forced.length, 0);
  });

  it("leaves headless Chrome alone: it records its tab", function () {
    const context = { browser: { name: "chrome", headless: true }, steps: [driverStep] };
    const { forced } = prepare(context, { recordingPreflight: passed });
    assert.equal(context.browser.headless, true);
    assert.equal(forced.length, 0);
    assert.equal(context.steps[0].record.engine, "browser");
  });

  it("hands the preflight to the context for startRecording", function () {
    const context = firefox();
    prepare(context, { recordingPreflight: failed });
    assert.deepEqual(context.__recordingPreflight, failed);
  });
});

describe("forcedHeadedMessage", function () {
  it("says how many headless Firefox contexts run headed", function () {
    assert.equal(
      forcedHeadedMessage(2),
      "Running 2 headless Firefox contexts headed so autoRecord can record them. Set `autoRecord: false` to keep them headless."
    );
    assert.equal(
      forcedHeadedMessage(1),
      "Running 1 headless Firefox context headed so autoRecord can record it. Set `autoRecord: false` to keep it headless."
    );
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

  // Headless Chrome has no window to pick, so the browser engine captures the
  // tab whose title matches (ADR 01176).
  it("auto-selects the tab capture source by title when headless", function () {
    const caps = getDriverCapabilities({
      runnerDetails: baseRunner,
      name: "chrome",
      options: { ...options, headless: true, captureSourceTitle: "RECORD_ME_1_ctx" },
    });
    const args = caps["goog:chromeOptions"].args;
    assert.ok(
      args.includes("--auto-select-tab-capture-source-by-title=RECORD_ME_1_ctx"),
      args.join(" ")
    );
    assert.ok(args.includes("--headless"));
  });

  it("falls back to the shared tab capture title when none is given", function () {
    const caps = getDriverCapabilities({
      runnerDetails: baseRunner,
      name: "chrome",
      options: { ...options, headless: true },
    });
    assert.ok(
      caps["goog:chromeOptions"].args.includes(
        "--auto-select-tab-capture-source-by-title=RECORD_ME"
      )
    );
  });

  it("leaves the tab capture flag off headed chrome", function () {
    const caps = getDriverCapabilities({
      runnerDetails: baseRunner,
      name: "chrome",
      options: { ...options, headless: false, captureSourceTitle: "T" },
    });
    const args = caps["goog:chromeOptions"].args;
    assert.ok(!args.some((a) => a.startsWith("--auto-select-tab-capture-source-by-title")));
    assert.ok(args.includes("--auto-select-desktop-capture-source=T"));
  });

  it("keeps chrome on classic WebDriver with no BiDi socket", function () {
    // ADR 01072 (rejected): a BiDi `webSocketUrl` socket for viewport emulation
    // crashed headed recording contexts, so chrome stays classic with no socket.
    const caps = getDriverCapabilities({
      runnerDetails: baseRunner,
      name: "chrome",
      options,
    });
    assert.equal(caps["wdio:enforceWebDriverClassic"], true);
    assert.equal(caps["webSocketUrl"], undefined);
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

  // Firefox: appium-geckodriver resolves its binary from the
  // `geckodriverExecutable` capability or, failing that, PATH. Doc Detective
  // manages its own geckodriver in the browsers cache, which is not on PATH,
  // so the capability is the only way a managed install ever gets used.
  const firefoxRunner = {
    environment: { platform: "linux" },
    availableApps: [
      {
        name: "firefox",
        path: "/opt/firefox/firefox",
        driver: "/opt/dd/browsers/geckodriver-0.37.1",
      },
    ],
  };

  it("points firefox at the managed geckodriver binary", function () {
    const caps = getDriverCapabilities({
      runnerDetails: firefoxRunner,
      name: "firefox",
      options,
    });
    assert.equal(caps.browserName, "MozillaFirefox");
    assert.equal(
      caps["appium:geckodriverExecutable"],
      "/opt/dd/browsers/geckodriver-0.37.1"
    );
  });

  it("omits the geckodriver capability when no driver path was resolved", function () {
    // Layer 4 degradation: with no resolvable binary the session falls back to
    // whatever `geckodriver` is on PATH, exactly as before this capability
    // existed. Emitting an empty/undefined value instead would be a hard
    // SessionNotCreatedError.
    const caps = getDriverCapabilities({
      runnerDetails: {
        environment: { platform: "linux" },
        availableApps: [{ name: "firefox", path: "/opt/firefox/firefox" }],
      },
      name: "firefox",
      options,
    });
    assert.equal(caps.browserName, "MozillaFirefox");
    assert.ok(!("appium:geckodriverExecutable" in caps));
  });

  it("does not pin a fixed chromedriver port in chrome capabilities", function () {
    // The chromedriver port must be assigned per-driver (a unique free port),
    // never baked into the caps at a fixed default. Two concurrent browser
    // contexts that shared the chromedriver default port (9515) would collide
    // — one driver's connection is refused mid-session (ECONNREFUSED :9515).
    const caps = getDriverCapabilities({
      runnerDetails: baseRunner,
      name: "chrome",
      options,
    });
    assert.equal(caps["appium:chromedriverPort"], undefined);
  });
});

describe("GECKODRIVER_EXECUTABLE_ARGS", function () {
  // `geckodriverExecutable` is an Appium *insecure* feature, so the server has
  // to opt in by name. A wrong value here doesn't fail loudly at startup —
  // Appium accepts any well-formed `<scope>:<feature>` string — it fails every
  // Firefox session later with SessionNotCreatedError.
  it("opts in to exactly one named feature, never relaxed security", function () {
    assert.deepEqual(GECKODRIVER_EXECUTABLE_ARGS, [
      "--allow-insecure",
      "*:custom_geckodriver_executable",
    ]);
    assert.ok(!GECKODRIVER_EXECUTABLE_ARGS.includes("--relaxed-security"));
  });

  it("uses the wildcard driver scope, which is the only one that matches", function () {
    // Not a style choice, and not what appium-geckodriver's own docs say.
    // `isFeatureEnabled` matches the scope against `opts.automationName`, but
    // geckodriver's `validateDesiredCaps` runs before BaseDriver assigns
    // `opts`, so `gecko:` compares against undefined and never matches.
    // Verified end-to-end against the container image: `gecko:` is rejected,
    // `*:` creates the session.
    const [, feature] = GECKODRIVER_EXECUTABLE_ARGS;
    assert.equal(feature.split(":")[0], "*");
    assert.equal(feature.split(":")[1], "custom_geckodriver_executable");
  });
});

describe("applyDriverOptions", function () {
  // `driverOptions` is an authored escape hatch on a startSurface browser
  // descriptor, merged into the computed capabilities last. Most keys are
  // fine to override. `appium:geckodriverExecutable` is not: it is only legal
  // at all because Doc Detective opted the server in to an insecure feature,
  // so honouring an authored value would turn that opt-in into "a spec can
  // name any local executable and Appium will run it".
  it("protects the managed geckodriver path from an authored override", function () {
    const caps = { "appium:geckodriverExecutable": "/managed/geckodriver-0.37.1" };
    applyDriverOptions(caps, {
      "appium:geckodriverExecutable": "/tmp/evil",
    });
    assert.equal(
      caps["appium:geckodriverExecutable"],
      "/managed/geckodriver-0.37.1"
    );
  });

  it("still merges every other authored capability", function () {
    const caps = { browserName: "MozillaFirefox" };
    applyDriverOptions(caps, {
      "moz:debuggerAddress": true,
      "appium:newCommandTimeout": 30,
      browserName: "firefox",
    });
    assert.equal(caps["moz:debuggerAddress"], true);
    assert.equal(caps["appium:newCommandTimeout"], 30);
    assert.equal(caps.browserName, "firefox");
  });

  it("warns, naming the capability it refused", function () {
    const warnings = [];
    applyDriverOptions({}, { "appium:geckodriverExecutable": "/tmp/evil" }, (m) =>
      warnings.push(m)
    );
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /appium:geckodriverExecutable/);
  });

  it("leaves the capability absent when nothing computed it", function () {
    // No managed path resolved: the authored value must not fill the gap.
    const caps = { browserName: "MozillaFirefox" };
    applyDriverOptions(caps, { "appium:geckodriverExecutable": "/tmp/evil" });
    assert.ok(!("appium:geckodriverExecutable" in caps));
  });

  it("protects the capability nested inside an appium:options group", function () {
    // Appium lets capabilities be grouped under `appium:options`, and a value
    // inside the group takes PRECEDENCE over the same capability at the root.
    // Filtering only top-level keys would let the group smuggle the protected
    // capability past the guard and override the managed path.
    const caps = { "appium:geckodriverExecutable": "/managed/geckodriver-0.37.1" };
    applyDriverOptions(caps, {
      "appium:options": {
        geckodriverExecutable: "/tmp/payload",
        newCommandTimeout: 30,
      },
    });
    assert.equal(
      caps["appium:geckodriverExecutable"],
      "/managed/geckodriver-0.37.1"
    );
    assert.ok(!("geckodriverExecutable" in caps["appium:options"]));
    // Everything else in the group survives.
    assert.equal(caps["appium:options"].newCommandTimeout, 30);
  });

  it("protects the prefixed spelling inside an appium:options group too", function () {
    const caps = { "appium:geckodriverExecutable": "/managed/geckodriver-0.37.1" };
    applyDriverOptions(caps, {
      "appium:options": { "appium:geckodriverExecutable": "/tmp/payload" },
    });
    assert.ok(!("appium:geckodriverExecutable" in caps["appium:options"]));
    assert.equal(
      caps["appium:geckodriverExecutable"],
      "/managed/geckodriver-0.37.1"
    );
  });

  it("refuses the unprefixed spelling at the top level", function () {
    const caps = { "appium:geckodriverExecutable": "/managed/geckodriver-0.37.1" };
    applyDriverOptions(caps, { geckodriverExecutable: "/tmp/payload" });
    assert.ok(!("geckodriverExecutable" in caps));
    assert.equal(
      caps["appium:geckodriverExecutable"],
      "/managed/geckodriver-0.37.1"
    );
  });

  it("does not mutate the authored driverOptions object", function () {
    // The spec's own object is reused across a retry, so sanitizing must copy.
    const authored = {
      "appium:options": { geckodriverExecutable: "/tmp/payload", a: 1 },
    };
    applyDriverOptions({}, authored);
    assert.equal(
      authored["appium:options"].geckodriverExecutable,
      "/tmp/payload"
    );
  });

  it("leaves a non-object appium:options value alone", function () {
    const caps = {};
    applyDriverOptions(caps, { "appium:options": "nonsense" });
    assert.equal(caps["appium:options"], "nonsense");
  });

  it("tolerates a missing or empty driverOptions object", function () {
    const caps = { browserName: "MozillaFirefox" };
    applyDriverOptions(caps, undefined);
    applyDriverOptions(caps, {});
    assert.deepEqual(caps, { browserName: "MozillaFirefox" });
  });

  it("lists the geckodriver capability as protected", function () {
    assert.ok(PROTECTED_CAPABILITIES.includes("appium:geckodriverExecutable"));
  });
});

describe("withDriverPort (ADR 01039, 01105)", function () {
  const chromeCaps = {
    "appium:automationName": "Chromium",
    browserName: "chrome",
  };

  it("assigns a chromedriver port for a Chromium session", function () {
    const out = withDriverPort(chromeCaps, 51234);
    assert.equal(out["appium:chromedriverPort"], 51234);
  });

  it("returns a copy, leaving the input capabilities untouched", function () {
    const input = { ...chromeCaps };
    const out = withDriverPort(input, 51235);
    assert.equal(input["appium:chromedriverPort"], undefined);
    assert.notStrictEqual(out, input);
  });

  it("assigns distinct ports on repeated calls (fresh free port per attempt)", function () {
    const a = withDriverPort(chromeCaps, 40001);
    const b = withDriverPort(chromeCaps, 40002);
    assert.notEqual(
      a["appium:chromedriverPort"],
      b["appium:chromedriverPort"]
    );
  });

  it("does not override an explicitly supplied chromedriver port", function () {
    const out = withDriverPort(
      { ...chromeCaps, "appium:chromedriverPort": 9999 },
      51236
    );
    assert.equal(out["appium:chromedriverPort"], 9999);
  });

  it("assigns a geckodriver systemPort for a Gecko session", function () {
    // appium-geckodriver's own pick (lowest free port in 5200..5300) is not
    // reserved until geckodriver binds, so two concurrent Appium servers can
    // both pick 5200 and proxy to one geckodriver ("unexpected session id").
    const gecko = { "appium:automationName": "Gecko", browserName: "firefox" };
    const out = withDriverPort(gecko, 51237);
    assert.equal(out["appium:systemPort"], 51237);
    assert.equal(out["appium:chromedriverPort"], undefined);
    assert.equal(gecko["appium:systemPort"], undefined);
  });

  it("does not override an explicitly supplied geckodriver systemPort", function () {
    const out = withDriverPort(
      { "appium:automationName": "Gecko", "appium:systemPort": 5299 },
      51238
    );
    assert.equal(out["appium:systemPort"], 5299);
  });

  it("leaves capabilities of engines without a driver port untouched", function () {
    const safari = { "appium:automationName": "Safari", browserName: "Safari" };
    assert.strictEqual(withDriverPort(safari, 51239), safari);
  });

  it("gives two concurrent Chromium driver starts distinct chromedriver ports", async function () {
    // Model the two concurrent browser contexts that collided on 9515: each
    // driverStart allocates its own free chromedriver port, so their caps must
    // never share a port. This is the concurrency invariant the fix restores.
    const build = async () =>
      withDriverPort(
        { "appium:automationName": "Chromium", browserName: "chrome" },
        await findFreePort()
      );
    const [a, b] = await Promise.all([build(), build()]);
    assert.notEqual(
      a["appium:chromedriverPort"],
      b["appium:chromedriverPort"]
    );
  });
});
