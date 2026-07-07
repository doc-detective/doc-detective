import {
  BROWSER_STEP_KEYS,
  stepTargetsAppSurface,
  startSurfaceDescriptors,
  stepOpensBrowserSurface,
} from "./browserStepKeys.js";

export type BrowserName = "chrome" | "firefox" | "safari";

export interface RuntimeNeeds {
  browsers: Set<BrowserName>;
  npmPackages: Set<string>;
}

// Set view of the shared canonical list for O(1) membership checks below.
const BROWSER_STEP_KEY_SET = new Set<string>(BROWSER_STEP_KEYS);

const SCREENSHOT_STEP_KEYS = new Set(["screenshot"]);
const RECORDING_STEP_KEYS = new Set(["record", "stopRecord"]);

/**
 * Walk resolved specs and return the minimal set of runtime assets (heavy
 * npm packages + browser binaries) the run will actually use. Pure — no I/O,
 * no spawn, no network — so it's directly unit-testable with fixture specs.
 *
 * The shape accepted here is intentionally permissive (`any`) so this helper
 * survives ongoing v3-shape refinements. Missing/optional fields degrade
 * gracefully to "no need."
 */
export function inferRuntimeNeeds(resolvedSpecs: any): RuntimeNeeds {
  const browsers = new Set<BrowserName>();
  const npmPackages = new Set<string>();

  const specs: any[] = Array.isArray(resolvedSpecs)
    ? resolvedSpecs
    : resolvedSpecs && Array.isArray(resolvedSpecs.specs)
    ? resolvedSpecs.specs
    : [];

  let sawBrowserStep = false;
  let sawScreenshotStep = false;
  let sawRecordingStep = false;

  for (const spec of specs) {
    collectBrowserNamesFromRunOn(spec?.runOn, browsers);
    for (const test of arrayOrEmpty<any>(spec?.tests)) {
      collectBrowserNamesFromRunOn(test?.runOn, browsers);
      for (const ctx of arrayOrEmpty<any>(test?.contexts)) {
        collectBrowserNamesFromRunOn(ctx?.runOn, browsers);
        if (typeof ctx?.browser?.name === "string") {
          addBrowserName(browsers, ctx.browser.name);
        }
        for (const step of arrayOrEmpty<any>(ctx?.steps)) {
          const flags = classifyStep(step);
          if (flags.browser) sawBrowserStep = true;
          if (flags.screenshot) sawScreenshotStep = true;
          if (flags.recording) sawRecordingStep = true;
          collectStartSurfaceEngines(step, browsers);
        }
      }
      for (const step of arrayOrEmpty<any>(test?.steps)) {
        const flags = classifyStep(step);
        if (flags.browser) sawBrowserStep = true;
        if (flags.screenshot) sawScreenshotStep = true;
        if (flags.recording) sawRecordingStep = true;
        collectStartSurfaceEngines(step, browsers);
      }
    }
  }

  if (sawBrowserStep) {
    npmPackages.add("webdriverio");
    npmPackages.add("appium");
    npmPackages.add("@puppeteer/browsers");
    // If no concrete browser was declared anywhere, default to chrome so
    // the spec at least has something to drive.
    if (browsers.size === 0) browsers.add("chrome");
    for (const name of browsers) {
      if (name === "chrome") npmPackages.add("appium-chromium-driver");
      if (name === "firefox") {
        npmPackages.add("appium-geckodriver");
        npmPackages.add("geckodriver");
      }
      if (name === "safari") npmPackages.add("appium-safari-driver");
    }
  }
  if (sawScreenshotStep) {
    npmPackages.add("sharp");
    npmPackages.add("pngjs");
    npmPackages.add("pixelmatch");
  }
  if (sawRecordingStep) {
    npmPackages.add("@ffmpeg-installer/ffmpeg");
  }

  return { browsers, npmPackages };
}

function arrayOrEmpty<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function addBrowserName(set: Set<BrowserName>, name: string): void {
  const normalized = name.toLowerCase();
  if (normalized === "chrome" || normalized === "chromium")
    set.add("chrome");
  else if (normalized === "firefox") set.add("firefox");
  // `webkit` is the resolved alias for `safari` (resolveContexts rewrites
  // safari -> webkit), so both map to the safari bucket. Without this, a
  // Safari-only spec looks browser-less and falls through to the chrome
  // default — provisioning Chrome for a run that only wanted Safari.
  else if (normalized === "safari" || normalized === "webkit")
    set.add("safari");
  // edge / others — ignored; runner already restricts to chrome/firefox/safari.
}

// startSurface browser descriptors declare the engine they open (Phase 6) —
// collect each so `startSurface: { browser: "firefox" }` provisions
// geckodriver instead of falling through to the chrome default.
function collectStartSurfaceEngines(step: any, set: Set<BrowserName>): void {
  for (const d of startSurfaceDescriptors(step)) {
    if (d && typeof d === "object" && typeof d.browser === "string") {
      addBrowserName(set, d.browser);
    }
  }
}

function collectBrowserNamesFromRunOn(
  runOn: any,
  set: Set<BrowserName>
): void {
  if (!Array.isArray(runOn)) return;
  for (const entry of runOn) {
    if (!entry || !Array.isArray(entry.browsers)) continue;
    for (const b of entry.browsers) {
      if (b && typeof b.name === "string") addBrowserName(set, b.name);
    }
  }
}

function classifyStep(step: any): {
  browser: boolean;
  screenshot: boolean;
  recording: boolean;
} {
  if (!step || typeof step !== "object")
    return { browser: false, screenshot: false, recording: false };
  let browser = false;
  let screenshot = false;
  let recording = false;
  // An app-object-targeted step (`surface: { app: … }`) drives a native app
  // driver, not a browser — mirror the runner's `isBrowserRequired` exclusion
  // so app-only specs don't provision a browser binary. This gates ONLY the
  // browser flag: an app screenshot still needs the image stack, and an app
  // recording still needs ffmpeg.
  const appTargeted = stepTargetsAppSurface(step);
  for (const key of Object.keys(step)) {
    if (!appTargeted && BROWSER_STEP_KEY_SET.has(key)) browser = true;
    if (SCREENSHOT_STEP_KEYS.has(key)) screenshot = true;
    if (RECORDING_STEP_KEYS.has(key)) recording = true;
  }
  // A startSurface browser descriptor opens a real WebDriver session (Phase
  // 6) — the goTo-opener sibling. App/process descriptors don't set this.
  if (stepOpensBrowserSurface(step)) browser = true;
  return { browser, screenshot, recording };
}
