import {
  BROWSER_STEP_KEYS,
  stepTargetsAppSurface,
  stepTargetsProcessSurface,
  stepIsSurfacelessInteraction,
  testHasNonBrowserSurfaceSignal,
  startSurfaceDescriptors,
  stepOpensBrowserSurface,
} from "./browserStepKeys.js";

export type BrowserName = "chrome" | "firefox" | "safari";

export interface RuntimeNeeds {
  browsers: Set<BrowserName>;
  npmPackages: Set<string>;
  // True when any runShell/runCode step resolves to the `bash` shell (or
  // runCode targets the bash language) — on Windows that means Git Bash must
  // be available. The inference is platform-agnostic; the preflight caller
  // gates on process.platform === "win32".
  windowsBash: boolean;
  // True when sharp/pngjs/pixelmatch are in `npmPackages` only for automatic
  // screenshots, so a failed install can turn those off instead of failing
  // the run (ADR 01177).
  autoScreenshotOnly: boolean;
}

export interface InferRuntimeNeedsOptions {
  // The config-level `shell` default (config_v3 `shell`, default `bash`).
  // Step-level `shell` fields win over it, mirroring the runtime resolver.
  configShell?: string;
  // The config-level auto-capture keys. Unset means on (ADR 01177); specs and
  // tests override them.
  autoScreenshot?: boolean;
  autoRecord?: boolean;
}

