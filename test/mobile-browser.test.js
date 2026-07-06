// Native app surfaces phase A5: mobile web browsers on managed devices.
// Chrome on the Android emulator (UiAutomator2) and Safari on the iOS
// simulator (XCUITest) are the only supported target/browser pairs; every
// other combination SKIPs with an actionable reason. Device-fixed browser
// config (headless/window/viewport) is rejected, and the capability builders
// mirror the A3/A4 app-session shapes. Everything here is pure — no device,
// SDK, or driver is touched.

import path from "node:path";
import {
  mobileBrowserSupport,
  mobileBrowserConfigError,
  buildMobileBrowserCapabilities,
  defaultMobileBrowserName,
  mobileBrowserGate,
} from "../dist/core/tests/mobileBrowser.js";
import { jobDisplayResources } from "../dist/core/tests.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("mobile web (A5): mobileBrowserSupport matrix", function () {
  it("supports chrome on android", function () {
    const result = mobileBrowserSupport({
      platform: "android",
      browserName: "chrome",
    });
    expect(result.supported).to.equal(true);
  });

  it("supports safari on ios", function () {
    const result = mobileBrowserSupport({
      platform: "ios",
      browserName: "safari",
    });
    expect(result.supported).to.equal(true);
  });

  it("rejects every other android combination with the supported browser named", function () {
    for (const browserName of ["firefox", "webkit", "safari"]) {
      const result = mobileBrowserSupport({
        platform: "android",
        browserName,
      });
      expect(result.supported, browserName).to.equal(false);
      expect(result.reason, browserName).to.include(browserName);
      expect(result.reason, browserName).to.include("chrome");
      expect(result.reason, browserName).to.include("android");
    }
  });

  it("rejects every other ios combination with the supported browser named", function () {
    for (const browserName of ["firefox", "webkit", "chrome"]) {
      const result = mobileBrowserSupport({ platform: "ios", browserName });
      expect(result.supported, browserName).to.equal(false);
      expect(result.reason, browserName).to.include(browserName);
      expect(result.reason, browserName).to.include("safari");
      expect(result.reason, browserName).to.include("ios");
    }
  });
});

describe("mobile web (A5): defaultMobileBrowserName", function () {
  it("defaults to chrome on android and safari on ios", function () {
    expect(defaultMobileBrowserName("android")).to.equal("chrome");
    expect(defaultMobileBrowserName("ios")).to.equal("safari");
  });
});

describe("mobile web (A5): mobileBrowserConfigError", function () {
  it("accepts an empty/undefined browser config", function () {
    expect(mobileBrowserConfigError(undefined)).to.equal(null);
    expect(mobileBrowserConfigError({ name: "chrome" })).to.equal(null);
  });

  it("accepts headless: true (indistinguishable from the schema default)", function () {
    expect(
      mobileBrowserConfigError({ name: "chrome", headless: true })
    ).to.equal(null);
  });

  it("rejects headless: false with a pointer to device.headless", function () {
    const error = mobileBrowserConfigError({ name: "chrome", headless: false });
    expect(error).to.be.a("string");
    expect(error).to.include("device");
    expect(error).to.include("headless");
  });

  it("rejects window dimensions as device-fixed", function () {
    const error = mobileBrowserConfigError({
      name: "chrome",
      window: { width: 1280 },
    });
    expect(error).to.be.a("string");
    expect(error).to.include("window");
    expect(error).to.include("device");
  });

  it("rejects viewport dimensions as device-fixed", function () {
    const error = mobileBrowserConfigError({
      name: "safari",
      viewport: { height: 900 },
    });
    expect(error).to.be.a("string");
    expect(error).to.include("viewport");
  });

  it("ignores empty window/viewport objects (nothing authored)", function () {
    expect(
      mobileBrowserConfigError({ name: "chrome", window: {}, viewport: {} })
    ).to.equal(null);
  });
});

