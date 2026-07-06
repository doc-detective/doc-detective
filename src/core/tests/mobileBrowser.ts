// Native app surfaces phase A5: mobile web browsers on managed devices.
// With a mobile platform entry, `browsers` means the browser ON the device,
// driven through the same per-device Appium session the app surfaces use:
// Chrome on the Android emulator (UiAutomator2 + server-managed chromedriver)
// and Safari on the iOS simulator (XCUITest). Everything here is pure —
// support-matrix decisions, config rejection, and capability shapes — so the
// preflights stay unit-testable without a device.

import path from "node:path";

type MobileTarget = "android" | "ios";

// The device browser each mobile target supports. There is exactly one per
// platform — the on-device browser is part of the device image, not an
// installable engine choice, so unsupported names SKIP (they can never
// become available on that target) rather than falling back.
const SUPPORTED_MOBILE_BROWSER: Record<MobileTarget, string> = {
  android: "chrome",
  ios: "safari",
};

// Subdirectory of the Doc Detective cache where the Appium server stores the
// chromedrivers it auto-downloads to match the device's Chrome version.
const MOBILE_CHROMEDRIVER_DIR = "chromedriver-mobile";

export {
  mobileBrowserSupport,
  mobileBrowserConfigError,
  buildMobileBrowserCapabilities,
  defaultMobileBrowserName,
  mobileBrowserGate,
  MOBILE_CHROMEDRIVER_DIR,
};

// The browser a mobile context gets when the runOn entry names none — the
// mobile analog of the desktop first-available default.
function defaultMobileBrowserName(platform: MobileTarget): string {
  return SUPPORTED_MOBILE_BROWSER[platform];
}

// The A5 support matrix: chrome+android and safari+ios are the only pairs.
// The reason names both the rejected and the supported browser so the fix is
// one edit away.
function mobileBrowserSupport({
  platform,
  browserName,
}: {
  platform: MobileTarget;
  browserName: string;
}): { supported: true } | { supported: false; reason: string } {
  const supported = SUPPORTED_MOBILE_BROWSER[platform];
  if (browserName === supported) return { supported: true };
  return {
    supported: false,
    reason: `Skipping context: '${browserName}' isn't available on ${platform}. '${supported}' is the supported ${platform} browser — set browsers: "${supported}" (or omit browsers) on the ${platform} runOn entry.`,
  };
}

// Device-fixed browser config is rejected loudly rather than silently
// ignored: `headless` belongs to the device descriptor, and window/viewport
// dimensions are fixed by the device's screen. `headless: true` is the
// schema-injected default (AJV useDefaults), so only an authored `false` is
// distinguishable and rejectable.
function mobileBrowserConfigError(
  browser: { headless?: boolean; window?: any; viewport?: any } | undefined
): string | null {
  if (!browser) return null;
  if (browser.headless === false) {
    return "browser headless is meaningless for a device browser — the device owns its display. Set headless on the device descriptor (device.headless) instead.";
  }
  const authoredDimensions = (value: any) =>
    value && typeof value === "object" && Object.keys(value).length > 0;
  if (authoredDimensions(browser.window)) {
    return "browser window dimensions are fixed by the device's screen and can't be set on a mobile context. Choose a different device (device.deviceType) if you need another size.";
  }
  if (authoredDimensions(browser.viewport)) {
    return "browser viewport dimensions are fixed by the device's screen and can't be set on a mobile context. Choose a different device (device.deviceType) if you need another size.";
  }
  return null;
}

