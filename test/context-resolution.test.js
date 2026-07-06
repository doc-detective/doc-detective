import assert from "node:assert/strict";
import {
  isSupportedContext,
  getDefaultBrowser,
  getDriverCapabilities,
  combinationKey,
  warmUpDecision,
  contextRequirementsSkipMessage,
} from "../dist/core/tests.js";
import { resolveContexts } from "../dist/core/resolveTests.js";

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
    assert.ok(message.startsWith("Skipping context on 'windows'"));
    assert.match(message, /command "adb"/);
    assert.match(message, /file "\$HOME\/\.config\/app\.toml"/);
    assert.match(message, /environment variable "API_TOKEN"/);
  });

  it("handles the string shorthand as a required command", function () {
    const message = contextRequirementsSkipMessage({
      context: { platform: "mac", requires: "claude" },
      deps: nothing,
    });
    assert.match(message, /command "claude"/);
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
