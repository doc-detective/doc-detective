import { inferRuntimeNeeds } from "../dist/runtime/inferRuntimeNeeds.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("runtime/inferRuntimeNeeds", function () {
  function makeSpec(steps, { runOn } = {}) {
    return {
      specId: "s1",
      runOn,
      tests: [
        {
          testId: "t1",
          contexts: [{ contextId: "c1", steps }],
        },
      ],
    };
  }

  it("returns empty sets for an empty resolvedSpecs array", function () {
    const needs = inferRuntimeNeeds([]);
    expect([...needs.npmPackages]).to.deep.equal([]);
    expect([...needs.browsers]).to.deep.equal([]);
  });

  it("accepts either a bare array of specs or a wrapper object with .specs", function () {
    const step = [{ goTo: { url: "https://x.test" } }];
    const a = inferRuntimeNeeds([makeSpec(step)]);
    const b = inferRuntimeNeeds({ specs: [makeSpec(step)] });
    expect([...a.npmPackages].sort()).to.deep.equal([...b.npmPackages].sort());
  });

  it("a goTo step pulls in wdio + appium + @puppeteer/browsers + chromium driver (default browser)", function () {
    const needs = inferRuntimeNeeds([
      makeSpec([{ goTo: { url: "https://x.test" } }]),
    ]);
    expect([...needs.browsers]).to.deep.equal(["chrome"]);
    expect(needs.npmPackages.has("webdriverio")).to.equal(true);
    expect(needs.npmPackages.has("appium")).to.equal(true);
    expect(needs.npmPackages.has("@puppeteer/browsers")).to.equal(true);
    expect(needs.npmPackages.has("appium-chromium-driver")).to.equal(true);
    // No screenshot / record steps in this spec — those bundles stay out.
    expect(needs.npmPackages.has("sharp")).to.equal(false);
    expect(needs.npmPackages.has("@ffmpeg-installer/ffmpeg")).to.equal(false);
  });

  it("a runBrowserScript step requires a browser (wdio + appium + default chrome)", function () {
    const needs = inferRuntimeNeeds([
      makeSpec([{ runBrowserScript: "return document.title;" }]),
    ]);
    expect([...needs.browsers]).to.deep.equal(["chrome"]);
    expect(needs.npmPackages.has("webdriverio")).to.equal(true);
    expect(needs.npmPackages.has("appium")).to.equal(true);
    expect(needs.npmPackages.has("@puppeteer/browsers")).to.equal(true);
    expect(needs.npmPackages.has("appium-chromium-driver")).to.equal(true);
  });

  it("respects an explicit runOn browser at the spec level", function () {
    const needs = inferRuntimeNeeds([
      makeSpec([{ goTo: { url: "https://x.test" } }], {
        runOn: [{ browsers: [{ name: "firefox" }] }],
      }),
    ]);
    expect([...needs.browsers]).to.deep.equal(["firefox"]);
    expect(needs.npmPackages.has("appium-geckodriver")).to.equal(true);
    expect(needs.npmPackages.has("geckodriver")).to.equal(true);
    expect(needs.npmPackages.has("appium-chromium-driver")).to.equal(false);
  });

  it("union of browsers across multiple specs / runOn entries", function () {
    const needs = inferRuntimeNeeds([
      makeSpec([{ goTo: { url: "https://x.test" } }], {
        runOn: [{ browsers: [{ name: "chrome" }, { name: "firefox" }] }],
      }),
      makeSpec([{ click: { selector: "#x" } }], {
        runOn: [{ browsers: [{ name: "safari" }] }],
      }),
    ]);
    expect([...needs.browsers].sort()).to.deep.equal([
      "chrome",
      "firefox",
      "safari",
    ]);
    expect(needs.npmPackages.has("appium-safari-driver")).to.equal(true);
    expect(needs.npmPackages.has("appium-chromium-driver")).to.equal(true);
    expect(needs.npmPackages.has("appium-geckodriver")).to.equal(true);
  });

  it("maps a resolved `webkit` context browser to the safari bucket (not chrome)", function () {
    // resolveContexts rewrites `safari` -> `webkit`, so a resolved Safari
    // context carries browser.name === "webkit". inferRuntimeNeeds must treat
    // that as safari, not let it fall through to the chrome default.
    const needs = inferRuntimeNeeds([
      {
        specId: "s1",
        tests: [
          {
            testId: "t1",
            contexts: [
              {
                contextId: "c1",
                browser: { name: "webkit" },
                steps: [{ goTo: { url: "https://x.test" } }],
              },
            ],
          },
        ],
      },
    ]);
    expect([...needs.browsers]).to.deep.equal(["safari"]);
    expect(needs.npmPackages.has("appium-safari-driver")).to.equal(true);
    expect(needs.npmPackages.has("appium-chromium-driver")).to.equal(false);
  });

  it("maps a `webkit` runOn browser to the safari bucket", function () {
    const needs = inferRuntimeNeeds([
      makeSpec([{ goTo: { url: "https://x.test" } }], {
        runOn: [{ browsers: [{ name: "webkit" }] }],
      }),
    ]);
    expect([...needs.browsers]).to.deep.equal(["safari"]);
    expect(needs.npmPackages.has("appium-safari-driver")).to.equal(true);
    expect(needs.npmPackages.has("appium-chromium-driver")).to.equal(false);
  });

  it("a screenshot step adds sharp / pngjs / pixelmatch", function () {
    const needs = inferRuntimeNeeds([
      makeSpec([{ screenshot: { path: "s.png" } }]),
    ]);
    expect(needs.npmPackages.has("sharp")).to.equal(true);
    expect(needs.npmPackages.has("pngjs")).to.equal(true);
    expect(needs.npmPackages.has("pixelmatch")).to.equal(true);
    // screenshot needs a browser to capture from
    expect(needs.npmPackages.has("webdriverio")).to.equal(true);
  });

  it("record / stopRecord adds @ffmpeg-installer/ffmpeg", function () {
    const recordNeeds = inferRuntimeNeeds([
      makeSpec([{ record: { path: "r.webm" } }]),
    ]);
    expect(recordNeeds.npmPackages.has("@ffmpeg-installer/ffmpeg")).to.equal(true);
    const stopNeeds = inferRuntimeNeeds([
      makeSpec([{ stopRecord: true }]),
    ]);
    expect(stopNeeds.npmPackages.has("@ffmpeg-installer/ffmpeg")).to.equal(true);
  });

  it("pure-HTTP / shell-only steps require no browser or runtime deps", function () {
    const needs = inferRuntimeNeeds([
      makeSpec([
        { httpRequest: { method: "GET", url: "https://api.x.test" } },
        { runShell: { command: "echo hi" } },
        { wait: 100 },
      ]),
    ]);
    expect([...needs.npmPackages]).to.deep.equal([]);
    expect([...needs.browsers]).to.deep.equal([]);
  });

  it("non-array resolvedSpecs degrades to empty sets (defensive)", function () {
    expect([...inferRuntimeNeeds(undefined).npmPackages]).to.deep.equal([]);
    expect([...inferRuntimeNeeds(null).npmPackages]).to.deep.equal([]);
    expect([...inferRuntimeNeeds(42).npmPackages]).to.deep.equal([]);
    expect([...inferRuntimeNeeds({}).npmPackages]).to.deep.equal([]);
  });

  it("test-level steps (not under contexts) are also walked", function () {
    const needs = inferRuntimeNeeds([
      {
        specId: "s1",
        tests: [
          { testId: "t1", steps: [{ screenshot: { path: "x.png" } }] },
        ],
      },
    ]);
    expect(needs.npmPackages.has("sharp")).to.equal(true);
  });

  // Zero-cost-unless-android invariant (native-app phase A3): the Android
  // toolchain (SDK, adb, emulator) and the UiAutomator2 driver are NEVER
  // provisioned through inferRuntimeNeeds — they are detected lazily in the
  // android context preflight, only for contexts that actually target
  // android. So no matter what an android spec contains, this pure inference
  // never adds an android-specific package: a run that never targets android
  // pays nothing toward the (very heavy) emulator/SDK.
  //
  // Note the generic driver stack (webdriverio/appium/chromium) IS still
  // inferred here, because `find`/`click`/`type` are surface-agnostic step
  // keys shared with browser tests — the same pre-existing behavior A1/A2 app
  // specs already have. That stack is not the Android toolchain; the invariant
  // this locks is specifically that the Android SDK + uiautomator2 driver are
  // never reached from inference.
  it("never provisions the Android toolchain from inference (lazy-in-preflight)", function () {
    const needs = inferRuntimeNeeds([
      makeSpec(
        [
          { startSurface: { app: "com.android.settings" } },
          { find: { elementText: "Network & internet" } },
          { click: { elementText: "Network & internet" } },
          { type: { keys: ["airplane"] } },
        ],
        { runOn: [{ platforms: "android" }] }
      ),
    ]);
    expect(needs.npmPackages.has("appium-uiautomator2-driver")).to.equal(false);
    for (const pkg of [...needs.npmPackages]) {
      expect(pkg, `unexpected android-flavored dep: ${pkg}`).to.not.match(
        /android|uiautomator|emulator|sdk/i
      );
    }
  });

  // A step whose action payload names an app surface with the object form
  // (`surface: { app: … }`) drives a native app driver, not a browser — the
  // same exclusion `isBrowserRequired` applies in the runner. So even though
  // `swipe`/`click` are shared browser step keys, an app-object-targeted step
  // must NOT pull in the browser stack (webdriverio/appium/chromium/chrome).
  // This is narrower than the android-toolchain test above: there the
  // find/click/type steps carry NO per-step surface object (they inherit the
  // app context), so they legitimately still infer the generic driver stack.
  it("an app-surface-targeted step (object form) does not provision the browser stack", function () {
    const needs = inferRuntimeNeeds([
      makeSpec(
        [
          { startSurface: { app: "com.android.settings" } },
          {
            swipe: {
              direction: "up",
              surface: { app: "com.android.settings" },
            },
          },
          {
            click: {
              elementText: "Wi-Fi",
              surface: { app: "com.android.settings" },
            },
          },
        ],
        { runOn: [{ platforms: "android" }] }
      ),
    ]);
    expect([...needs.browsers]).to.deep.equal([]);
    expect(needs.npmPackages.has("webdriverio")).to.equal(false);
    expect(needs.npmPackages.has("appium")).to.equal(false);
    expect(needs.npmPackages.has("appium-chromium-driver")).to.equal(false);
  });

  // Guard the boundary: an app-object screenshot still needs the image stack
  // (sharp/pngjs/pixelmatch) — the app-surface exclusion gates only the
  // browser flag, not screenshot/recording bundles.
  it("an app-surface screenshot still infers the image stack but no browser", function () {
    const needs = inferRuntimeNeeds([
      makeSpec([
        {
          screenshot: {
            path: "s.png",
            surface: { app: "com.android.settings" },
          },
        },
      ]),
    ]);
    expect(needs.npmPackages.has("sharp")).to.equal(true);
    expect(needs.npmPackages.has("webdriverio")).to.equal(false);
    expect([...needs.browsers]).to.deep.equal([]);
  });
});