describe("mobile web (A5): mobileBrowserGate", function () {
  it("proceeds with no browser session for a context without browser steps", function () {
    const gate = mobileBrowserGate({
      platform: "android",
      browser: undefined,
      hasBrowserStep: false,
      hasAppStep: true,
    });
    expect(gate).to.deep.equal({ action: "proceed", browserName: null });
  });

  it("fills the platform default browser when the entry names none", function () {
    expect(
      mobileBrowserGate({
        platform: "android",
        browser: undefined,
        hasBrowserStep: true,
        hasAppStep: false,
      })
    ).to.deep.equal({ action: "proceed", browserName: "chrome" });
    expect(
      mobileBrowserGate({
        platform: "ios",
        browser: undefined,
        hasBrowserStep: true,
        hasAppStep: false,
      })
    ).to.deep.equal({ action: "proceed", browserName: "safari" });
  });

  it("proceeds with an explicitly supported browser", function () {
    const gate = mobileBrowserGate({
      platform: "ios",
      browser: { name: "safari" },
      hasBrowserStep: true,
      hasAppStep: false,
    });
    expect(gate).to.deep.equal({ action: "proceed", browserName: "safari" });
  });

  it("skips an unsupported browser with the matrix reason", function () {
    const gate = mobileBrowserGate({
      platform: "android",
      browser: { name: "firefox" },
      hasBrowserStep: true,
      hasAppStep: false,
    });
    expect(gate.action).to.equal("skip");
    expect(gate.level).to.equal("warning");
    expect(gate.reason).to.include("firefox");
    expect(gate.reason).to.include("chrome");
  });

  it("skips a mixed native-app + web context with a split-the-test pointer", function () {
    const gate = mobileBrowserGate({
      platform: "android",
      browser: { name: "chrome" },
      hasBrowserStep: true,
      hasAppStep: true,
    });
    expect(gate.action).to.equal("skip");
    expect(gate.reason).to.match(/app|surface/i);
    expect(gate.reason).to.match(/separate|split/i);
  });

  it("fails device-fixed browser config loudly (headless:false)", function () {
    const gate = mobileBrowserGate({
      platform: "android",
      browser: { name: "chrome", headless: false },
      hasBrowserStep: true,
      hasAppStep: false,
    });
    expect(gate.action).to.equal("fail");
    expect(gate.reason).to.include("device");
  });

  it("checks the mixed guard before the config guard (a mixed context skips, not fails)", function () {
    const gate = mobileBrowserGate({
      platform: "android",
      browser: { name: "chrome", headless: false },
      hasBrowserStep: true,
      hasAppStep: true,
    });
    expect(gate.action).to.equal("skip");
  });
});

describe("mobile web (A5): jobDisplayResources android-emulator mutex", function () {
  const ctx = {
    platform: "win32",
    xvfbAvailable: false,
    runHasDisplayRecording: false,
  };
  const job = (context) => ({ context });

  it("an android native-app job takes the emulator mutex", function () {
    const resources = jobDisplayResources(
      job({
        platform: "android",
        steps: [{ startSurface: { app: "com.example.app" } }],
      }),
      ctx
    );
    expect(resources).to.include("android-emulator");
  });

  it("an android mobile-web job (supported browser) now takes the emulator mutex", function () {
    const resources = jobDisplayResources(
      job({
        platform: "android",
        browser: { name: "chrome" },
        steps: [{ goTo: "http://localhost:8092" }],
      }),
      ctx
    );
    expect(resources).to.include("android-emulator");
  });

  it("an android mobile-web job with no authored browser (default chrome) takes the mutex", function () {
    const resources = jobDisplayResources(
      job({ platform: "android", steps: [{ goTo: "http://localhost:8092" }] }),
      ctx
    );
    expect(resources).to.include("android-emulator");
  });

  it("an android job that will SKIP on the support matrix does not serialize others", function () {
    const resources = jobDisplayResources(
      job({
        platform: "android",
        browser: { name: "firefox" },
        steps: [{ goTo: "http://localhost:8092" }],
      }),
      ctx
    );
    expect(resources).to.not.include("android-emulator");
  });

  it("a mixed app+web android job (deterministic skip) does not take the mutex", function () {
    const resources = jobDisplayResources(
      job({
        platform: "android",
        browser: { name: "chrome" },
        steps: [
          { startSurface: { app: "com.example.app" } },
          { goTo: "http://localhost:8092" },
        ],
      }),
      ctx
    );
    expect(resources).to.not.include("android-emulator");
  });

  it("a non-android job never takes the mutex", function () {
    const resources = jobDisplayResources(
      job({
        platform: "ios",
        browser: { name: "safari" },
        steps: [{ goTo: "http://localhost:8092" }],
      }),
      ctx
    );
    expect(resources).to.not.include("android-emulator");
  });
});