const SCREENSHOT_PACKAGES = ["sharp", "pngjs", "pixelmatch"];

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
export function inferRuntimeNeeds(
  resolvedSpecs: any,
  options: InferRuntimeNeedsOptions = {}
): RuntimeNeeds {
  const browsers = new Set<BrowserName>();
  const npmPackages = new Set<string>();
  const configShell = options.configShell ?? "bash";

  const specs: any[] = Array.isArray(resolvedSpecs)
    ? resolvedSpecs
    : resolvedSpecs && Array.isArray(resolvedSpecs.specs)
    ? resolvedSpecs.specs
    : [];

  let sawBrowserStep = false;
  let sawScreenshotStep = false;
  let sawRecordingStep = false;
  let sawBashShellStep = false;
  // Automatic screenshots and recordings (ADR 01177): a test that drives a
  // UI takes them unless its resolved key (test > spec > config) is `false`.
  let autoScreenshots = false;
  let autoRecords = false;

  for (const spec of specs) {
    collectBrowserNamesFromRunOn(spec?.runOn, browsers);
    for (const test of arrayOrEmpty<any>(spec?.tests)) {
      collectBrowserNamesFromRunOn(test?.runOn, browsers);
      let drivesUi = false;
      for (const ctx of arrayOrEmpty<any>(test?.contexts)) {
        collectBrowserNamesFromRunOn(ctx?.runOn, browsers);
        if (typeof ctx?.browser?.name === "string") {
          addBrowserName(browsers, ctx.browser.name);
        }
        const ctxHasNonBrowserSignal = testHasNonBrowserSurfaceSignal(
          ctx?.steps
        );
        for (const step of arrayOrEmpty<any>(ctx?.steps)) {
          const flags = classifyStep(step, ctxHasNonBrowserSignal);
          if (flags.browser) sawBrowserStep = true;
          if (flags.ui) drivesUi = true;
          if (flags.screenshot) sawScreenshotStep = true;
          if (flags.recording) sawRecordingStep = true;
          if (stepNeedsBash(step, configShell)) sawBashShellStep = true;
          collectStartSurfaceEngines(step, browsers);
        }
      }
      const testHasNonBrowserSignal = testHasNonBrowserSurfaceSignal(
        test?.steps
      );
      for (const step of arrayOrEmpty<any>(test?.steps)) {
        const flags = classifyStep(step, testHasNonBrowserSignal);
        if (flags.browser) sawBrowserStep = true;
        if (flags.ui) drivesUi = true;
        if (flags.screenshot) sawScreenshotStep = true;
        if (flags.recording) sawRecordingStep = true;
        if (stepNeedsBash(step, configShell)) sawBashShellStep = true;
        collectStartSurfaceEngines(step, browsers);
      }
      if (drivesUi) {
        if ((test?.autoScreenshot ?? spec?.autoScreenshot ?? options.autoScreenshot) !== false)
          autoScreenshots = true;
        if ((test?.autoRecord ?? spec?.autoRecord ?? options.autoRecord) !== false)
          autoRecords = true;
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
  if (sawScreenshotStep || autoScreenshots) {
    for (const name of SCREENSHOT_PACKAGES) npmPackages.add(name);
  }
  if (sawRecordingStep || autoRecords) {
    npmPackages.add("@ffmpeg-installer/ffmpeg");
  }

  return {
    browsers,
    npmPackages,
    windowsBash: sawBashShellStep,
    autoScreenshotOnly: autoScreenshots && !sawScreenshotStep,
  };
}

// Whether a step's shell-based execution resolves to bash. runShell honors
// its own `shell` field over the config default. runCode pins its
// interpreter shell independently of the config default (platform-native on
// Windows for non-bash languages, exactly so a python/node step never forces
// a bash install), so only `language: "bash"` — which needs the bash
// interpreter itself — creates a bash need there.
function stepNeedsBash(step: any, configShell: string): boolean {
  if (!step || typeof step !== "object") return false;
  if ("runShell" in step) {
    const stepShell =
      step.runShell && typeof step.runShell === "object"
        ? step.runShell.shell
        : undefined;
    if ((stepShell ?? configShell) === "bash") return true;
  }
  if ("runCode" in step && step.runCode?.language === "bash") return true;
  // startSurface process descriptors run through the same launcher and the
  // same config-level shell default as runShell.background (they have no
  // per-step shell field).
  if ("startSurface" in step && configShell === "bash") {
    for (const d of startSurfaceDescriptors(step)) {
      if (d && typeof d === "object" && typeof d.process === "string") {
        return true;
      }
    }
  }
  return false;
}

function arrayOrEmpty<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function addBrowserName(set: Set<BrowserName>, name: string): void {
  const normalized = name.toLowerCase();
  if (normalized === "chrome" || normalized === "chromium") set.add("chrome");
  else if (normalized === "firefox") set.add("firefox");
  // `webkit` is the resolved alias for `safari` (resolveContexts rewrites
  // safari -> webkit), so both map to the safari bucket. Without this, a
  // Safari-only spec looks browser-less and falls through to the chrome
  // default — provisioning Chrome for a run that only wanted Safari.
  else if (normalized === "safari" || normalized === "webkit")
    set.add("safari");
  // others — ignored; runner restricts to chrome/firefox/safari.
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

function classifyStep(
  step: any,
  hasNonBrowserSignal = false
): {
  browser: boolean;
  // Drives a browser, native app, or device: what auto capture covers.
  ui: boolean;
  screenshot: boolean;
  recording: boolean;
} {
  if (!step || typeof step !== "object")
    return { browser: false, ui: false, screenshot: false, recording: false };
  let browser = false;
  let ui = false;
  let screenshot = false;
  let recording = false;
  // A non-browser-targeted step drives a native app driver or a background
  // process's stdin, not a browser — mirror the runner's `isBrowserRequired`
  // exclusions so app/process-only specs don't provision a browser binary:
  // explicit `surface: { app: … }` / `surface: { process: … }` payloads, and
  // (ADR 01081) surface-less interaction steps in a test that opens or
  // targets a non-browser surface (they route to the active surface at
  // runtime). This gates ONLY the browser flag: an app screenshot still
  // needs the image stack, and an app recording still needs ffmpeg.
  const nonBrowserTargeted =
    stepTargetsAppSurface(step) ||
    stepTargetsProcessSurface(step) ||
    (hasNonBrowserSignal && stepIsSurfacelessInteraction(step));
  for (const key of Object.keys(step)) {
    if (!nonBrowserTargeted && BROWSER_STEP_KEY_SET.has(key)) browser = true;
    if (BROWSER_STEP_KEY_SET.has(key) && !stepTargetsProcessSurface(step)) ui = true;
    if (SCREENSHOT_STEP_KEYS.has(key)) screenshot = true;
    if (RECORDING_STEP_KEYS.has(key)) recording = true;
  }
  // A startSurface browser descriptor opens a real WebDriver session (Phase
  // 6) — the goTo-opener sibling. App/process descriptors don't set this.
  if (stepOpensBrowserSurface(step)) browser = true;
  if (
    stepOpensBrowserSurface(step) ||
    startSurfaceDescriptors(step).some(
      (d: any) => d && typeof d === "object" && typeof d.app === "string"
    )
  )
    ui = true;
  return { browser, ui, screenshot, recording };
}