// The one decision point the mobile preflights consult before any toolchain
// work: does this context get a device-browser session, a SKIP, or a FAIL?
// Order matters — the mixed guard first (a scope limit, so SKIP, and config
// on a context that can't run at all shouldn't fail the run), then the loud
// config rejection, then the support matrix with the platform default filled.
function mobileBrowserGate({
  platform,
  browser,
  hasBrowserStep,
  hasAppStep,
}: {
  platform: MobileTarget;
  browser?: {
    name?: string;
    headless?: boolean;
    window?: any;
    viewport?: any;
  };
  hasBrowserStep: boolean;
  hasAppStep: boolean;
}):
  | { action: "proceed"; browserName: string | null }
  | { action: "skip"; level: "warning"; reason: string }
  | { action: "fail"; reason: string } {
  if (!hasBrowserStep) return { action: "proceed", browserName: null };
  if (hasAppStep) {
    // Interleaving native app surfaces and the device browser in one context
    // needs foreground + NATIVE_APP/WEBVIEW context switching, which lands
    // with the mobile interaction vocabulary (phase A6). Both halves run
    // today — in separate tests/contexts.
    return {
      action: "skip",
      level: "warning",
      reason: `Skipping context on '${platform}': mixing native app surfaces and browser steps in one mobile context isn't supported yet — put the web steps and the app steps in separate tests or contexts. Mobile-web-only and native-app-only contexts both run today.`,
    };
  }
  const configError = mobileBrowserConfigError(browser);
  if (configError) {
    return {
      action: "fail",
      reason: `Mobile context on '${platform}': ${configError}`,
    };
  }
  const browserName = browser?.name ?? defaultMobileBrowserName(platform);
  const support = mobileBrowserSupport({ platform, browserName });
  if (!support.supported) {
    return { action: "skip", level: "warning", reason: support.reason };
  }
  return { action: "proceed", browserName };
}

// Session capabilities for the device browser. Mirrors the per-platform app
// capability shapes in appSurface.ts (APP_DRIVER_PLATFORMS) — same drivers,
// same udid pinning, same WDA timeout floor and derived-data opt-in — but
// with `browserName` in place of an app identifier, which puts the session
// in a web context from the start.
function buildMobileBrowserCapabilities({
  platform,
  udid,
  cacheDir,
  timeout,
}: {
  platform: MobileTarget;
  udid: string;
  cacheDir: string;
  timeout?: number;
}): Record<string, any> {
  if (platform === "android") {
    return {
      platformName: "Android",
      "appium:automationName": "UiAutomator2",
      browserName: "Chrome",
      "appium:udid": udid,
      "appium:newCommandTimeout": 600,
      // adb operations can be slow on a cold emulator (same floor as app
      // sessions).
      "appium:adbExecTimeout": 120000,
      "wdio:enforceWebDriverClassic": true,
      // On-device chromedriver management: the server downloads a
      // chromedriver matching the device's Chrome version. Requires the
      // Appium server to run with
      // --allow-insecure=uiautomator2:chromedriver_autodownload. The
      // download lands in the Doc Detective cache so later runs reuse it.
      "appium:chromedriverAutodownload": true,
      "appium:chromedriverExecutableDir": path.join(
        cacheDir,
        MOBILE_CHROMEDRIVER_DIR
      ),
    };
  }
  const capabilities: Record<string, any> = {
    platformName: "iOS",
    "appium:automationName": "XCUITest",
    browserName: "Safari",
    "appium:udid": udid,
    "appium:newCommandTimeout": 600,
    "wdio:enforceWebDriverClassic": true,
  };
  // The first-ever XCUITest session cold-builds WebDriverAgent via
  // xcodebuild (~10 min on CI). App surfaces carry an authored startSurface
  // timeout for this; a mobile-web session has no step to author one on, so
  // the default ceiling matches the generous one the apps-ios fixtures use.
  const effectiveTimeout = timeout ?? 900000;
  capabilities["appium:wdaLaunchTimeout"] = Math.max(effectiveTimeout, 120000);
  capabilities["appium:wdaConnectionTimeout"] = Math.max(
    effectiveTimeout,
    120000
  );
  // Same opt-in derived-data sharing as iOS app sessions (see appSurface.ts
  // for the caching contract).
  const derivedDataPath = process.env.DOC_DETECTIVE_IOS_WDA_DERIVED_DATA_PATH;
  if (derivedDataPath && derivedDataPath.trim()) {
    capabilities["appium:derivedDataPath"] = derivedDataPath.trim();
  }
  return capabilities;
}