describe("mobile web (A5): buildMobileBrowserCapabilities", function () {
  it("builds a UiAutomator2 Chrome session for android", function () {
    const capabilities = buildMobileBrowserCapabilities({
      platform: "android",
      udid: "emulator-5554",
      cacheDir: "/tmp/dd-cache",
    });
    expect(capabilities.platformName).to.equal("Android");
    expect(capabilities["appium:automationName"]).to.equal("UiAutomator2");
    expect(capabilities.browserName).to.equal("Chrome");
    expect(capabilities["appium:udid"]).to.equal("emulator-5554");
    expect(capabilities["appium:newCommandTimeout"]).to.equal(600);
    expect(capabilities["wdio:enforceWebDriverClassic"]).to.equal(true);
    // On-device chromedriver management: the server downloads a chromedriver
    // matching the device's Chrome, cached under the Doc Detective cache.
    expect(capabilities["appium:chromedriverAutodownload"]).to.equal(true);
    expect(capabilities["appium:chromedriverExecutableDir"]).to.equal(
      path.join("/tmp/dd-cache", "chromedriver-mobile")
    );
  });

  it("builds an XCUITest Safari session for ios with the WDA timeout floor", function () {
    const capabilities = buildMobileBrowserCapabilities({
      platform: "ios",
      udid: "SIM-UDID-1234",
      cacheDir: "/tmp/dd-cache",
    });
    expect(capabilities.platformName).to.equal("iOS");
    expect(capabilities["appium:automationName"]).to.equal("XCUITest");
    expect(capabilities.browserName).to.equal("Safari");
    expect(capabilities["appium:udid"]).to.equal("SIM-UDID-1234");
    expect(capabilities["appium:wdaLaunchTimeout"]).to.equal(120000);
    expect(capabilities["appium:wdaConnectionTimeout"]).to.equal(120000);
    expect(capabilities["wdio:enforceWebDriverClassic"]).to.equal(true);
    // No chromedriver keys leak onto the ios shape.
    expect(capabilities).to.not.have.property(
      "appium:chromedriverAutodownload"
    );
  });

  it("lets a larger timeout raise the WDA ceiling above the floor", function () {
    const capabilities = buildMobileBrowserCapabilities({
      platform: "ios",
      udid: "SIM-UDID-1234",
      cacheDir: "/tmp/dd-cache",
      timeout: 300000,
    });
    expect(capabilities["appium:wdaLaunchTimeout"]).to.equal(300000);
    expect(capabilities["appium:wdaConnectionTimeout"]).to.equal(300000);
  });

  it("honors DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH like the app-session builder", function () {
    const prior = process.env.DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH;
    process.env.DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH = " /tmp/wda-dd ";
    try {
      const capabilities = buildMobileBrowserCapabilities({
        platform: "ios",
        udid: "SIM-UDID-1234",
        cacheDir: "/tmp/dd-cache",
      });
      expect(capabilities["appium:derivedDataPath"]).to.equal("/tmp/wda-dd");
    } finally {
      if (prior === undefined) {
        delete process.env.DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH;
      } else {
        process.env.DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH = prior;
      }
    }
  });
});
