import kill from "tree-kill";
import fs from "node:fs";
// webdriverio is loaded lazily via loadHeavyDep at the driverStart() call
// site so the shim's CLI startup doesn't pay its ~50MB load cost when the
// user is only running e.g. install-agents or install status. The type
// reference uses a minimal LOCAL declaration (WdioModule from ./tests/wdioTypes)
// rather than `typeof import('webdriverio')`, so `tsc` does not require the
// optional package on disk — webdriverio is an optionalDependency that npm may
// skip on a CI runner, and a hard compile-time type reference would otherwise
// turn that skipped install into an intermittent build failure.
import { loadHeavyDep, resolveHeavyDepPath } from "../runtime/loader.js";
import type { WdioModule } from "./tests/wdioTypes.js";
import {
  requiredBrowserAssets,
  ensureBrowserInstalled,
  type BrowserAssetName,
} from "../runtime/browsers.js";
// Single source of truth for browser/driver-requiring step keys.
import { BROWSER_STEP_KEYS as driverActions } from "../runtime/browserStepKeys.js";
import os from "node:os";
import {
  log,
  replaceEnvs,
  selectSpecsForRun,
  findFreePort,
  runConcurrent,
  runResourceAware,
  createResourceRegistry,
  rollUpResults,
  createAppiumPool,
  getRunOutputDir,
  runArchivesArtifacts,
  sanitizeFilesystemName,
} from "./utils.js";
import axios from "axios";
import { instantiateCursor } from "./tests/moveTo.js";
import { goTo } from "./tests/goTo.js";
import { findElement } from "./tests/findElement.js";
import { runShell } from "./tests/runShell.js";
import { checkLink } from "./tests/checkLink.js";
import { typeKeys } from "./tests/typeKeys.js";
import { wait } from "./tests/wait.js";
import { saveScreenshot } from "./tests/saveScreenshot.js";
import { startRecording } from "./tests/startRecording.js";
import { stopRecording } from "./tests/stopRecording.js";
import {
  browserCaptureTitle,
  browserDownloadDir,
  coerceRecordContextBrowser,
  jobIsFfmpegRecording,
  computeEffectiveConcurrency,
  jobExclusiveResources,
  checkSystemBinary,
  xvfbDisplay,
  startXvfb,
  XVFB_SCREEN_SIZE,
  isRecordingActive,
  recordStepName,
  detectRecordingNameConflict,
} from "./tests/ffmpegRecorder.js";
import { loadVariables } from "./tests/loadVariables.js";
import { saveCookie } from "./tests/saveCookie.js";
import { loadCookie } from "./tests/loadCookie.js";
import { httpRequest } from "./tests/httpRequest.js";
import { clickElement } from "./tests/click.js";
import { runCode } from "./tests/runCode.js";
import { closeSurface } from "./tests/closeSurface.js";
import { runBrowserScript } from "./tests/runBrowserScript.js";
import { dragAndDropElement } from "./tests/dragAndDrop.js";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID, createHash } from "node:crypto";
import { setAppiumHome } from "./appium.js";
import { contentHash } from "../common/src/detectTests.js";
import { resolveExpression } from "./expressions.js";
import {
  evaluateCustomAssertions,
  evaluateGuard,
  guardReferencesSteps,
  customAssertionsReferenceSteps,
  resolveStepRouting,
  resolveTestRouting,
  computeRetryDelay,
  buildConditionContext,
} from "./routing.js";
import type { RoutingDecision, StepRoutingStatus } from "./routing.js";
import {
  getEnvironment,
  getAvailableApps,
  clearAppCache,
  resolveConcurrentRunners,
} from "./config.js";
import { uploadChangedFiles } from "./integrations/index.js";
import http from "node:http";
import https from "node:https";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export {
  runSpecs,
  runViaApi,
  getRunner,
  ensureChromeAvailable,
  ensureContextBrowserInstalled,
  combinationKey,
  warmUpDecision,
  selectWarmUpTargets,
  getDriverCapabilities,
  getDefaultBrowser,
  buildFallbackCandidates,
  driverSkipDiagnostic,
  resolveBrowserFallbackPolicy,
  shouldRepairBeforeFallback,
  isSupportedContext,
  resolveAutoScreenshot,
  resolveAutoRecord,
  buildAutoRecordStep,
  specIsRouted,
  killTree,
};
// exports.appiumStart = appiumStart;
// exports.appiumIsReady = appiumIsReady;
// exports.driverStart = driverStart;

// Browser names getDriverCapabilities knows how to build caps for. `safari` is
// rewritten to `webkit` during context resolution, so both appear here.
const KNOWN_BROWSERS = ["firefox", "chrome", "safari", "webkit"];

// Tree-kill a pid and resolve only once the target process is actually gone.
// `tree-kill` is asynchronous (it shells out to `taskkill /T /F` on Windows,
// or walks `ps`/sends signals on POSIX) — callers that fire it without
// awaiting can move on (and the process can exit) before the tree is
// actually gone, orphaning a still-running browser that the pid's Appium
// server owned via its chromedriver/geckodriver child. Every place that
// tears down an Appium server process must await this instead of calling
// `kill()` bare.
//
// tree-kill's own completion callback isn't sufficient on its own: on
// Windows it fires after `taskkill /T /F` (a forceful, synchronous
// termination) exits, so the pid really is gone by then. On POSIX it fires
// once the SIGTERM signal has been *sent* to every pid in the tree, not once
// the OS has actually reaped them — a process can take a moment to exit
// after receiving SIGTERM. So after tree-kill's callback, poll
// `process.kill(pid, 0)` (which throws ESRCH once the pid no longer exists)
// with a bounded timeout, rather than trusting the callback alone.
function killTree(pid?: number, timeoutMs: number = 5000): Promise<void> {
  return new Promise<void>((resolve) => {
    if (!pid) return resolve();
    const waitForExit = async () => {
      const start = Date.now();
      while (isPidAlive(pid) && Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 50));
      }
      resolve();
    };
    try {
      kill(pid, "SIGTERM", () => waitForExit());
    } catch {
      resolve();
    }
  });
}

// Whether `pid` still refers to a live process. `process.kill(pid, 0)` sends
// no signal — it just probes: it throws ESRCH once the pid no longer exists.
function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Stable identity for a "context combination" — the platform + browser pairing
 * that determines whether a driver session can be created. The runner memoizes
 * warm-up outcomes by this key so a combination that fails to start once isn't
 * re-attempted (with its slow driverStart backoff) for every later context.
 * headless is intentionally excluded: headed/headless are two attempts at the
 * same combination (the loop retries headless on failure), not distinct ones.
 * `webkit` is normalized to `safari` so the key matches getAvailableApps naming.
 */
function combinationKey(context: any): string {
  const rawName = context?.browser?.name;
  const name = rawName === "webkit" ? "safari" : rawName || "<none>";
  return `${context?.platform}::${name}`;
}

/**
 * Decide whether a context combination should be attempted or skipped, given
 * its prior warm-up outcome in this run. Pure so the memoization branching is
 * unit-testable without spinning up Appium. A previously-failed combination is
 * skipped outright; everything else is attempted (and its outcome recorded by
 * the caller).
 */
function warmUpDecision(prev: "ok" | "failed" | undefined): "attempt" | "skip" {
  return prev === "failed" ? "skip" : "attempt";
}

// Get Appium driver capabilities and apply options.
function getDriverCapabilities({ runnerDetails, name, options }: { runnerDetails: any; name: any; options: any }): any {
  let capabilities: any = {};
  let args: string[] = [];

  // Fail loudly on an unknown or missing browser name instead of silently
  // returning empty capabilities. Empty caps used to surface downstream as the
  // cryptic "Failed to start context 'undefined'" driver error, hiding the real
  // problem (no browser was ever resolved for the context).
  if (!name || !KNOWN_BROWSERS.includes(name)) {
    throw new Error(
      `Cannot build driver capabilities: unknown or missing browser name '${name}'. ` +
        `Expected one of: ${KNOWN_BROWSERS.join(", ")}.`
    );
  }

  // Set Firefox capabilities
  switch (name) {
    case "firefox": {
      const firefox = runnerDetails.availableApps.find(
        (app: any) => app.name === "firefox"
      );
      if (!firefox) break;
      // Set args
      // Reference: https://wiki.mozilla.org/Firefox/CommandLineOptions
      if (options.headless) args.push("--headless");
      // Set capabilities
      capabilities = {
        platformName: runnerDetails.environment.platform,
        "appium:automationName": "Gecko",
        "appium:newCommandTimeout": 600, // 10 minutes
        browserName: "MozillaFirefox",
        "wdio:enforceWebDriverClassic": true, // Disable BiDi, use classic mode
        "moz:firefoxOptions": {
          // Reference: https://developer.mozilla.org/en-US/docs/Web/WebDriver/Capabilities/firefoxOptions
          args,
          // If recording, make bottom corners pointed
          profile:
            "UEsDBBQAAAAIAKm6lldWzDiRbgAAAKUAAAAlAAAAZmlyZWZveF9wcm9maWxlL2Nocm9tZS91c2VyQ2hyb21lLmNzc3XMQQrCMBBG4X1O8Yu7QqhrPYOHiGbaDpqZMBmJIN7dgu6K28fHC+OAc7oRLuquBVc1IWvQCb6s1bQ3MnSWrB1VWZwyhjHsS2KJv/4KWAeWyeL3E+80ebSU+dGOONQndlyqmifx0wYbz8t//Q4fUEsBAhQDFAAAAAgAqbqWV1bMOJFuAAAApQAAACUAAAAAAAAAAAAAAKSBAAAAAGZpcmVmb3hfcHJvZmlsZS9jaHJvbWUvdXNlckNocm9tZS5jc3NQSwUGAAAAAAEAAQBTAAAAsQAAAAAA",
          prefs: {
            "toolkit.legacyUserProfileCustomizations.stylesheets": true, // Enable userChrome.css and userContent.css
          },
          binary: firefox.path,
        },
      };
      break;
    }
    case "safari":
    // `safari` is rewritten to `webkit` during context resolution, so the
    // runtime browser name is usually `webkit`. Both map to Safari.
    case "webkit":
      // Set Safari capabilities
      if (runnerDetails.availableApps.find((app: any) => app.name === "safari")) {
        let safari = runnerDetails.availableApps.find(
          (app: any) => app.name === "safari"
        );
        if (!safari) break;
        // Set capabilities
        capabilities = {
          platformName: "Mac",
          "appium:automationName": "Safari",
          "appium:newCommandTimeout": 600, // 10 minutes
          browserName: "Safari",
          "wdio:enforceWebDriverClassic": true, // Disable BiDi, use classic mode
        };
      }
      break;
    case "chrome":
      // Set Chrome(ium) capabilities
      if (runnerDetails.availableApps.find((app: any) => app.name === name)) {
        const chromium = runnerDetails.availableApps.find(
          (app: any) => app.name === name
        );
        if (!chromium) break;
        // Set args
        args.push(`--enable-chrome-browser-cloud-management`);
        // Auto-select the getDisplayMedia capture source by window title. A
        // per-context title (set on document.title in startRecording) makes
        // concurrent Chrome recordings safe: each browser process auto-selects
        // only its own window. Falls back to the shared default for callers
        // (warm-up, non-record contexts) that don't supply one.
        args.push(
          `--auto-select-desktop-capture-source=${
            options.captureSourceTitle || "RECORD_ME"
          }`
        );
        if (options.headless) args.push("--headless", "--disable-gpu");
        if (process.platform === "linux") {
          args.push("--no-sandbox");
          // Chrome writes shared memory to /dev/shm, which is only ~64MB on
          // many Linux/CI hosts. A single browser fits, but several launched
          // at once under concurrentRunners exhaust it and ChromeDriver
          // "crashed during startup". Redirect that allocation to /tmp so
          // parallel browser contexts start reliably.
          args.push("--disable-dev-shm-usage");
        }
        // Set capabilities
        capabilities = {
          platformName: runnerDetails.environment.platform,
          "appium:automationName": "Chromium",
          "appium:newCommandTimeout": 600, // 10 minutes
          "appium:executable": chromium.driver,
          browserName: "chrome",
          "wdio:enforceWebDriverClassic": true, // Disable BiDi, use classic mode
          "goog:chromeOptions": {
            // Reference: https://chromedriver.chromium.org/capabilities#h.p_ID_102
            args,
            prefs: {
              // Per-context download dir keeps concurrent recordings from
              // colliding on the same .webm filename in a shared temp dir.
              "download.default_directory": options.downloadDir || os.tmpdir(),
              "download.prompt_for_download": false,
              "download.directory_upgrade": true,
            },
            binary: chromium.path,
          },
        };
      }
      break;
    default:
      break;
  }

  return capabilities;
}


function isDriverRequired({ test }: { test: any }) {
  let driverRequired = false;
  // The resolved shape doesn't guarantee `steps` — treat a stepless test or
  // context as needing no driver instead of throwing.
  (test.steps || []).forEach((step: any) => {
    // Check if test includes actions that require a driver.
    driverActions.forEach((action) => {
      if (typeof step[action] !== "undefined") driverRequired = true;
    });
  });
  return driverRequired;
}

// The exclusive resources a context job must hold to run safely under
// concurrency. A shared-display ffmpeg recording holds "display" exclusively
// (jobExclusiveResources). And once ANY such recording is in the run
// (`runHasDisplayRecording`), every OTHER driver/browser context also
// serializes on "display": a recording's ffmpeg capture would otherwise include
// their windows and starve them on the shared display. Non-driver jobs
// (HTTP/shell) never take the display, so they stay parallel. On Linux+Xvfb the
// recordings get isolated displays, so `runHasDisplayRecording` is false there
// and nothing is promoted — driver work runs fully parallel.
function jobDisplayResources(
  job: any,
  ctx: {
    platform: string;
    xvfbAvailable: boolean;
    allowOverlappingCaptures?: boolean;
    runHasDisplayRecording: boolean;
  }
): string[] {
  const base = jobExclusiveResources(job, ctx);
  if (base.length) return base;
  if (
    ctx.runHasDisplayRecording &&
    isDriverRequired({ test: { steps: job.context?.steps } })
  ) {
    return ["display"];
  }
  return [];
}

// Check if context is supported by current platform and available apps
function isSupportedContext({ context, apps, platform }: { context: any; apps: any[]; platform: any }) {
  // Check browsers
  let isSupportedApp: any = true;
  // Check platform
  const isSupportedPlatform = context.platform === platform;
  if (context?.browser?.name) {
    // `safari` is normalized to `webkit` during context resolution, but
    // getAvailableApps reports Safari as `safari`. Map it back so a Safari
    // context isn't wrongly treated as unsupported (which would skip it before
    // getDriverCapabilities could apply the same alias).
    const appName =
      context.browser.name === "webkit" ? "safari" : context.browser.name;
    isSupportedApp = apps.find((app: any) => app.name === appName);
  } else if (Array.isArray(context?.steps) && isDriverRequired({ test: context })) {
    // A context that needs a browser driver but has no resolvable browser name
    // can't run. Treat it as unsupported so it's cleanly skipped rather than
    // failing later with "Failed to start context 'undefined'". The
    // Array.isArray(steps) guard keeps isDriverRequired (which iterates steps)
    // from throwing on a steps-less context; such a context does no driver work
    // anyway, so leaving it supported here is harmless.
    isSupportedApp = false;
  }
  // Return boolean
  return Boolean(isSupportedApp && isSupportedPlatform);
}

function getDefaultBrowser({ runnerDetails }: { runnerDetails: any }) {
  let browser: any = {};
  const browserNames = ["firefox", "chrome", "safari"];
  for (const name of browserNames) {
    if (runnerDetails.availableApps.find((app: any) => app.name === name)) {
      browser = { name };
      break;
    }
  }
  return browser;
}

// `webkit` is the runtime alias for Safari (context resolution rewrites it),
// while getAvailableApps reports the engine as `safari`. Normalize so the two
// names compare and dedupe as one engine.
function normalizeBrowserName(name: string | undefined): string {
  return name === "webkit" ? "safari" : name ?? "";
}

/**
 * Build the ordered list of browser engines to attempt for a context — the
 * heart of the any-browser → any-available-browser fallback. The requested
 * engine is tried first (when it's actually available); then, when the
 * `browserFallback` policy permits, every *other* available engine follows in
 * a stable preference order. Every returned name maps to an available engine —
 * the requested name is preserved as authored (so `webkit` can be returned even
 * though `availableApps` lists it as `safari`), while fallback names come
 * straight from `availableApps`; `webkit` is normalized to `safari` only for
 * the availability lookup and dedupe. getDriverCapabilities accepts both
 * aliases, so either resolves to real binary/driver paths.
 *
 * Policy:
 *  - "auto"     → fall back for both auto-selected and explicitly pinned browsers.
 *  - "explicit" → fall back only when the browser was auto-selected (not pinned).
 *  - "off"      → never fall back; only the requested engine (if available).
 *
 * Pure and exported so the precedence is unit-testable without a driver.
 */
function buildFallbackCandidates({
  requestedName,
  explicit,
  policy,
  availableApps,
}: {
  requestedName: string;
  explicit: boolean;
  policy: string;
  availableApps: any[];
}): string[] {
  const available = new Set(
    (availableApps || []).map((a: any) => a.name)
  );
  const requestedNorm = normalizeBrowserName(requestedName);
  const candidates: string[] = [];

  // Requested engine first — only if it's actually available (has a working
  // driver). If it isn't, we go straight to fallbacks (or skip).
  if (available.has(requestedNorm)) candidates.push(requestedName);

  const fallbackAllowed =
    policy === "auto" || (policy === "explicit" && !explicit);
  if (fallbackAllowed) {
    for (const name of ["firefox", "chrome", "safari"]) {
      if (name === requestedNorm) continue;
      if (available.has(name)) candidates.push(name);
    }
  }
  return candidates;
}

/**
 * Resolve the effective `browserFallback` policy for a context. A context-level
 * value (authored on the `runOn` entry) overrides the config-level value, which
 * itself defaults to `auto`. Pure and exported so the precedence is testable.
 */
function resolveBrowserFallbackPolicy({
  context,
  config,
}: {
  context: any;
  config: any;
}): string {
  return context?.browserFallback || config?.browserFallback || "auto";
}

/**
 * Whether to attempt a driver repair before falling back away from a browser
 * whose session just failed to start. We only repair the *requested* engine
 * (so a fallback substitute that fails isn't itself repaired), only when it has
 * installable driver assets (Safari ships with the OS — nothing to repair), and
 * only once per browser per run (a prior attempt already recorded an outcome in
 * `installAttempts`). This is what keeps a present-but-broken driver from
 * causing an unnecessary fallback when a reinstall would have fixed it. Pure
 * and exported so the decision is unit-testable.
 */
function shouldRepairBeforeFallback({
  candidateName,
  requestedName,
  installAttempts,
}: {
  candidateName: string;
  requestedName: string;
  installAttempts: Map<string, "installed" | "failed" | "notInstallable">;
}): boolean {
  if (normalizeBrowserName(candidateName) !== normalizeBrowserName(requestedName)) {
    return false;
  }
  if (requiredBrowserAssets(candidateName).length === 0) return false;
  return !installAttempts.has((candidateName ?? "<none>").toLowerCase());
}

/**
 * The diagnostic message recorded when no engine could start a session. Names
 * the requested engine and whether a cross-engine fallback was even attempted,
 * so a present-but-broken driver reads as actionable rather than a generic
 * "Failed to start context" skip.
 */
function driverSkipDiagnostic({
  requestedName,
  platform,
  platformMatches,
  attemptedFallback,
  lastError,
}: {
  requestedName: string;
  platform: string;
  platformMatches: boolean;
  attemptedFallback: boolean;
  lastError?: string;
}): string {
  if (!platformMatches) {
    return `Skipping context on '${platform}': this context targets a different platform.`;
  }
  // Name the driver for the actual requested engine so the hint doesn't always
  // point users at geckodriver when Chrome or Safari is the broken one.
  const driverHint =
    normalizeBrowserName(requestedName) === "firefox"
      ? "geckodriver"
      : normalizeBrowserName(requestedName) === "chrome"
        ? "chromedriver"
        : normalizeBrowserName(requestedName) === "safari"
          ? "safaridriver"
          : "driver";
  let msg = `Skipping context: could not start a browser session for '${requestedName}' on '${platform}'`;
  msg += attemptedFallback
    ? `, and no other available browser could start either.`
    : ` and cross-browser fallback is disabled or unavailable.`;
  if (lastError) msg += ` Last error: ${lastError}`;
  msg += ` A present-but-broken driver (for example a partially downloaded ${driverHint}) can cause this; reinstall the driver or its browser.`;
  return msg;
}

// Set window size to match target viewport size
async function setViewportSize(context: any, driver: any) {
  if (context.browser?.viewport?.width || context.browser?.viewport?.height) {
    // Get viewport size, not window size
    const viewportSize = await driver.execute(
      "return { width: window.innerWidth, height: window.innerHeight }",
      []
    );
    // Get window size
    const windowSize = await driver.getWindowSize();
    // Get viewport size delta
    const deltaWidth =
      (context.browser?.viewport?.width || viewportSize.width) -
      viewportSize.width;
    const deltaHeight =
      (context.browser?.viewport?.height || viewportSize.height) -
      viewportSize.height;
    // Resize window if necessary
    await driver.setWindowSize(
      windowSize.width + deltaWidth,
      windowSize.height + deltaHeight
    );
    // Confirm viewport size
  }
}

async function allowUnsafeSteps({ config }: { config: any }) {
  // If allowUnsafeSteps is set to true, return true
  if (config.allowUnsafeSteps === true) return true;
  // If allowUnsafeSteps is set to false, return false
  if (config.allowUnsafeSteps === false) return false;
  // if DOC_DETECTIVE.container is set to true, return true
  if (process.env.DOC_DETECTIVE) {
    try {
      if (JSON.parse(process.env.DOC_DETECTIVE).container) return true;
    } catch {
      // Invalid JSON in DOC_DETECTIVE env var; treat as unset
    }
  }
  // Default: return false
  return false;
}

// Run specifications via API.
async function runViaApi({ resolvedTests, apiKey, config = {} }: { resolvedTests: any; apiKey: any; config?: any }): Promise<any> {
  // Apply specFilter / testFilter before sending. Without this the API run
  // path silently ignores --test / --spec, since the orchestration server
  // sees the full unfiltered payload.
  const runConfig = resolvedTests?.config ?? config;
  const filtersActive =
    (Array.isArray(runConfig?.specFilter) && runConfig.specFilter.length > 0) ||
    (Array.isArray(runConfig?.testFilter) && runConfig.testFilter.length > 0);
  if (filtersActive) {
    const filteredSpecs = selectSpecsForRun(resolvedTests?.specs ?? [], runConfig);
    if (filteredSpecs.length === 0) {
      log(
        runConfig,
        "warning",
        "No specs or tests matched the configured filters. Nothing was sent to the Doc Detective API."
      );
      return {
        summary: {
          specs: { pass: 0, fail: 0, warning: 0, skipped: 0 },
          tests: { pass: 0, fail: 0, warning: 0, skipped: 0 },
          contexts: { pass: 0, fail: 0, warning: 0, skipped: 0 },
          steps: { pass: 0, fail: 0, warning: 0, skipped: 0 },
        },
        specs: [],
      };
    }
    resolvedTests = { ...resolvedTests, specs: filteredSpecs };
  }

  const baseUrl =
    process.env.DOC_DETECTIVE_API_URL || "https://api.doc-detective.com";
  // Make an API request to create a test run
  const apiUrl = `${baseUrl}/runs`;

  // Configure axios with proper timeout and connection handling
  const axiosConfig = {
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    // Prevent connection reuse issues with keep-alive
    httpAgent: new http.Agent({ keepAlive: false }),
    httpsAgent: new https.Agent({ keepAlive: false }),
  };

  // Create run
  let createResponse;
  try {
    createResponse = await axios.post(apiUrl, resolvedTests, axiosConfig);
  } catch (error: any) {
    return {
      status: error.response?.status,
      error: error.response?.data?.error,
    };
  }
  if (createResponse.status !== 201) {
    return { status: createResponse.status, error: createResponse.data.error };
  }
  const runId = createResponse.data.run.runId;

  // TODO: Add file uploads, if any

  // Start run
  let startResponse;
  try {
    startResponse = await axios.post(
      `${apiUrl}/${runId}/start`,
      {},
      axiosConfig
    );
  } catch (error: any) {
    return {
      status: error.response?.status,
      error: error.response?.data?.error,
    };
  }
  if (startResponse.status !== 200) {
    return { status: startResponse.status, error: startResponse.data.error };
  }

  // Poll for results
  const pollInterval = 5000; // 5 seconds in milliseconds
  const pollIntervalVariance = 2000; // +/- 2 seconds
  const maxWaitTime = (config.apiMaxWaitTime || 600) * 1000; // Default 600 seconds (10 minutes), converted to milliseconds
  const startTime = Date.now();

  let response: any;
  while (true) {
    // Check if we've exceeded the max wait time
    if (Date.now() - startTime > maxWaitTime) {
      return {
        status: 408,
        type: "TIMEOUT",
        error: `Test execution exceeded maximum wait time of ${
          maxWaitTime / 1000
        } seconds`,
      };
    }

    // Poll for results
    try {
      response = await axios.get(`${apiUrl}/${runId}`, axiosConfig);
    } catch (error: any) {
      return {
        status: error.response?.status,
        error: error.response?.data?.error,
      };
    }

    if (response.status !== 200) {
      return { status: response.status, error: response.data.error };
    }

    // Check if the test run is complete
    if (response.data.status === "completed") {
      break;
    }

    // Wait before polling again (with variance)
    const variance =
      Math.random() * pollIntervalVariance * 2 - pollIntervalVariance;
    const waitTime = pollInterval + variance;
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  // TODO: Handle file downloads/placement, if any

  try {
    const results = JSON.parse(response.data.report);
    return results;
  } catch (error: any) {
    return {
      status: "PARSE_ERROR",
      error: `Failed to parse API response: ${error.message}`,
    };
  }
}

/**
 * Orchestrates execution of resolved test specifications and returns a hierarchical run report.
 *
 * Flattens every context across all specs and tests into one job list and runs it through a
 * worker pool sized by config.concurrentRunners (default 1 = sequential). Conditionally starts
 * Appium and browser drivers, applies viewport/window sizing, handles unsafe-step policies and
 * recording, then rolls per-step, per-context, per-test, and per-spec results up in a
 * deterministic post-pass. Report order always matches input order.
 *
 * @param {Object} resolvedTests - Resolved test bundle containing configuration and specs to run.
 * @param {Object} resolvedTests.config - Runner configuration used during execution.
 * @param {Array<Object>} resolvedTests.specs - Array of spec objects to execute.
 * @returns {Object} A report object summarizing results with structure:
 *  {
 *    summary: { specs: {...}, tests: {...}, contexts: {...}, steps: {...} },
 *    specs: [ { specId, description, contentPath, result, tests: [ { testId, description, contentPath, result, contexts: [ { platform, browser, result, steps: [...] } ] } ] } ]
 *  }
 */
async function runSpecs({ resolvedTests }: { resolvedTests: any }) {
  const config: any = resolvedTests.config;
  // Narrow the spec set to what specFilter / testFilter allow before running.
  // Filtered-out specs / tests do not appear in the report (true filter, not
  // skip). Pass-through when neither filter is set.
  const filtersActive =
    (Array.isArray(config?.specFilter) && config.specFilter.length > 0) ||
    (Array.isArray(config?.testFilter) && config.testFilter.length > 0);
  const specs = selectSpecsForRun(resolvedTests.specs, config);
  if (filtersActive && specs.length === 0) {
    log(
      config,
      "warning",
      "No specs or tests matched the configured filters. Nothing was run."
    );
    // Short-circuit: skip environment / app discovery and the spec-iteration
    // loop entirely. Without this, a fully-filtered run still spins up
    // getAvailableApps and friends — wasted work, plus an avoidable error
    // path if discovery fails on the host. Mirrors the runViaApi early
    // return so both run paths behave the same way.
    return {
      summary: {
        specs: { pass: 0, fail: 0, warning: 0, skipped: 0 },
        tests: { pass: 0, fail: 0, warning: 0, skipped: 0 },
        contexts: { pass: 0, fail: 0, warning: 0, skipped: 0 },
        steps: { pass: 0, fail: 0, warning: 0, skipped: 0 },
      },
      specs: [],
    };
  }

  // Get runner details
  const runnerDetails = {
    environment: getEnvironment(),
    availableApps: await getAvailableApps({ config }),
    allowUnsafeSteps: await allowUnsafeSteps({ config }),
  };

  // Set initial shorthand values
  const platform = runnerDetails.environment.platform;
  // `let`, not `const`: an on-demand browser install during the context loop
  // re-detects available apps and reassigns this snapshot (see the support
  // gate below).
  let availableApps = runnerDetails.availableApps;
  const metaValues: any = { specs: {} };
  // Per-run memoization, shared across the concurrent context pool below.
  // installAttempts keeps a browser's on-demand install from being retried for
  // every context that uses it; warmUpResults keeps a context combination that
  // can't start a driver from being re-attempted (with its slow driverStart
  // backoff) for the rest of the run.
  const installAttempts = new Map<
    string,
    "installed" | "failed" | "notInstallable"
  >();
  const warmUpResults = new Map<string, "ok" | "failed">();
  // Per-run artifact folder and ID, stamped on the report so the runFolder
  // reporter archives results beside any auto screenshots from the same run,
  // and so consumers can correlate results over time. Created after the
  // filter short-circuit above so a run that matched nothing leaves no folder.
  // Only create the folder when something will actually write into it (the
  // runFolder reporter, or autoScreenshot at any of config/spec/test level) —
  // otherwise just resolve the path for the report stamp and leave no empty
  // `.doc-detective/runs/<id>/` behind. Pass the selected specs so per-spec/test
  // autoScreenshot reserves the folder atomically up front rather than via the
  // non-atomic memoized branch when the first screenshot fires.
  const runDir = getRunOutputDir(config, {
    create: runArchivesArtifacts(config, specs),
  });
  // The run folder name IS the runId under the `runs/<id>` layout — no prefix
  // to strip.
  const runId = path.basename(runDir);
  const report: any = {
    runId,
    runDir,
    summary: {
      specs: {
        pass: 0,
        fail: 0,
        warning: 0,
        skipped: 0,
      },
      tests: {
        pass: 0,
        fail: 0,
        warning: 0,
        skipped: 0,
      },
      contexts: {
        pass: 0,
        fail: 0,
        warning: 0,
        skipped: 0,
      },
      steps: {
        pass: 0,
        fail: 0,
        warning: 0,
        skipped: 0,
      },
    },
    specs: [],
  };

  // Resolve concurrency up front (defensive re-resolve: API callers can hand
  // runSpecs a config that never went through core setConfig, leaving
  // concurrentRunners as `true`). Drives both the worker pool and how many
  // Appium servers to start. Mutable: recording constraints may cap it below.
  let limit = resolveConcurrentRunners(config);

  // Phase 1: pre-build the report skeleton and a flat list of context jobs
  // across all specs and tests. Slots are pre-assigned so report order always
  // matches input order, no matter what order concurrent contexts finish in.
  log(config, "info", "Running test specs.");
  const jobs: any[] = [];
  // ROUTED specs (any test carries a non-empty test-level routing handler) are
  // executed by the sequential `runRoutedSpec` sequencer AFTER the flat pool,
  // not via `jobs[]`. They are collected here in input order with their already
  // pushed (empty) specReport and resolved spec-guard skip flag. NON-routed
  // specs (every spec today) take the unchanged flat-pool path below, byte for
  // byte. `routedSizingJobs` holds job-shaped descriptors for every routed
  // context — used ONLY to size the Appium pool / recording concurrency / warm
  // up alongside the flat jobs; the sequencer re-prepares each context at
  // execution time and never runs these descriptors.
  const routedSpecs: Array<{ spec: any; specReport: any; specGuardSkip: boolean }> =
    [];
  const routedSizingJobs: any[] = [];
  // Set when at least one context gets a synthetic autoRecord (ffmpeg) step.
  // It opts the run into overlapping ffmpeg captures (parallel anyway) rather
  // than the safe-serial default reserved for explicit-only ffmpeg recordings.
  // A holder object so the shared prepareContextSlot helper can flip it from
  // either path.
  const autoRecordFlag = { injected: false };
  const markAutoRecord = () => {
    autoRecordFlag.injected = true;
  };
  for (const spec of specs) {
    log(config, "debug", `SPEC: ${spec.specId}`);
    // Create-if-missing: specIds (and testIds) aren't guaranteed unique
    // across the run, and all registration now happens up front — an
    // overwrite here would wipe an earlier spec's registered tests.
    metaValues.specs[spec.specId] ??= { tests: {} };
    // Spec-level guard `if`: evaluated once against the host platform. Tests
    // aren't sequenced relative to each other, so cross-test `$$outputs`/
    // `$$steps` are not meaningful here — only `$$platform` (plus any meta
    // `buildConditionContext` exposes). Fails CLOSED (unresolvable -> false).
    // When false, every test/context in this spec is recorded SKIPPED below and
    // no job is enqueued. Fully gated on `spec.if` presence: a spec with no
    // `if` is byte-identical (no evaluation, `specGuardSkip` stays false).
    let specGuardSkip = false;
    if (spec.if) {
      if (guardReferencesSteps(spec.if)) {
        log(
          config,
          "warning",
          `Spec '${spec.specId}': 'if' references '$$steps.*', which is not available at spec scope — the guard will always fail closed (the spec is always skipped). Use '$$steps.*' only in step-level 'if'.`
        );
      }
      const guardPassed = await evaluateGuard(
        spec.if,
        buildConditionContext({ platform })
      );
      specGuardSkip = !guardPassed;
    }
    const specReport: any = {
      specId: spec.specId,
      description: spec.description,
      contentPath: spec.contentPath,
      tests: [],
    };
    report.specs.push(specReport);

    const routed = specIsRouted(spec);
    if (routed) {
      // ROUTED spec: defer test execution to the sequencer. Phase-1 only
      // registers the spec (order-preserving specReport pushed above) and sizes
      // its contexts. The sequencer (runRoutedSpec) builds the per-test
      // testReports, applies the same per-test/per-context preflight via the
      // shared helpers, runs the contexts, and evaluates test-level routing
      // between tests. specGuardSkip is carried so the sequencer can record
      // spec-guard SKIPPED contexts without entering the routing loop.
      routedSpecs.push({ spec, specReport, specGuardSkip });
      // Sizing only: prepare each context (idempotent — the sequencer re-runs
      // the identical helper at execution time) so the Appium pool, recording
      // concurrency, and warm-up account for routed driver contexts too.
      for (const test of spec.tests) {
        const { testGuardSkip, recordingNameConflict, usedContextIds } =
          await prepareTestPreflight({
            config,
            spec,
            test,
            specGuardSkip,
            platform,
          });
        test.contexts.forEach((context: any, slot: number) => {
          const result = prepareContextSlot({
            config,
            spec,
            test,
            context,
            slot,
            usedContextIds,
            specGuardSkip,
            testGuardSkip,
            recordingNameConflict,
            runnerDetails,
            contexts: new Array(test.contexts.length),
            onAutoRecord: markAutoRecord,
          });
          if (result.kind === "job") routedSizingJobs.push(result.job);
        });
      }
      continue;
    }

    // NON-ROUTED spec: the unchanged flat-pool path. Builds testReports, runs
    // the same per-test/per-context preflight via the shared helpers, and pushes
    // runnable contexts to the flat `jobs[]`. Output is byte-identical to the
    // pre-routing runner.
    for (const test of spec.tests) {
      log(config, "debug", `TEST: ${test.testId}`);
      metaValues.specs[spec.specId].tests[test.testId] ??= { contexts: {} };
      const testReport: any = {
        testId: test.testId,
        description: test.description,
        contentPath: test.contentPath,
        detectSteps: test.detectSteps,
        contexts: new Array(test.contexts.length),
      };
      specReport.tests.push(testReport);
      const { testGuardSkip, recordingNameConflict, usedContextIds } =
        await prepareTestPreflight({
          config,
          spec,
          test,
          specGuardSkip,
          platform,
        });
      test.contexts.forEach((context: any, slot: number) => {
        const result = prepareContextSlot({
          config,
          spec,
          test,
          context,
          slot,
          usedContextIds,
          specGuardSkip,
          testGuardSkip,
          recordingNameConflict,
          runnerDetails,
          contexts: testReport.contexts,
          onAutoRecord: markAutoRecord,
        });
        if (result.kind === "skipped") {
          testReport.contexts[slot] = result.contextReport;
        } else {
          jobs.push(result.job);
        }
      });
    }
  }

  // Recording concurrency. The browser (Chrome getDisplayMedia) engine is
  // concurrency-safe via per-context capture titles, but the ffmpeg engine
  // grabs the whole physical display and must own it — so concurrent ffmpeg
  // recordings are only safe on Linux with per-runner Xvfb displays. Probe
  // Xvfb only when it could matter, then let computeEffectiveConcurrency
  // decide the effective limit.
  // Only ffmpeg-engine recordings need Xvfb; a browser-engine-only run
  // shouldn't pay for an `Xvfb -help` spawn. Contexts are already coerced
  // above, so resolveRecordPlan reflects the engine that will actually run.
  // Sizing view: the flat (non-routed) jobs PLUS every routed context. Routed
  // contexts execute in the sequencer, not the flat pool, but they still need
  // the Appium pool / recording concurrency / warm-up to account for them.
  // Execution stays split; only sizing reads this combined list.
  const sizingJobs = jobs.concat(routedSizingJobs);
  const anyFfmpegRecording = sizingJobs.some(jobIsFfmpegRecording);
  let xvfbAvailable = false;
  if (anyFfmpegRecording && process.platform === "linux") {
    xvfbAvailable = await checkSystemBinary("Xvfb");
  }
  // "Parallel anyway" is an autoRecord-only opt-in: only bypass the forced-serial
  // safeguard when every ffmpeg recording in the run is a synthetic autoRecord
  // capture. If any explicit (author-written) record step would run as ffmpeg,
  // keep the safe serial default so those recordings aren't silently
  // parallelized (which would clobber each other on a shared display).
  const hasExplicitFfmpegRecording = sizingJobs.some((job: any) =>
    jobIsFfmpegRecording({
      context: {
        ...job.context,
        steps: Array.isArray(job.context?.steps)
          ? job.context.steps.filter((s: any) => !s?.__autoRecord)
          : [],
      },
    })
  );
  const concurrency = computeEffectiveConcurrency({
    requestedLimit: limit,
    jobs: sizingJobs,
    platform: process.platform,
    xvfbAvailable,
    allowOverlappingCaptures:
      autoRecordFlag.injected && !hasExplicitFfmpegRecording,
  });
  // Inputs for tagging a job with the exclusive resources it must hold under
  // concurrency. Mirrors what computeEffectiveConcurrency used, so the tag and
  // the Xvfb/overlap decision stay in lock-step.
  const exclusivityBase = {
    platform: process.platform,
    xvfbAvailable,
    allowOverlappingCaptures:
      autoRecordFlag.injected && !hasExplicitFfmpegRecording,
  };
  // Does the run contain a shared-display ffmpeg recording? If so, every driver
  // context (not just the recordings) serializes on "display" — see
  // jobDisplayResources. Computed over the full sizing view (flat + routed) so a
  // recording in any spec gates driver work everywhere.
  const runHasDisplayRecording =
    limit > 1 &&
    sizingJobs.some((j: any) =>
      jobExclusiveResources(j, exclusivityBase).includes("display")
    );
  // Reused by the routed sequencer below.
  const exclusivityCtx = { ...exclusivityBase, runHasDisplayRecording };
  // We no longer collapse `limit` to 1 for shared-display recordings. Instead,
  // at limit>1, tag each flat job and let the resource-aware pool serialize the
  // display-bound work (recordings + every driver context while a recording is
  // present) while non-driver jobs stay parallel. computeEffectiveConcurrency
  // still drives Xvfb isolation (xvfbContexts) and the autoRecord-overlap
  // warning. At limit===1 the single worker is already serial, so the old path
  // is left byte-identical.
  if (limit > 1) {
    for (const job of jobs)
      job.exclusiveResources = jobDisplayResources(job, exclusivityCtx);
  }
  // Report/warn off `runHasDisplayRecording`, which spans the full sizing view
  // (flat + routed) — a routed-only run with a recording still serializes (the
  // routed sequencer tags its own contexts) and must report so too.
  if (runHasDisplayRecording) {
    log(
      config,
      "warning",
      "ffmpeg recordings are serialized to protect the shared display; non-driver work still runs in parallel. To record concurrently, use the Chrome browser engine (record: { engine: \"browser\" })."
    );
    report.recordingSerialized = true;
  } else if (concurrency.overlappingCaptures && limit > 1) {
    log(
      config,
      "warning",
      "autoRecord is running ffmpeg recordings concurrently on a shared display, so the captured videos will overlap (each context records the whole screen). For isolated concurrent recordings, run on Linux with Xvfb installed."
    );
  }

  // Start one Appium server per concurrent runner that will actually use a
  // driver (capped at the number of driver contexts). Each server owns a
  // distinct port, so parallel contexts never create sessions on the same
  // server — that contention crashed ChromeDriver when every context shared
  // one server. Non-driver runs start none.
  const driverJobCount = sizingJobs.filter((job: any) =>
    isDriverRequired({ test: job.context })
  ).length;
  let appiumServers: Array<{ port: number; process: any; display?: string }> =
    [];
  let appiumPool:
    | { acquire(): Promise<number>; release(port: number): void }
    | undefined;
  // Per-server virtual displays (Linux Xvfb) for concurrent ffmpeg recording,
  // and the port→display map so a context that acquires a server records the
  // same display its browser renders on.
  const xvfbProcesses: any[] = [];
  const useXvfbDisplays = concurrency.xvfbContexts.length > 0;
  let portToDisplay: Map<number, string> | undefined;

  if (driverJobCount > 0) {
    setAppiumHome({ cacheDir: config?.cacheDir });
    // Resolve appium's actual JS entrypoint via `require.resolve` (shim
    // node_modules first, runtime cache second) and invoke it with
    // `node <entry>`. This sidesteps every shell-injection trap at once: no
    // `.cmd` shim, so no Windows-requires-shell:true; no `npx`, so no PATH
    // lookup; no user-controlled paths in a shell-interpreted string. Works
    // for both `--omit=optional` users (appium in cache only) and default
    // installs (appium in shim).
    const appiumEntry = resolveHeavyDepPath("appium", {
      cacheDir: config?.cacheDir,
    });
    if (!appiumEntry) {
      throw new Error(
        "appium is not installed. The runtime pre-flight should have installed it; check DOC_DETECTIVE_CACHE_DIR / config.cacheDir or run `doc-detective install runtime appium`."
      );
    }
    const serverCount = Math.min(limit, driverJobCount);
    log(config, "debug", `Starting ${serverCount} Appium server(s).`);
    // Start servers one at a time rather than all at once: concurrent
    // findFreePort() calls share a close-to-rebind window (two could hand out
    // the same port), and spawning every Appium at once spikes CPU during
    // startup. Sequential startup is a one-time per-run cost (serverCount <= 4)
    // that removes the port race and fails fast on the first server that can't
    // come up, tearing down any already started so they don't leak.
    try {
      for (let i = 0; i < serverCount; i++) {
        let display: string | undefined;
        if (useXvfbDisplays) {
          display = xvfbDisplay(i);
          xvfbProcesses.push(await startXvfb(display));
          log(config, "debug", `Started Xvfb on ${display} for recording.`);
        }
        appiumServers.push(
          await startAppiumServer(appiumEntry, config, display)
        );
      }
    } catch (error) {
      await Promise.all(
        appiumServers.map((server) => {
          log(
            config,
            "debug",
            `Closing Appium server on port ${server.port} after startup failure`
          );
          return killTree(server.process?.pid);
        })
      );
      for (const xvfb of xvfbProcesses) {
        try {
          xvfb.kill();
        } catch {
          // best-effort
        }
      }
      throw error;
    }
    appiumPool = createAppiumPool(appiumServers.map((s) => s.port));
    if (useXvfbDisplays) {
      portToDisplay = new Map(
        appiumServers
          .filter((s) => s.display)
          .map((s) => [s.port, s.display as string])
      );
    }
  }

  // Registry of long-running background processes started by `background`
  // runShell/runCode steps. Owned by this run (not per-context) so processes
  // survive across specs/tests and are torn down once — by a closeSurface step
  // or the run-end sweep in the `finally` below.
  const processRegistry = new Map<string, any>();

  // Kill every still-registered background process (and its child tree) and
  // remove any deferred temp scripts. Awaits the kills so the process tree is
  // actually gone before the run returns. Idempotent: closeSurface already
  // removes the entries it handles.
  const killAllRegistered = async () => {
    const entries = [...processRegistry.entries()];
    processRegistry.clear();
    await Promise.all(
      entries.map(async ([, entry]) => {
        // PTY-backed handles own their termination via `kill()`; pipe-backed
        // ones tree-kill the process tree by pid.
        if (entry?.bg?.kill) {
          await entry.bg.kill();
        } else {
          await killTree(entry?.bg?.pid);
        }
        if (entry?.tempPath) {
          try {
            fs.unlinkSync(entry.tempPath);
          } catch {
            // best-effort
          }
        }
      })
    );
  };

  // Tear down background processes, Appium servers, and Xvfb on Ctrl-C /
  // termination, then exit. Registered here and removed in the `finally` so
  // repeated programmatic runSpecs calls don't accumulate listeners. Without
  // this, an interrupt mid-run leaked Appium and any background process. The
  // handler awaits the tree-kills before exiting so children don't outlive it.
  let signalHandled = false;
  const onSignal = (signal: NodeJS.Signals) => {
    if (signalHandled) return;
    signalHandled = true;
    (async () => {
      await killAllRegistered();
      await Promise.all(
        appiumServers.map((server) => killTree(server.process?.pid))
      );
      for (const xvfb of xvfbProcesses) {
        try {
          xvfb.kill();
        } catch {
          // best-effort
        }
      }
    })().finally(() => process.exit(signal === "SIGINT" ? 130 : 143));
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  // Everything that uses the Appium servers runs inside this try so the
  // shutdown in `finally` always reaches them — otherwise a throw in
  // warmUpContexts (e.g. getAvailableApps failing during the re-detect) would
  // leak the started servers, leaving orphaned processes bound to their ports.
  try {
    // For concurrent runs, resolve missing browser dependencies and warm up
    // each unique driver combination serially *before* the pool. Two contexts
    // can't then race on an on-demand install (which mutates the shared app
    // cache), and a combination that can't start a driver is recorded once here
    // so every parallel context sharing it skips instantly instead of re-paying
    // driverStart's backoff. This pre-populates installAttempts /
    // warmUpResults / runnerDetails.availableApps, so runContext's own gates
    // below collapse to fast cache hits. Sequential runs (limit 1) keep #338's
    // natural first-context-warms-up behavior in runContext — no pre-pass, no
    // extra driver start, byte-identical to before.
    if (limit > 1 && appiumPool) {
      await warmUpContexts({
        jobs: sizingJobs,
        config,
        runnerDetails,
        appiumPool,
        installAttempts,
        warmUpResults,
      });
    }

    // Phase 2: run context jobs through the worker pool, gated into three
    // sequential phases. Config-level `beforeAny` specs all finish before any
    // `main` test starts, and `afterAll` specs run only after every `main` test
    // finishes. Within a phase, jobs still run concurrently up to `limit`.
    // Warm-up / recording-concurrency / Appium-pool sizing above intentionally
    // stay computed over the full `jobs[]`. Untagged jobs (programmatic callers
    // that bypass detection) default to "main". With limit===1 this is identical
    // ordering to a single pool over input-ordered jobs.
    const runJob = async (job: any) => {
      try {
        job.contexts[job.slot] = await runContext({
          config,
          spec: job.spec,
          test: job.test,
          context: job.context,
          runnerDetails,
          appiumPool,
          portToDisplay,
          metaValues,
          installAttempts,
          warmUpResults,
          processRegistry,
          logPrefix:
            limit > 1 ? `[${job.test.testId}/${job.context.contextId}]` : "",
        });
      } catch (error: any) {
        // Error isolation: one crashing context must not abort sibling jobs.
        // Guard against non-Error throws (a thrown string/object has no
        // .message) so the real failure detail survives in logs and report.
        const detail = error?.message ?? String(error);
        log(
          config,
          "error",
          `Context '${job.context.contextId}' crashed: ${detail}`
        );
        job.contexts[job.slot] = {
          contextId: job.context.contextId,
          platform: job.context.platform,
          browser: job.context.browser,
          result: "FAIL",
          resultDescription: `Unexpected error: ${detail}`,
          steps: [],
        };
      }
    };

    const PHASES = ["beforeAny", "main", "afterAll"];
    const jobsByPhase: { [phase: string]: any[] } = {
      beforeAny: [],
      main: [],
      afterAll: [],
    };
    for (const job of jobs) {
      // Constrain to the known set before indexing: a programmatic caller could
      // set `_phase` to a prototype key (e.g. "__proto__" / "toString") where
      // jobsByPhase[phase] is truthy-but-not-an-array and .push would throw.
      const phase = PHASES.includes(job.spec?._phase)
        ? job.spec._phase
        : "main";
      jobsByPhase[phase].push(job);
    }
    // Routed specs are conceptually main-phase work too, so bucket them by the
    // same `_phase` and run each phase's routed specs right after that phase's
    // flat jobs. This keeps #377's ordering guarantee intact under routing: all
    // `beforeAny` work (flat + routed) finishes before any `main` test, and all
    // `afterAll` work runs after every `main` test — a routed main spec can't
    // slip past the teardown. Within a phase, routed specs still run
    // sequentially AFTER the flat jobs (unchanged relative order), reusing the
    // same appiumPool / portToDisplay / metaValues / memo maps inside this same
    // try/finally so teardown always reaches the servers. Each spec's tests run
    // in order with test-level routing evaluated between them; the sequencer
    // only pushes onto the already-registered specReport — it never touches the
    // summary (Phase-3 below remains the sole tally site). With no
    // beforeAny/afterAll specs (the common case) this is identical to running
    // the main flat pool and then every routed spec.
    const routedByPhase: { [phase: string]: typeof routedSpecs } = {
      beforeAny: [],
      main: [],
      afterAll: [],
    };
    for (const entry of routedSpecs) {
      const phase = PHASES.includes(entry.spec?._phase)
        ? entry.spec._phase
        : "main";
      routedByPhase[phase].push(entry);
    }
    // One resource registry per run, shared by every phase's flat pool AND the
    // routed sequencer, so a flat-pool recording and a routed-spec recording
    // never hold the shared "display" at the same time. Only consulted at
    // limit>1 (where jobs were tagged); at limit===1 the pools stay on the
    // byte-identical runConcurrent path.
    const resourceRegistry = createResourceRegistry();
    for (const phase of PHASES) {
      if (limit > 1) {
        await runResourceAware(
          jobsByPhase[phase],
          limit,
          resourceRegistry,
          runJob
        );
      } else {
        await runConcurrent(jobsByPhase[phase], limit, runJob);
      }
      for (const { spec, specReport, specGuardSkip } of routedByPhase[phase]) {
        await runRoutedSpec({
          spec,
          specReport,
          specGuardSkip,
          config,
          runnerDetails,
          appiumPool,
          portToDisplay,
          metaValues,
          installAttempts,
          warmUpResults,
          processRegistry,
          platform,
          markAutoRecord,
          limit,
          resourceRegistry,
          exclusivityCtx,
        });
      }
    }

    // Phase 3: roll results up the tree and count the summary in one
    // deterministic pass after all contexts have finished.
    for (const specReport of report.specs) {
      for (const testReport of specReport.tests) {
        for (const contextReport of testReport.contexts) {
          // Every slot is assigned by the pool callback (even on crash), so
          // this guard should never fire — it documents the invariant and
          // keeps a future gap from surfacing as a cryptic undefined read.
          if (!contextReport) continue;
          for (const stepReport of contextReport.steps) {
            report.summary.steps[stepReport.result.toLowerCase()]++;
          }
          report.summary.contexts[contextReport.result.toLowerCase()]++;
        }
        testReport.result = rollUpResults(testReport.contexts.filter(Boolean));
        report.summary.tests[testReport.result.toLowerCase()]++;
      }
      specReport.result = rollUpResults(specReport.tests);
      report.summary.specs[specReport.result.toLowerCase()]++;
    }
  } finally {
    // Run-end teardown: kill any background processes the run didn't explicitly
    // stop (via closeSurface) so they don't leak. Awaited so the trees are gone
    // before runSpecs returns.
    await killAllRegistered();
    // Close every Appium server we started. Awaited (via killTree) so each
    // server's chromedriver/geckodriver child — and the browser it in turn
    // owns — is actually gone before runSpecs returns. tree-kill is async
    // (shells out to `taskkill /T /F` on Windows); firing it without
    // awaiting let the run finish before the browser was really dead,
    // orphaning it.
    await Promise.all(
      appiumServers.map((server) => {
        log(config, "debug", `Closing Appium server on port ${server.port}`);
        return killTree(server.process?.pid);
      })
    );
    // Tear down any Xvfb virtual displays started for recording.
    for (const xvfb of xvfbProcesses) {
      try {
        xvfb.kill();
      } catch {
        // Process may already be terminated
      }
    }
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
  }

  // Upload changed files back to source integrations (best-effort)
  // This automatically syncs any changed screenshots back to their source CMS
  // Only upload if uploadOnChange is enabled (defaults to true for backward compatibility)
  // Check both global config.uploadOnChange and per-integration uploadOnChange settings
  const herettoConfigs = config?.integrations?.heretto || [];
  const hasUploadEnabledIntegration = herettoConfigs.some(
    (h: any) => h.uploadOnChange !== false // Default to true if not explicitly set to false
  );
  const globalUploadOnChange = config?.uploadOnChange ?? true;
  if (globalUploadOnChange && hasUploadEnabledIntegration && herettoConfigs.length > 0) {
    try {
      const uploadResults = await uploadChangedFiles({ config, report, log });
      report.uploadResults = uploadResults;
    } catch (error: any) {
      log(config, "warning", `Failed to upload changed files: ${error.message}`);
      report.uploadResults = {
        total: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        error: error.message,
      };
    }
  }

  return report;
}

/**
 * Sequencer for a single ROUTED spec (one whose `specIsRouted` is true). Runs
 * the spec's tests in input order, evaluating test-level routing between them.
 *
 * The flat pool can't do this: tests there are flattened into one concurrent
 * context pool with no ordering or between-test decision point. So a routed spec
 * is pulled out and run here, sequentially, reusing the SAME appiumPool /
 * portToDisplay / metaValues / memo maps and the SAME `runContext` (verbatim) —
 * only the per-spec test loop and the routing decision are new.
 *
 * Per test it:
 *   - builds a fresh testReport (appended to specReport.tests so report order
 *     matches input order), then registers the test's metaValues slot;
 *   - runs the SAME per-test/per-context preflight as the flat path (via
 *     prepareTestPreflight + prepareContextSlot) so SKIPPED wordings, contextId
 *     derivation, autoRecord injection, and browser coercion are identical;
 *   - runs the runnable contexts via the same runConcurrent + crash-isolation
 *     shape as the flat pool;
 *   - rolls the contexts up to the test result (rollUpResults — flow != verdict,
 *     never altered by routing) and resolves test-level routing.
 *
 * Test-scope `stop` semantics (what makes the FAIL default byte-identical):
 *   - `stop:test`  -> NO-OP: the test already finished; just continue to the
 *     next test. This is the FAIL default, so a FAILing test with no handler
 *     does NOT stop its siblings — exactly like the flat pool.
 *   - `stop:spec`  -> stop the spec's remaining tests (recorded SKIPPED).
 *   - `stop:run`   -> deferred this phase: warn once per spec and treat as `spec`.
 *
 * goToTest jumps the cursor to the target test within this spec (first-occurrence
 * wins). An unknown target emits a FAIL marker and stops; a runaway cycle is
 * bounded by a per-spec visit cap (also a FAIL marker). A re-run test's report
 * is appended (append-per-visit) with an additive `visit` number. The sequencer
 * NEVER touches the summary — Phase-3 in runSpecs remains the sole tally site;
 * here we only push reports.
 */
async function runRoutedSpec({
  spec,
  specReport,
  specGuardSkip,
  config,
  runnerDetails,
  appiumPool,
  portToDisplay,
  metaValues,
  installAttempts,
  warmUpResults,
  processRegistry,
  platform,
  markAutoRecord,
  limit,
  resourceRegistry,
  exclusivityCtx,
}: {
  spec: any;
  specReport: any;
  specGuardSkip: boolean;
  config: any;
  runnerDetails: any;
  appiumPool:
    | { acquire(): Promise<number>; release(port: number): void }
    | undefined;
  portToDisplay?: Map<number, string>;
  metaValues: any;
  installAttempts: Map<string, "installed" | "failed" | "notInstallable">;
  warmUpResults: Map<string, "ok" | "failed">;
  processRegistry?: Map<string, any>;
  platform: string | undefined;
  markAutoRecord: () => void;
  limit: number;
  resourceRegistry: ReturnType<typeof createResourceRegistry>;
  exclusivityCtx: {
    platform: string;
    xvfbAvailable: boolean;
    allowOverlappingCaptures?: boolean;
    runHasDisplayRecording: boolean;
  };
}): Promise<void> {
  // Set once a `stop:spec` (or deferred `stop:run`) decision halts the spec; the
  // remaining tests are recorded SKIPPED with the stop reason and not executed.
  let stopRest = false;
  // Warn only once per spec if a deferred `stop:run` is encountered.
  let warnedRunStop = false;
  // Map testId -> first index within this spec, for `goToTest` jumps.
  // First-occurrence wins (testIds aren't guaranteed unique within a spec),
  // mirroring the step loop's `indexByStepId`.
  const indexByTestId = new Map<string, number>();
  spec.tests.forEach((t: any, idx: number) => {
    if (t?.testId && !indexByTestId.has(t.testId)) {
      indexByTestId.set(t.testId, idx);
    }
  });
  // Per-spec visit cap: a `goToTest` cycle is bounded so a self-referential jump
  // stops with a FAIL marker instead of hanging. Tests are heavier than steps,
  // so a smaller multiplier than the step-loop cap.
  let totalTestVisits = 0;
  const MAX_TEST_VISITS = spec.tests.length * 100 + 100;
  // Times each test INDEX (cursor position) has been executed, so a test re-run
  // by a backward `goToTest` jump can stamp its visit number. Keyed by index,
  // NOT testId: testIds aren't guaranteed unique within a spec, so two distinct
  // tests sharing an id must not be conflated into a single visit count (only a
  // true re-execution of the same test instance — a jump back to the same index
  // — should be stamped). Additive, like the step-level `visit`.
  const testVisitByIndex = new Map<number, number>();

  let i = 0;
  while (i < spec.tests.length) {
    const test = spec.tests[i];
    // Cycle guard: a runaway goToTest loop stops with a FAIL marker (so it
    // can't silently report green) rather than hanging. Checked before any work.
    // Unlike the unknown-target path (which sets `stopRest` so remaining tests
    // are recorded SKIPPED), the cap `break`s — a runaway cycle is a total
    // abort, so the not-yet-reached tests are simply absent from the report.
    totalTestVisits++;
    if (totalTestVisits > MAX_TEST_VISITS) {
      log(
        config,
        "error",
        `Routing exceeded ${MAX_TEST_VISITS} test executions in spec '${spec.specId}'; stopping (possible goToTest loop).`
      );
      // The marker carries a synthetic FAIL CONTEXT (not just a top-level
      // result): Phase-3 re-derives testReport.result via
      // rollUpResults(contexts), and rollUpResults([]) is SKIPPED — so an
      // empty-contexts marker would be downgraded to SKIPPED. The FAIL context
      // makes the rollup (and the spec verdict) FAIL.
      const capReason = `Routing exceeded the maximum of ${MAX_TEST_VISITS} test executions in this spec (possible goToTest loop).`;
      specReport.tests.push({
        testId: test.testId,
        result: "FAIL",
        resultDescription: capReason,
        contexts: [
          { contextId: "routing", result: "FAIL", resultDescription: capReason, steps: [] },
        ],
      });
      break;
    }
    log(config, "debug", `TEST: ${test.testId}`);
    metaValues.specs[spec.specId].tests[test.testId] ??= { contexts: {} };
    const testReport: any = {
      testId: test.testId,
      description: test.description,
      contentPath: test.contentPath,
      detectSteps: test.detectSteps,
      contexts: new Array(test.contexts.length),
    };
    // Stamp the visit number when a backward goToTest re-ran this test (additive
    // — the first visit omits `visit`, so an unrouted/once-run report is
    // byte-identical, mirroring the step-level `visit`).
    const visitN = (testVisitByIndex.get(i) ?? 0) + 1;
    testVisitByIndex.set(i, visitN);
    if (visitN > 1) testReport.visit = visitN;
    specReport.tests.push(testReport);

    // A prior test stopped the spec: record every context SKIPPED with the
    // routing reason and move on without running anything.
    if (stopRest) {
      // Mirror prepareContextSlot's contextId derivation INCLUDING the
      // collision-suffix loop, so two contexts with the same base ("linux",
      // no browser) don't get duplicate ids. (In practice the sizing pass has
      // already assigned every contextId via prepareContextSlot, so the
      // `if (!context.contextId)` guard rarely fires — but keep it consistent.)
      const usedContextIds = new Set<string>(
        test.contexts.map((c: any) => c.contextId).filter(Boolean)
      );
      test.contexts.forEach((context: any, slot: number) => {
        if (!context.contextId) {
          const base =
            [context.platform, context.browser?.name].filter(Boolean).join("-") ||
            "default";
          let id = base;
          let suffix = 2;
          while (usedContextIds.has(id)) {
            id = `${base}-${suffix++}`;
          }
          usedContextIds.add(id);
          context.contextId = id;
        }
        testReport.contexts[slot] = {
          contextId: context.contextId,
          platform: context.platform,
          browser: context.browser,
          result: "SKIPPED",
          resultDescription:
            "Skipped: a prior test stopped the spec (routing).",
          steps: [],
        };
      });
      i++;
      continue;
    }

    // Same per-test/per-context preflight as the flat path.
    const { testGuardSkip, recordingNameConflict, usedContextIds } =
      await prepareTestPreflight({
        config,
        spec,
        test,
        specGuardSkip,
        platform,
      });

    const contextJobs: any[] = [];
    test.contexts.forEach((context: any, slot: number) => {
      const result = prepareContextSlot({
        config,
        spec,
        test,
        context,
        slot,
        usedContextIds,
        specGuardSkip,
        testGuardSkip,
        recordingNameConflict,
        runnerDetails,
        contexts: testReport.contexts,
        onAutoRecord: markAutoRecord,
      });
      if (result.kind === "skipped") {
        testReport.contexts[slot] = result.contextReport;
      } else {
        contextJobs.push(result.job);
      }
    });

    // Tag the routed contexts with their display resources (recordings, plus
    // every driver context when the run has a recording) so they queue on the
    // SAME run-wide registry as the flat pool — a routed recording never
    // overlaps a flat-pool recording or driver context. Only at limit>1; serial
    // runs ignore the tags.
    if (limit > 1) {
      for (const job of contextJobs)
        job.exclusiveResources = jobDisplayResources(job, exclusivityCtx);
    }

    // Run the runnable contexts with the same crash-isolation shape as the flat
    // pool. runContext is reused verbatim. At limit>1 use the resource-aware
    // pool so display recordings serialize while the rest run in parallel; at
    // limit===1 keep the byte-identical runConcurrent path.
    const runRoutedJob = async (job: any) => {
      try {
        job.contexts[job.slot] = await runContext({
          config,
          spec: job.spec,
          test: job.test,
          context: job.context,
          runnerDetails,
          appiumPool,
          portToDisplay,
          metaValues,
          installAttempts,
          warmUpResults,
          processRegistry,
          logPrefix:
            limit > 1 ? `[${job.test.testId}/${job.context.contextId}]` : "",
        });
      } catch (error: any) {
        const detail = error?.message ?? String(error);
        log(
          config,
          "error",
          `Context '${job.context.contextId}' crashed: ${detail}`
        );
        job.contexts[job.slot] = {
          contextId: job.context.contextId,
          platform: job.context.platform,
          browser: job.context.browser,
          result: "FAIL",
          resultDescription: `Unexpected error: ${detail}`,
          steps: [],
        };
      }
    };
    if (limit > 1) {
      await runResourceAware(
        contextJobs,
        limit,
        resourceRegistry,
        runRoutedJob
      );
    } else {
      await runConcurrent(contextJobs, limit, runRoutedJob);
    }

    // Roll the test up (flow != verdict: this result is final and never altered
    // by routing). Phase-3 re-derives this identical value when tallying; we set
    // it here so test-level routing can read the verdict. Only `$$platform` is
    // meaningful at test scope (tests aren't sequenced relative to each other).
    const testResult = rollUpResults(testReport.contexts.filter(Boolean));
    testReport.result = testResult;
    // Spec-guard skip SUBSUMES routing: a spec whose `if` was false never ran,
    // so its tests are SKIPPED with the spec-guard reason and their onSkip
    // handlers must NOT change flow (no stopRest, no deferred stop:run warning).
    // Only evaluate test-level routing for a reached spec.
    if (!specGuardSkip) {
      const decision = await resolveTestRouting({
        // rollUpResults returns a plain string; resolveTestRouting handles an
        // unknown status defensively (-> continue), so the narrowing cast is safe.
        status: testResult as StepRoutingStatus,
        test,
        context: buildConditionContext({ platform }),
      });

      if (decision.action === "stop") {
        if (decision.scope === "spec") {
          stopRest = true;
        } else if (decision.scope === "run") {
          // DEFER a true run-stop this phase: warn once PER SPEC (the flag is
          // scoped to this runRoutedSpec call) and treat as spec.
          if (!warnedRunStop) {
            log(
              config,
              "warning",
              `Test '${test.testId}': routing requested 'stop: run', which is not yet implemented at test scope — treating it as 'stop: spec' (stopping this spec's remaining tests).`
            );
            warnedRunStop = true;
          }
          stopRest = true;
        }
        // scope === "test": no-op — the test already finished; continue to the
        // next test (this is the FAIL default, byte-identical to the flat path).
      } else if (decision.action === "goToTest") {
        const target = indexByTestId.get(decision.testId);
        if (target === undefined) {
          // Unknown target is a routing misconfiguration (e.g. a typo'd
          // testId). Surface a FAIL marker so it can't silently report green,
          // then stop the spec's remaining tests. (Cross-spec jumps are not
          // supported — targets resolve within this spec only.)
          log(
            config,
            "error",
            `Routing goToTest target '${decision.testId}' not found in spec '${spec.specId}'; stopping.`
          );
          // Synthetic FAIL context so Phase-3's rollUpResults(contexts) yields
          // FAIL (an empty-contexts marker would roll up to SKIPPED).
          const unknownReason = `Routing goToTest target '${decision.testId}' does not exist.`;
          specReport.tests.push({
            testId: decision.testId,
            result: "FAIL",
            resultDescription: unknownReason,
            contexts: [
              { contextId: "routing", result: "FAIL", resultDescription: unknownReason, steps: [] },
            ],
          });
          stopRest = true;
        } else {
          // JUMP: move the cursor to the target test and re-enter the loop
          // without advancing (flow != verdict — no stepExecutionFailed-style
          // state; the visited test's verdict already stands).
          i = target;
          continue;
        }
      }
      // continue (and a stop:test no-op) just advance to the next test.
    }
    i++;
  }
}

/**
 * Pick which contexts warmUpContexts should warm up: one representative per
 * unique platform::browser combination among the driver-required jobs. Applies
 * the same platform default and default-browser resolution runContext uses, so
 * the combination keys it produces match the ones runContext looks up in the
 * pool. Non-driver and browserless contexts are excluded. Mutates
 * context.platform / context.browser in place — idempotent, since runContext
 * applies the identical defaults. Pure (no I/O) so the selection + de-dup +
 * normalization logic is unit-testable without Appium.
 */
function selectWarmUpTargets(
  jobs: any[],
  runnerDetails: any
): Array<{ context: any; combo: string }> {
  const platform = runnerDetails.environment.platform;
  const seen = new Set<string>();
  const targets: Array<{ context: any; combo: string }> = [];
  for (const job of jobs) {
    const context = job.context;
    if (!context.steps) context.steps = [];
    // Default platform to the runner's, matching runContext. Without this a
    // resolved context of `{}` (no runOn — the common case) keys as
    // `undefined::<browser>`, fails the support check, and is skipped — which
    // would defeat the warm-up/install de-racing the pre-pass exists for.
    if (!context.platform) context.platform = platform;
    if (!context.browser && isDriverRequired({ test: context })) {
      context.browser = getDefaultBrowser({ runnerDetails });
    }
    if (!isDriverRequired({ test: context })) continue;
    // No resolvable browser — runContext skips these per-context with its own
    // message; nothing to warm up.
    if (!context.browser?.name) continue;
    const combo = combinationKey(context);
    if (seen.has(combo)) continue;
    seen.add(combo);
    targets.push({ context, combo });
  }
  return targets;
}

/**
 * Serial pre-pass for concurrent runs. For each unique driver combination
 * (platform::browser) among the jobs, resolves a missing browser dependency on
 * demand and then warms up a driver once, recording the outcome. Runs before
 * the worker pool so:
 *   - on-demand installs never race (they mutate the shared app cache), and
 *   - a combination that can't start a driver is recorded once, so every
 *     parallel context sharing it is skipped instantly by runContext's warm-up
 *     gate instead of each re-paying driverStart's retry/backoff.
 * Mirrors the install + driver-start logic in runContext so the memoization
 * state (installAttempts / warmUpResults / runnerDetails.availableApps) is
 * identical to what the first same-combo context would have produced serially.
 */
async function warmUpContexts({
  jobs,
  config,
  runnerDetails,
  appiumPool,
  installAttempts,
  warmUpResults,
}: {
  jobs: any[];
  config: any;
  runnerDetails: any;
  appiumPool: { acquire(): Promise<number>; release(port: number): void };
  installAttempts: Map<string, "installed" | "failed" | "notInstallable">;
  warmUpResults: Map<string, "ok" | "failed">;
}): Promise<void> {
  const platform = runnerDetails.environment.platform;
  // Which unique combinations to warm up (with the same platform/browser
  // normalization runContext applies) is extracted into selectWarmUpTargets so
  // it can be unit-tested without spinning up Appium.
  for (const { context } of selectWarmUpTargets(jobs, runnerDetails)) {
    const combo = combinationKey(context);

    // On-demand install + re-detect (serial), mirroring runContext's gate.
    let supported = isSupportedContext({
      context,
      apps: runnerDetails.availableApps,
      platform,
    });
    if (
      !supported &&
      context.platform === platform &&
      Array.isArray(context?.steps) &&
      requiredBrowserAssets(context.browser?.name).length > 0
    ) {
      const firstAttempt = !installAttempts.has(
        (context.browser?.name ?? "<none>").toLowerCase()
      );
      const outcome = await ensureContextBrowserInstalled({
        browserName: context.browser?.name,
        config,
        installAttempts,
        deps: {
          ensureBrowser: (asset, options) =>
            ensureBrowserInstalled(asset, options),
          log,
        },
        // Repair a present-but-broken driver, not just install-if-missing.
        repair: true,
      });
      if (firstAttempt && (outcome === "installed" || outcome === "failed")) {
        clearAppCache(config);
        runnerDetails.availableApps = await getAvailableApps({ config });
        supported = isSupportedContext({
          context,
          apps: runnerDetails.availableApps,
          platform,
        });
      }
    }
    // Unsupported combinations are left unmarked; runContext skips each with the
    // appropriate per-context reason (install-but-undetected vs unsupported).
    if (!supported) continue;

    // Warm-up probe: start a driver once to prove the combination works.
    // driverStart's own transient retry absorbs concurrent-launch flakiness;
    // a headless fallback (on a throwaway caps object, so the real contexts
    // keep their configured headedness) matches runContext so a headed-only
    // failure on a headless-capable box doesn't poison the combination.
    const port = await appiumPool.acquire();
    let warmDriver: any;
    try {
      const options = {
        width: context.browser?.window?.width || 1200,
        height: context.browser?.window?.height || 800,
        headless: context.browser?.headless !== false,
      };
      try {
        warmDriver = await driverStart(
          getDriverCapabilities({
            runnerDetails,
            name: context.browser.name,
            options,
          }),
          port,
          4,
          { cacheDir: config?.cacheDir }
        );
      } catch {
        log(
          config,
          "warning",
          `Warm-up for ${combo} failed headed; retrying headless.`
        );
        warmDriver = await driverStart(
          getDriverCapabilities({
            runnerDetails,
            name: context.browser.name,
            options: { ...options, headless: true },
          }),
          port,
          4,
          { cacheDir: config?.cacheDir }
        );
      }
      warmUpResults.set(combo, "ok");
      log(config, "debug", `Warm-up succeeded for ${combo}.`);
    } catch (error: any) {
      warmUpResults.set(combo, "failed");
      log(
        config,
        "warning",
        `Warm-up failed for ${combo}; contexts using it will be skipped: ${error?.message ?? String(error)}`
      );
    } finally {
      if (warmDriver) {
        try {
          await warmDriver.deleteSession();
        } catch {
          // best-effort teardown of the warm-up session
        }
      }
      appiumPool.release(port);
    }
  }
}

/**
 * Pure predicate: does this spec carry TEST-level routing? True iff ANY of its
 * tests has a non-empty `onPass`/`onFail`/`onWarning`/`onSkip` array. This is
 * the switch between the runner's two execution paths:
 *   - false (every spec today) -> the unchanged flat concurrent job pool; the
 *     report is byte-identical to the pre-routing runner.
 *   - true -> the sequential `runRoutedSpec` sequencer, which evaluates
 *     test-level routing between tests.
 *
 * Step-level handlers (a step's own on*) and a guard `if` do NOT count — those
 * are orthogonal features handled inside `runContext` and the guard preflight.
 * An empty handler array (`onFail: []`) is "no routing" and stays on the flat
 * path. Defensive against a missing/empty `tests` array.
 */
function specIsRouted(spec: any): boolean {
  if (!spec || !Array.isArray(spec.tests)) return false;
  const keys = ["onPass", "onFail", "onWarning", "onSkip"] as const;
  return spec.tests.some((test: any) =>
    keys.some((key) => Array.isArray(test?.[key]) && test[key].length > 0)
  );
}

/**
 * Per-test preflight shared by both paths: evaluates the test-level guard `if`
 * (only when not already spec-guard-skipped), scans for a recording-name
 * conflict, and builds the `usedContextIds` set for deterministic contextId
 * derivation. A faithful extraction of the original inline per-test block, so
 * the non-routed path stays byte-identical (same warnings, same precedence).
 */
async function prepareTestPreflight({
  config,
  spec,
  test,
  specGuardSkip,
  platform,
}: {
  config: any;
  spec: any;
  test: any;
  specGuardSkip: boolean;
  platform: string | undefined;
}): Promise<{
  testGuardSkip: boolean;
  recordingNameConflict: string | null;
  usedContextIds: Set<string>;
}> {
  // Test-level guard `if`: evaluated once against the host platform, same
  // semantics as the spec-level guard (only `$$platform`/meta meaningful; fails
  // CLOSED). When false, every context of this test is recorded SKIPPED and no
  // job is enqueued. Skipped entirely when the spec guard already skips this
  // spec (a spec-guard skip subsumes all its tests). Fully gated on `test.if`
  // presence: a test with no `if` is byte-identical (no evaluation,
  // `testGuardSkip` stays false).
  let testGuardSkip = false;
  if (!specGuardSkip && test.if) {
    if (guardReferencesSteps(test.if)) {
      log(
        config,
        "warning",
        `Test '${test.testId}': 'if' references '$$steps.*', which is not available at test scope — the guard will always fail closed (the test is always skipped). Use '$$steps.*' only in step-level 'if'.`
      );
    }
    const guardPassed = await evaluateGuard(
      test.if,
      buildConditionContext({ platform })
    );
    testGuardSkip = !guardPassed;
  }
  // Preflight: a `record` step that reuses a recording `name` while one is still
  // active makes a later `stopRecord: "<name>"` ambiguous. Catch it statically
  // and skip the whole test (across all its contexts) with a warning, rather
  // than failing mid-run. Scan every context's authored steps (runOn overrides
  // can differ) and skip if any conflicts. Skip the scan when a guard already
  // skips this test/spec — the test won't run, and the guard skip takes
  // precedence over the conflict skip (so we also suppress the conflict warning
  // for a guarded-out test).
  let recordingNameConflict: string | null = null;
  if (!specGuardSkip && !testGuardSkip) {
    for (const c of test.contexts) {
      const conflict = detectRecordingNameConflict(c?.steps);
      if (conflict) {
        recordingNameConflict = conflict;
        break;
      }
    }
  }
  if (recordingNameConflict) {
    log(
      config,
      "warning",
      `Skipping test '${test.testId}': recording name '${recordingNameConflict}' is reused while a recording with that name is still active. Names must be unique among recordings that overlap in time.`
    );
  }
  // Track contextIds within this test so the deterministic fallback can suffix
  // collisions, mirroring resolveTests' deriveContextId.
  const usedContextIds = new Set<string>(
    test.contexts.map((c: any) => c.contextId).filter(Boolean)
  );
  return { testGuardSkip, recordingNameConflict, usedContextIds };
}

/**
 * The outcome of preparing one context slot: either a SKIPPED contextReport the
 * caller writes into `testReport.contexts[slot]` (no job runs), or a runnable
 * job descriptor the caller either pushes to the flat pool (non-routed) or runs
 * in the sequencer (routed).
 */
type ContextSlotResult =
  | { kind: "skipped"; contextReport: any }
  | { kind: "job"; job: any };

/**
 * Per-context preflight shared by BOTH execution paths (flat pool + routed
 * sequencer). It is a faithful extraction of the original per-context body in
 * runSpecs' Phase-1 loop, so the non-routed path stays byte-identical:
 *   1. Derive a stable `contextId` when unset (deterministic collision suffix).
 *   2. Apply the three skip precedences (spec guard > test guard >
 *      recording-name conflict), returning a SKIPPED contextReport with the
 *      exact same wording as before.
 *   3. Otherwise inject the synthetic autoRecord step (idempotent) and coerce a
 *      record context's browser, then return a runnable job descriptor.
 *
 * Mutates `context` in place (contextId, steps, browser) exactly as the original
 * inline code did — idempotent, so the routed sequencer can call it per visit.
 * `onAutoRecord` is invoked when a synthetic autoRecord step is injected (the
 * caller uses it — via `markAutoRecord` — to set the run-level
 * `autoRecordFlag.injected` used for ffmpeg-overlap sizing).
 */
function prepareContextSlot({
  config,
  spec,
  test,
  context,
  slot,
  usedContextIds,
  specGuardSkip,
  testGuardSkip,
  recordingNameConflict,
  runnerDetails,
  contexts,
  onAutoRecord,
}: {
  config: any;
  spec: any;
  test: any;
  context: any;
  slot: number;
  usedContextIds: Set<string>;
  specGuardSkip: boolean;
  testGuardSkip: boolean;
  recordingNameConflict: string | null;
  runnerDetails: any;
  contexts: any[];
  onAutoRecord: () => void;
}): ContextSlotResult {
  // Derive a stable contextId from platform/browser when unset (the resolver
  // normally assigns one) so the same context keeps the same ID across runs for
  // comparison — `default` when neither is known, with an ordinal suffix on
  // collision. No randomness, so two otherwise-identical runs produce identical
  // reports. Normalized onto the context so runContext's metaValues keys and the
  // report all read the same value.
  if (!context.contextId) {
    const base =
      [context.platform, context.browser?.name].filter(Boolean).join("-") ||
      "default";
    let id = base;
    let suffix = 2;
    while (usedContextIds.has(id)) {
      id = `${base}-${suffix++}`;
    }
    usedContextIds.add(id);
    context.contextId = id;
  }
  // Spec-level guard skip: record a SKIPPED context and don't enqueue a job.
  // Highest precedence — a false spec guard subsumes test guards and the
  // recording-name preflight (no test in the spec runs).
  if (specGuardSkip) {
    return {
      kind: "skipped",
      contextReport: {
        contextId: context.contextId,
        platform: context.platform,
        browser: context.browser,
        result: "SKIPPED",
        resultDescription: "Skipped: spec guard `if` condition not met.",
        steps: [],
      },
    };
  }
  // Test-level guard skip: record a SKIPPED context and don't enqueue a job.
  // Takes precedence over the recording-name preflight (the test is skipped
  // wholesale regardless of its step contents).
  if (testGuardSkip) {
    return {
      kind: "skipped",
      contextReport: {
        contextId: context.contextId,
        platform: context.platform,
        browser: context.browser,
        result: "SKIPPED",
        resultDescription: "Skipped: test guard `if` condition not met.",
        steps: [],
      },
    };
  }
  // Preflight conflict: record a SKIPPED context and don't enqueue a job.
  if (recordingNameConflict) {
    return {
      kind: "skipped",
      contextReport: {
        contextId: context.contextId,
        platform: context.platform,
        browser: context.browser,
        result: "SKIPPED",
        resultDescription: `Skipped — recording name '${recordingNameConflict}' is reused while still active; names must be unique among overlapping recordings.`,
        steps: [],
      },
    };
  }
  // autoRecord: prepend a synthetic full-context ffmpeg recording step (even
  // when the author also has explicit record steps — overlapping is intended).
  // Done before the concurrency calc so the synthetic ffmpeg recording is
  // counted by jobIsFfmpegRecording.
  if (resolveAutoRecord({ config, spec, test })) {
    const autoStep = buildAutoRecordStep({ config, spec, test, context });
    if (autoStep) {
      // Idempotent: strip any prior synthetic step before prepending, so a
      // resolved context that's reused (e.g. runSpecs invoked twice) can't
      // accumulate duplicate autoRecord captures targeting the same file.
      const authored = Array.isArray(context.steps)
        ? context.steps.filter((s: any) => !s?.__autoRecord)
        : [];
      context.steps = [autoStep, ...authored];
      onAutoRecord();
    }
  }
  // Auto-resolution: when a record step has no explicit engine and the user
  // never chose a browser, prefer the concurrency-safe browser engine by
  // coercing to headed Chrome (when available). Done here, before the
  // concurrency calc, so each job's engine is settled. Non-record contexts keep
  // runContext's normal browser defaulting.
  const coercedBrowser = coerceRecordContextBrowser({
    context,
    availableApps: runnerDetails.availableApps,
  });
  if (coercedBrowser) context.browser = coercedBrowser;
  return { kind: "job", job: { spec, test, context, contexts, slot } };
}

// Effective autoScreenshot setting for a test: the test level wins over the
// spec level, which wins over the global config. Levels left unset defer
// down the chain.
function resolveAutoScreenshot({
  config,
  spec,
  test,
}: {
  config: any;
  spec: any;
  test: any;
}): boolean {
  return Boolean(
    test?.autoScreenshot ?? spec?.autoScreenshot ?? config?.autoScreenshot
  );
}

/**
 * Resolve the `onSkip` routing decision for a REACHED-but-skipped step
 * (unsafe-blocked or guard-`if`-false). Default onSkip is continue, so an
 * unrouted step resolves to `{ action: "continue" }` — keeping today's behavior.
 * The selector context has no own `$$outputs.*` (the step didn't run) but can
 * read prior steps via `$$steps.<id>.outputs.*`.
 *
 * `stop` and `goToStep` are the meaningful decisions for a skipped step; the
 * caller applies them. `continue` is the no-op default, and `retry` is
 * meaningless for a step that never ran (there is nothing to re-run) — both
 * leave execution flowing. (An in-runner SKIPPED *result* from a step that DID
 * run — e.g. a no-op action — goes through the normal retry loop, where its
 * onSkip `retry` would re-run it.) `skipRetry` is passed so a `retry` entry is
 * treated as a non-match and a later `goToStep`/`stop` entry can apply.
 */
async function resolveStepSkipRouting(
  step: any,
  platform: string | undefined,
  stepOutputsById: Record<string, any>
): Promise<RoutingDecision> {
  return await resolveStepRouting({
    status: "SKIPPED",
    step,
    context: buildConditionContext({ platform, steps: stepOutputsById }),
    skipRetry: true,
  });
}

// Effective autoRecord setting for a test: same precedence as autoScreenshot
// (test > spec > config; unset levels defer down the chain).
function resolveAutoRecord({
  config,
  spec,
  test,
}: {
  config: any;
  spec: any;
  test: any;
}): boolean {
  return Boolean(test?.autoRecord ?? spec?.autoRecord ?? config?.autoRecord);
}

// Build the synthetic full-context recording step for an autoRecord run, or
// null when the context shouldn't be recorded (no driver-required authored
// steps). Always uses the ffmpeg engine, and a deterministic path under the
// run's artifact folder following the REST resource tree
// (specs/<specId>/tests/<testId>/contexts/<contextId>/recordings/<contextId>.mp4)
// so the same context lands on the same relative path every run for comparison.
// The `__autoRecord` marker tags the started handle as synthetic so an
// untargeted user `stopRecord` won't end it (only end-of-context cleanup does).
function buildAutoRecordStep({
  config,
  spec,
  test,
  context,
}: {
  config: any;
  spec: any;
  test: any;
  context: any;
}): any | null {
  if (!isDriverRequired({ test: context })) return null;
  // Compute the path only — runSpecs reserves the run folder up front when
  // runArchivesArtifacts is true (autoRecord counts), so creating it here would
  // be redundant. (startRecording also mkdirs the recording's target dir up
  // front, so an enabled autoRecord run reserves the folder regardless — same as
  // autoScreenshot.)
  const runDir = getRunOutputDir(config, { create: false });
  const contextSegment = capPathSegment(
    sanitizeFilesystemName(String(context.contextId ?? ""), "context")
  );
  const recordPath = path.join(
    runDir,
    "specs",
    capPathSegment(sanitizeFilesystemName(String(spec.specId ?? ""), "spec")),
    "tests",
    capPathSegment(sanitizeFilesystemName(String(test.testId ?? ""), "test")),
    "contexts",
    contextSegment,
    "recordings",
    `${contextSegment}.mp4`
  );
  return {
    record: { path: recordPath, overwrite: "true", engine: "ffmpeg" },
    description: "Automatic full-context recording",
    stepId: `${sanitizeFilesystemName(String(test.testId ?? ""), "test")}~autorecord`,
    // Internal marker — the runStep record dispatch flags the started handle as
    // synthetic so it survives untargeted stopRecord and is swept by cleanup.
    __autoRecord: true,
  };
}

// Directory/file segments built from IDs are capped so deeply nested doc
// trees can't push the full path past Windows' MAX_PATH. The default cap is
// 32: the REST artifact tree nests several id segments
// (specs/<id>/tests/<id>/contexts/<id>/…), so a larger default could exceed
// MAX_PATH on Windows.
//
// Plain tail truncation alone is unsafe: two distinct ids that share the same
// trailing `max` characters (e.g. mirror directory trees that differ only in a
// long prefix) would collapse into the same path segment, so one context's
// screenshots/recording could overwrite another's and the reported relative
// path would resolve to the wrong artifact. When a segment exceeds the cap,
// prepend a short deterministic hash of the *full* segment so distinct ids stay
// distinct, and keep the trailing chars (where generated ids carry their
// content hash) for human correlation. Deterministic — the same id maps to the
// same segment every run, preserving run-over-run comparison.
function capPathSegment(segment: string, max: number = 32): string {
  if (segment.length <= max) return segment;
  const hash = createHash("sha1").update(segment).digest("hex").slice(0, 8);
  const tail = segment.slice(segment.length - (max - hash.length - 1));
  return `${hash}-${tail}`;
}

// Capture a post-step screenshot for `autoScreenshot` runs. The relative
// path follows the REST resource tree — stable IDs (spec/test/context) as
// nested collections plus the step's order, action, and ID (e.g.
// specs/docs_guide.md/tests/docs_guide.md~3f9a2c1b/contexts/windows-chrome/
// screenshots/01-goTo-s4f2a91c.png), so the same step lands on the same
// relative path inside every run's folder — that's what makes run-over-run
// image comparison possible. Failures are logged as warnings, never thrown: a
// missed capture must not fail the step it documents.
async function captureAutoScreenshot({
  config,
  driver,
  spec,
  test,
  context,
  step,
  stepIndex,
  stepCount,
}: {
  config: any;
  driver: any;
  spec: any;
  test: any;
  context: any;
  step: any;
  stepIndex: number;
  stepCount: number;
}): Promise<string | null> {
  try {
    const action =
      driverActions.find((key) => typeof step[key] !== "undefined") || "step";
    const sanitizedTestId = sanitizeFilesystemName(
      String(test.testId ?? ""),
      "test"
    );
    const runDir = getRunOutputDir(config);
    const dir = path.join(
      runDir,
      "specs",
      capPathSegment(sanitizeFilesystemName(String(spec.specId ?? ""), "spec")),
      "tests",
      capPathSegment(sanitizedTestId),
      "contexts",
      capPathSegment(
        sanitizeFilesystemName(String(context.contextId ?? ""), "context")
      ),
      "screenshots"
    );
    // The stepId usually embeds the testId (its parent folder) — strip that
    // prefix so filenames stay short while still carrying the step's ID.
    const stepIdString = sanitizeFilesystemName(
      String(step.stepId ?? ""),
      "step"
    );
    const stepRef = capPathSegment(
      stepIdString.startsWith(`${sanitizedTestId}~`)
        ? stepIdString.slice(sanitizedTestId.length + 1)
        : stepIdString
    );
    // Zero-pad the step ordinal to the width of the context's step count
    // (min 2), so file listings sort naturally even past 99 steps (100 would
    // otherwise sort before 11).
    const pad = Math.max(2, String(stepCount).length);
    const fileName = `${String(stepIndex + 1).padStart(pad, "0")}-${action}-${stepRef}.png`;
    const screenshotStep = {
      stepId: `${step.stepId}_auto`,
      description: "Automatic post-step screenshot",
      screenshot: {
        path: path.join(dir, fileName),
        overwrite: "true",
      },
    };
    const captureResult = await saveScreenshot({
      config,
      step: screenshotStep,
      driver,
    });
    if (captureResult.status !== "PASS") {
      log(
        config,
        "warning",
        `Auto screenshot failed after step ${step.stepId}: ${captureResult.description}`
      );
      return null;
    }
    // Report the path relative to the run folder (normalized to forward
    // slashes) so the same step produces an identical report value in every
    // run — absolute, timestamped paths would defeat run-over-run diffing.
    // Consumers resolve it against the report's `runDir`.
    return path
      .relative(runDir, screenshotStep.screenshot.path)
      .split(path.sep)
      .join("/");
  } catch (error: any) {
    log(
      config,
      "warning",
      `Auto screenshot failed after step ${step.stepId}: ${
        error?.message ?? error
      }`
    );
    return null;
  }
}

/**
 * Runs a single resolved context to completion and returns its finished
 * contextReport (steps array + rolled-up result). Never touches the shared
 * report or summary counters — the caller owns aggregation, which keeps this
 * function safe to run concurrently with sibling contexts.
 */
async function runContext({
  config,
  spec,
  test,
  context,
  runnerDetails,
  appiumPool,
  portToDisplay,
  metaValues,
  installAttempts,
  warmUpResults,
  processRegistry,
  logPrefix = "",
}: {
  config: any;
  spec: any;
  test: any;
  context: any;
  runnerDetails: any;
  appiumPool:
    | { acquire(): Promise<number>; release(port: number): void }
    | undefined;
  portToDisplay?: Map<number, string>;
  metaValues: any;
  installAttempts: Map<string, "installed" | "failed" | "notInstallable">;
  warmUpResults: Map<string, "ok" | "failed">;
  processRegistry?: Map<string, any>;
  logPrefix?: string;
}): Promise<any> {
  const platform = runnerDetails.environment.platform;
  // `let`, not `const`: an on-demand browser install below re-detects available
  // apps and reassigns this snapshot.
  let availableApps = runnerDetails.availableApps;
  // Context-scoped log: prefixed only when contexts run concurrently, so
  // sequential output stays unchanged.
  const clog = (level: string, message: any) =>
    log(
      config,
      level,
      logPrefix && typeof message === "string"
        ? `${logPrefix} ${message}`
        : message
    );

  // Ensure context contains a 'steps' property before anything walks it —
  // isDriverRequired iterates context.steps and the resolved shape doesn't
  // guarantee the field.
  if (!context.steps) {
    context.steps = [];
  }

  // If "platform" is not defined, set it to the current platform
  if (!context.platform)
    context.platform = runnerDetails.environment.platform;

  // Attach OpenAPI definitions to context
  if (config.integrations?.openApi) {
    context.openApi = [
      ...(context.openApi || []),
      ...config.integrations.openApi,
    ];
  }

  // If "browser" isn't defined but is required by the test, set it to the first available browser in the sequence of Firefox, Chrome, Safari
  if (!context.browser && isDriverRequired({ test: context })) {
    context.browser = getDefaultBrowser({ runnerDetails });
  }

  // Set context report
  const contextReport: any = {
    contextId: context.contextId,
    platform: context.platform,
    browser: context.browser,
    steps: [],
  };
  // Set meta values (create-if-missing — ids aren't guaranteed unique)
  metaValues.specs[spec.specId].tests[test.testId].contexts[
    context.contextId
  ] ??= { steps: {} };

  // If a driver is required but no browser could be resolved (e.g.
  // getDefaultBrowser found nothing installed, or the context supplied a
  // browser object with no name), skip with an explicit reason instead of
  // letting it fail later as "Failed to start context 'undefined'".
  if (isDriverRequired({ test: context }) && !context.browser?.name) {
    const errorMessage = `Skipping context on '${context.platform}': no supported browser is available in the current environment.`;
    clog("warning", errorMessage);
    contextReport.result = "SKIPPED";
    contextReport.resultDescription = errorMessage;
    return contextReport;
  }

  // Check if current environment supports given contexts
  let supportedContext = isSupportedContext({
    context: context,
    apps: availableApps,
    platform: platform,
  });

  // If the context needs a browser that isn't available yet, try to resolve
  // the missing dependency on demand before giving up — e.g. Firefox declared
  // but geckodriver absent because the pre-flight was skipped or its install
  // failed. Memoized per browser (installAttempts) so a failed/no-op install
  // isn't retried for every later context. The install + re-detect mutate the
  // shared runnerDetails.availableApps; under concurrency that's racy, but it
  // only fires for a genuinely-missing browser (rare) and the app list only
  // grows, so a sibling reading a slightly stale snapshot still re-detects.
  let freshInstallRedetected = false;
  // The actual on-demand outcome, so the skip message can distinguish "repaired
  // but still undetected" from "repair failed" instead of always claiming the
  // dependency was installed.
  let freshInstallOutcome: "installed" | "failed" | undefined;
  if (
    !supportedContext &&
    context.platform === platform &&
    // Mirror isSupportedContext's own guard: isDriverRequired iterates
    // context.steps, so a malformed context without a steps array would
    // otherwise crash here instead of skipping cleanly.
    Array.isArray(context?.steps) &&
    isDriverRequired({ test: context }) &&
    requiredBrowserAssets(context.browser?.name).length > 0
  ) {
    // Whether this browser was already attempted earlier this run; a cached
    // outcome installed nothing new, so there's no point paying for a re-detect.
    const firstAttempt = !installAttempts.has(
      (context.browser?.name ?? "<none>").toLowerCase()
    );
    const outcome = await ensureContextBrowserInstalled({
      browserName: context.browser?.name,
      config,
      installAttempts,
      deps: {
        ensureBrowser: (asset, options) =>
          ensureBrowserInstalled(asset, options),
        log,
      },
      // The browser is unavailable here — possibly because its driver is
      // present-but-broken — so repair (force a clean driver reinstall +
      // re-validation), not just install-if-missing.
      repair: true,
    });
    // Re-detect after a real attempt regardless of outcome: a "failed" install
    // can still have materialized assets before it threw, so a stale snapshot
    // could wrongly skip a now-usable browser.
    if (firstAttempt && (outcome === "installed" || outcome === "failed")) {
      freshInstallRedetected = true;
      freshInstallOutcome = outcome;
      clearAppCache(config);
      availableApps = await getAvailableApps({ config });
      runnerDetails.availableApps = availableApps;
      supportedContext = isSupportedContext({
        context: context,
        apps: availableApps,
        platform: platform,
      });
    }
  }

  // Resolve which engine(s) this context can actually run on. Platform is an
  // absolute gate (a context authored for another OS never runs and never
  // falls back); engine availability is not — a broken or unavailable browser
  // falls back to any other available engine when the `browserFallback` policy
  // permits. `supportedContext` (computed above for the requested browser) is
  // now just one input: even when it's false, a fallback engine may carry the run.
  const platformMatches = context.platform === platform;
  const requestedBrowserName = context.browser?.name;
  const explicitlyRequested = context.browser?.explicit === true;
  // Context-level browserFallback (authored on the runOn entry) overrides the
  // config-level policy; config defaults to "auto".
  const fallbackPolicy = resolveBrowserFallbackPolicy({ context, config });
  const driverRequired = isDriverRequired({ test: context });

  const candidateEngines =
    platformMatches && driverRequired
      ? buildFallbackCandidates({
          requestedName: requestedBrowserName,
          explicit: explicitlyRequested,
          policy: fallbackPolicy,
          availableApps,
        })
      : [];

  // A driver context with no startable engine is skipped with a diagnostic that
  // names the requested engine and the partial-download cause.
  if (driverRequired && candidateEngines.length === 0) {
    const errorMessage = freshInstallRedetected
      ? freshInstallOutcome === "installed"
        ? `Skipping context '${requestedBrowserName}' on '${context.platform}': the missing browser dependency was installed but still could not be detected.`
        : `Skipping context '${requestedBrowserName}' on '${context.platform}': the on-demand install/repair of its browser dependency failed.`
      : driverSkipDiagnostic({
          requestedName: requestedBrowserName ?? "<none>",
          // driverSkipDiagnostic treats `platform` as the *current* runner
          // platform (as in the !startedName path), so pass that — not the
          // context's target platform — or the mismatch message mislabels it.
          platform,
          platformMatches,
          attemptedFallback: false,
        });
    clog(platformMatches ? "warning" : "info", errorMessage);
    contextReport.result = "SKIPPED";
    contextReport.resultDescription = errorMessage;
    return contextReport;
  }
  // A non-driver context that targets a different platform has nothing to run.
  if (!driverRequired && !platformMatches) {
    const errorMessage = `Skipping context. The current system doesn't support this context: {"platform": "${
      context.platform
    }", "apps": ${JSON.stringify(context.apps)}}`;
    clog("info", errorMessage);
    contextReport.result = "SKIPPED";
    contextReport.resultDescription = errorMessage;
    return contextReport;
  }
  clog("debug", `CONTEXT:\n${JSON.stringify(context, null, 2)}`);

  let driver: any;
  let appiumPort: number | undefined;
  // Layer 5 bookkeeping: set when the context ran on a different engine than
  // requested, so the final result can be annotated — and downgraded PASS →
  // WARNING when an explicitly pinned engine was substituted.
  let fellBackNote = "";
  let fellBackPinned = false;
  if (driverRequired && !appiumPool) {
    throw new Error(
      "Driver requested but no Appium server pool was created; " +
        "driverJobCount and isDriverRequired(context) disagreed; this is a bug."
    );
  }

  try {
    if (driverRequired) {
      // Check out a server for this context's lifetime — released in the
      // finally so the next queued context can reuse it.
      appiumPort = await appiumPool!.acquire();
      // If this server runs on a dedicated Xvfb display, record it on the
      // context so the ffmpeg recorder captures the same display the browser
      // renders on.
      if (portToDisplay) {
        const display = portToDisplay.get(appiumPort);
        if (display) {
          context.__display = display;
          // The Xvfb displays are created at a known fixed size; record it so
          // x11grab captures the full display (its default grabs only 640x480).
          context.__displaySize = XVFB_SCREEN_SIZE;
        }
      }

      // Per-context recording identifiers so concurrent Chrome recordings
      // auto-select their own window and download to their own dir.
      const recordOptions = {
        captureSourceTitle: browserCaptureTitle(context.contextId),
        downloadDir: browserDownloadDir(context.contextId),
      };

      // Start a session for one engine, headed first then (on failure) headless.
      const startDriverForBrowser = async (
        browserName: string
      ): Promise<
        | { ok: true; driver: any; headless: boolean }
        | { ok: false; error: string }
      > => {
        const wantHeadless = context.browser?.headless !== false;
        const buildCaps = (headless: boolean) =>
          getDriverCapabilities({
            runnerDetails,
            name: browserName,
            options: {
              width: context.browser?.window?.width || 1200,
              height: context.browser?.window?.height || 800,
              headless,
              ...recordOptions,
            },
          });
        const startFailure = () => {
          let error = `Failed to start context '${browserName}' on '${platform}'.`;
          if (browserName === "safari" || browserName === "webkit") {
            error +=
              " Make sure you've run `safaridriver --enable` in a terminal and enabled 'Allow Remote Automation' in Safari's Develop menu.";
          }
          return { ok: false as const, error };
        };
        try {
          const d = await driverStart(buildCaps(wantHeadless), appiumPort!, 4, {
            cacheDir: config?.cacheDir,
          });
          return { ok: true, driver: d, headless: wantHeadless };
        } catch {
          // The headed→headless retry only changes inputs when the first
          // attempt was headed. If it was already headless, a second identical
          // attempt would just pay driverStart's backoff again — fail fast.
          if (wantHeadless) return startFailure();
          try {
            clog(
              "warning",
              `Failed to start context '${browserName}' on '${platform}'. Retrying as headless.`
            );
            const d = await driverStart(buildCaps(true), appiumPort!, 4, {
              cacheDir: config?.cacheDir,
            });
            return { ok: true, driver: d, headless: true };
          } catch {
            return startFailure();
          }
        }
      };

      // Try the requested engine first, then fall back across every other
      // available engine (policy permitting). The warm-up memo lets a known-bad
      // combination be skipped without paying driverStart's backoff again.
      let startedName: string | undefined;
      let startedHeadless = false;
      let lastError = "";
      for (const candidateName of candidateEngines) {
        const candidateCombo = combinationKey({
          platform: context.platform,
          browser: { name: candidateName },
        });
        if (warmUpDecision(warmUpResults.get(candidateCombo)) === "skip") {
          lastError = `context combination '${candidateName}' on '${platform}' could not start a driver earlier in this run.`;
          continue;
        }
        let res = await startDriverForBrowser(candidateName);
        // The requested engine's session failed — its driver may be present but
        // broken (e.g. a partial download Layer 2 couldn't pre-validate). Repair
        // it once and retry before falling back to a different browser, so we
        // don't substitute engines unnecessarily.
        if (
          !res.ok &&
          shouldRepairBeforeFallback({
            candidateName,
            requestedName: requestedBrowserName,
            installAttempts,
          })
        ) {
          const outcome = await ensureContextBrowserInstalled({
            browserName: candidateName,
            config,
            installAttempts,
            deps: {
              ensureBrowser: (asset, options) =>
                ensureBrowserInstalled(asset, options),
              log,
            },
            repair: true,
          });
          if (outcome === "installed") {
            clog(
              "info",
              `Repaired '${candidateName}' driver after a start failure; retrying before falling back.`
            );
            res = await startDriverForBrowser(candidateName);
          }
        }
        if (res.ok) {
          driver = res.driver;
          startedName = candidateName;
          startedHeadless = res.headless;
          if (!warmUpResults.has(candidateCombo))
            warmUpResults.set(candidateCombo, "ok");
          break;
        }
        clog("error", res.error);
        // Record the combination as failed so every later context that shares
        // it is skipped instantly (see the warm-up check above).
        if (!warmUpResults.has(candidateCombo))
          warmUpResults.set(candidateCombo, "failed");
        lastError = res.error;
      }

      if (!startedName) {
        const errorMessage = driverSkipDiagnostic({
          requestedName: requestedBrowserName ?? "<none>",
          platform,
          platformMatches: true,
          attemptedFallback: candidateEngines.length > 1,
          lastError,
        });
        clog("error", errorMessage);
        contextReport.result = "SKIPPED";
        contextReport.resultDescription = errorMessage;
        return contextReport;
      }

      // Reflect a headless fallback on the context so downstream logic and the
      // report agree with what actually launched. Replacing context.browser
      // makes a new object, so re-point contextReport.browser (set earlier to
      // the original) at it or the report keeps stale headless metadata.
      if (startedHeadless) {
        context.browser = { ...context.browser, headless: true };
        contextReport.browser = context.browser;
      }
      // Cross-engine fallback: re-point the context at the engine that ran so
      // recording, capabilities, and the report all reflect reality, and stash
      // the Layer 5 note applied to the context result below.
      if (
        normalizeBrowserName(startedName) !==
        normalizeBrowserName(requestedBrowserName)
      ) {
        fellBackNote = `${requestedBrowserName} unavailable; ran on ${startedName}.`;
        fellBackPinned = explicitlyRequested;
        context.browser = { ...context.browser, name: startedName };
        contextReport.browser = context.browser;
        contextReport.fallback = {
          requested: requestedBrowserName,
          used: startedName,
        };
        clog("warning", fellBackNote);
      }

      if (
        context.browser?.viewport?.width ||
        context.browser?.viewport?.height
      ) {
        // Set driver viewport size
        await setViewportSize(context, driver);
      } else if (
        context.browser?.window?.width ||
        context.browser?.window?.height
      ) {
        // Get driver window size
        const windowSize = await driver.getWindowSize();
        // Resize window if necessary
        await driver.setWindowSize(
          context.browser?.window?.width || windowSize.width,
          context.browser?.window?.height || windowSize.height
        );
      }
    }

    // Effective autoScreenshot for this context (test > spec > config).
    const autoScreenshotEnabled = resolveAutoScreenshot({ config, spec, test });

    // Iterates steps
    let stepExecutionFailed = false;
    // The reason recorded on steps skipped after execution stopped. Defaults to
    // the failure wording (the only way execution stopped before routing); a
    // non-failure routing `stop` (e.g. onPass/onSkip stop) overwrites it with an
    // accurate message so a passing step's stop isn't mislabeled as a failure.
    let stopReason = "Skipped due to previous failure in context.";
    const usedStepIds = new Set(
      context.steps.map((s: any) => s.stepId).filter(Boolean)
    );
    // Pre-assign stepIds for every step BEFORE the loop. `goToStep` routing
    // needs a stepId -> index map up front so a jump can target a not-yet-run
    // step. Safe because the same derivation + order-preserving de-dup is used
    // as the (previous) in-loop assignment, and `contentHash` excludes `stepId`
    // (stepId is in detectTests' HASH_EXCLUDED_KEYS) — so existing specs get
    // byte-identical ids. Derived from the test ID and a hash of the step's
    // authored definition so the same step keeps the same ID (and any
    // `screenshot: true` default filename) across runs. Sanitized because the
    // ID doubles as a screenshot filename; identical steps in one test get an
    // ordinal suffix.
    for (const step of context.steps as any[]) {
      if (!step.stepId) {
        const baseId = sanitizeFilesystemName(
          `${test.testId}~s${contentHash(step)}`,
          `step-${randomUUID()}`
        );
        let stepId = baseId;
        let suffix = 2;
        while (usedStepIds.has(stepId)) {
          stepId = `${baseId}-${suffix++}`;
        }
        step.stepId = stepId;
      }
      usedStepIds.add(step.stepId);
    }
    // Map each stepId to its index for `goToStep` jumps (first occurrence wins,
    // so a duplicated stepId routes to the earliest one).
    const indexByStepId = new Map<string, number>();
    context.steps.forEach((s: any, idx: number) => {
      if (s.stepId && !indexByStepId.has(s.stepId)) {
        indexByStepId.set(s.stepId, idx);
      }
    });
    // Tracks how many times each stepId's report has been produced, so a step
    // re-run by a backward `goToStep` jump can record its visit number.
    const visitCountById = new Map<string, number>();
    // Push a step report, stamping `visit` (1-based count of times this stepId
    // has been recorded) once a goToStep loop produces more than one. Additive:
    // a single-visit report omits `visit` and stays byte-identical (mirrors
    // `attempts`). Used for EVERY step-report push in the loop — ran, skipped,
    // and routing-error markers — so re-visited steps are stamped consistently.
    const pushStepReport = (rep: any) => {
      if (rep.stepId) {
        const n = (visitCountById.get(rep.stepId) ?? 0) + 1;
        visitCountById.set(rep.stepId, n);
        if (n > 1) rep.visit = n;
      }
      // The internal cleanup marker (`_fromAfter`) is non-enumerable, so a
      // `{...step}` report spread already drops it; delete defensively here so
      // it can never leak into a report through any push site.
      delete rep._fromAfter;
      contextReport.steps.push(rep);
    };
    // Per-step outputs accumulator: maps each completed step's stepId to its
    // computed `outputs` bag, so later steps' guard `if` conditions can read a
    // prior step's outputs via `$$steps.<stepId>.outputs.*`. Additive
    // bookkeeping local to this context — it does not change any existing path.
    const stepOutputsById: Record<string, any> = {};
    // Apply an onSkip routing decision for a reached-but-skipped step (unsafe or
    // guard-`if` false). Returns true when it JUMPED (goToStep moved the cursor)
    // so the caller `continue`s without `i++`; returns false otherwise (the
    // caller advances normally). `stop` and an unknown-target `goToStep` both
    // fail-safe to stopping execution.
    const applySkipRouting = (decision: RoutingDecision): boolean => {
      if (decision.action === "stop") {
        stepExecutionFailed = true;
        stopReason =
          "Skipped because a prior step stopped execution (routing).";
        return false;
      }
      if (decision.action === "goToStep") {
        const target = indexByStepId.get(decision.stepId);
        if (target === undefined) {
          clog(
            "error",
            `Routing goToStep target '${decision.stepId}' not found in this test; stopping.`
          );
          // An unknown target is a routing misconfiguration. Push a FAIL marker
          // so the verdict reflects the broken routing — mirrors the run-path.
          pushStepReport({
            result: "FAIL",
            resultDescription: `Routing goToStep target '${decision.stepId}' does not exist.`,
          });
          stepExecutionFailed = true;
          stopReason = `Skipped because routing goToStep target '${decision.stepId}' does not exist.`;
          return false;
        }
        i = target; // JUMP (no stepExecutionFailed — flow != verdict)
        return true;
      }
      // continue / retry (no-op for a never-run step): advance normally.
      return false;
    };
    // Indexed loop (not for…of) so `goToStep` routing can move the cursor.
    // `totalVisits` + `MAX_TOTAL_VISITS` is a fail-safe against a goToStep loop:
    // linear execution can never reach the cap, but a backward jump that never
    // makes progress would, and we stop rather than hang.
    let i = 0;
    let totalVisits = 0;
    const MAX_TOTAL_VISITS = context.steps.length * 1000 + 1000;
    while (i < context.steps.length) {
      const stepIndex = i; // keep this name (autoScreenshot reads it)
      const step = context.steps[i];

      totalVisits++;
      if (totalVisits > MAX_TOTAL_VISITS) {
        clog(
          "error",
          `Routing exceeded ${MAX_TOTAL_VISITS} step executions in this context; stopping (possible goToStep loop).`
        );
        // Surface the runaway as a FAIL so the verdict reflects the abnormal
        // termination — a force-terminated goToStep cycle must not report green.
        pushStepReport({
          result: "FAIL",
          resultDescription: `Routing exceeded the maximum of ${MAX_TOTAL_VISITS} step executions in this context (possible goToStep loop).`,
        });
        stepExecutionFailed = true;
        break;
      }

      clog("debug", `STEP:\n${JSON.stringify(step, null, 2)}`);

      if (step.unsafe && runnerDetails.allowUnsafeSteps === false) {
        clog(
          "warning",
          `Skipping unsafe step: ${step.description} in test ${test.testId} context ${context.contextId}`
        );
        // Mark as skipped
        const stepReport = {
          ...step,
          result: "SKIPPED",
          resultDescription: "Skipped because unsafe steps aren't allowed.",
        };
        pushStepReport(stepReport);
        // onSkip fires only for a REACHED step. The unsafe check precedes the
        // `stepExecutionFailed` gate below, so an unsafe step DOWNSTREAM of a
        // prior stop reaches here too — but it is not reached, so its onSkip
        // must NOT fire (the `!stepExecutionFailed` guard). For a genuinely
        // reached unsafe-skip, onSkip runs (default continue; `stop` halts the
        // test; `goToStep` jumps). The unsafe gate also precedes the cleanup
        // (`_fromAfter`) exception below, so an unsafe cleanup step is still
        // skipped — the safety gate wins over the hard-route.
        if (!stepExecutionFailed) {
          const decision = await resolveStepSkipRouting(
            step,
            context.platform,
            stepOutputsById
          );
          const jumped = applySkipRouting(decision);
          if (jumped) continue; // goToStep moved the cursor — don't i++
        }
        i++;
        continue;
      }

      // Skip remaining steps once execution has stopped (downstream of a prior
      // failure or a routing `stop`). These steps are NOT reached, so no routing
      // fires for them, and the reason reflects why execution stopped.
      // EXCEPTION: cleanup (`_fromAfter`) steps are hard-routed — they run after
      // the test no matter what stopped execution, so they're not skipped here.
      if (stepExecutionFailed && !step._fromAfter) {
        const stepReport = {
          ...step,
          result: "SKIPPED",
          resultDescription: stopReason,
        };
        pushStepReport(stepReport);
        i++;
        continue;
      }

      // Step-level guard `if`: evaluated BEFORE the action runs. The guard sees
      // `$$platform` and prior steps' outputs via `$$steps.<stepId>.outputs.*`
      // (the current step's own `$$outputs.*` is NOT available — it hasn't run
      // yet). `if` is `string | string[]` (array = AND, all must be truthy) and
      // fails CLOSED (an unresolvable `$$` -> false). When the guard is not all
      // true the step is SKIPPED: the action is NOT run, and this does NOT trip
      // `stepExecutionFailed`, so later steps still run.
      if (step.if) {
        const guardContext = buildConditionContext({
          platform: context.platform,
          steps: stepOutputsById,
        });
        const guardPassed = await evaluateGuard(step.if, guardContext);
        if (!guardPassed) {
          const stepReport = {
            ...step,
            result: "SKIPPED",
            resultDescription: "Skipped: guard `if` condition not met.",
          };
          pushStepReport(stepReport);
          // Reached-but-skipped: the onSkip handler fires (default continue;
          // `stop` halts; `goToStep` jumps). This branch is already past the
          // `stepExecutionFailed` gate above, so it is unreachable when stopped;
          // the `!stepExecutionFailed` guard keeps the "not reached -> no
          // routing" invariant explicit and robust if the branch order ever
          // changes.
          if (!stepExecutionFailed) {
            const decision = await resolveStepSkipRouting(
              step,
              context.platform,
              stepOutputsById
            );
            const jumped = applySkipRouting(decision);
            if (jumped) continue; // goToStep moved the cursor — don't i++
          }
          i++;
          continue;
        }
      }

      // Set meta values
      metaValues.specs[spec.specId].tests[test.testId].contexts[
        context.contextId
      ].steps[step.stepId] = {};

      // Run the step once: execute it, normalize the result, and build the
      // step report. Used by the initial run and each retry attempt.
      const runStepOnce = async () => {
        const r = await runStep({
          config: config,
          context: context,
          step: step,
          driver: driver,
          metaValues: metaValues,
          options: {
            openApiDefinitions: context.openApi || [],
          },
          processRegistry: processRegistry,
        });
        clog(
          "debug",
          `RESULT: ${r.status}\n${JSON.stringify(r, null, 2)}`
        );
        r.result = r.status;
        r.resultDescription = r.description;
        delete r.status;
        delete r.description;
        return { ...step, ...r } as any;
      };

      // Run the step, then resolve routing. A `retry` decision re-runs the step
      // (up to `limit` retries — so `limit + 1` total runs — waiting `delay`
      // with `fixed`/`exponential`
      // backoff) until the result no longer routes `retry` or the limit is hit;
      // once exhausted, routing is re-resolved with retry entries skipped to get
      // the terminal action (so `onFail:[{retry},{continue}]` = "retry then
      // continue"; `onFail:[{retry}]` = "retry then the default stop"). Each
      // attempt re-runs the whole step (assertions included), so a transient
      // failure can recover to PASS. flow != verdict: routing only chooses flow;
      // the step's reported result is the final attempt's.
      let stepReport = await runStepOnce();
      let attempts = 1;
      let routingDecision: RoutingDecision;
      while (true) {
        // Record this attempt's outputs so the routing selector can read the
        // step's own `$$steps.<id>.outputs.*` (and so the FINAL value lands in
        // the accumulator for later steps). Reached only for steps that ran.
        if (step.stepId) {
          stepOutputsById[step.stepId] = { outputs: stepReport.outputs ?? {} };
        }
        const routingContext = buildConditionContext({
          platform: context.platform,
          outputs: stepReport.outputs,
          steps: stepOutputsById,
        });
        routingDecision = await resolveStepRouting({
          status: stepReport.result,
          step,
          context: routingContext,
        });
        if (routingDecision.action !== "retry") break;
        if (attempts > routingDecision.limit) {
          // Retries exhausted: re-resolve ignoring retry entries to get the
          // terminal action (a later entry, or the status default).
          routingDecision = await resolveStepRouting({
            status: stepReport.result,
            step,
            context: routingContext,
            skipRetry: true,
          });
          break;
        }
        const waitMs = computeRetryDelay(
          routingDecision.delay,
          routingDecision.backoff,
          attempts - 1
        );
        if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
        clog(
          "debug",
          `Retrying step (attempt ${attempts + 1}, limit ${routingDecision.limit})`
        );
        attempts++;
        stepReport = await runStepOnce();
      }
      // Record the total run count when the step was retried (additive — absent
      // for an un-retried step, so its report is byte-identical).
      if (attempts > 1) stepReport.attempts = attempts;

      // Capture a post-step screenshot for autoScreenshot runs (final attempt
      // only). Applies to browser steps (explicit `screenshot` steps already
      // produce an image); failed steps are captured too — the failure frame is
      // often the most useful. A capture failure logs a warning, never fails.
      // Note: the filename derives from `stepIndex`, so a backward `goToStep`
      // re-visit of the same step overwrites the prior visit's image
      // (latest-visit-wins) — acceptable; the report's `visit` marks re-runs.
      if (
        autoScreenshotEnabled &&
        driver &&
        typeof step.screenshot === "undefined" &&
        isDriverRequired({ test: { steps: [step] } })
      ) {
        const capturedPath = await captureAutoScreenshot({
          config,
          driver,
          spec,
          test,
          context,
          step,
          stepIndex,
          stepCount: context.steps.length,
        });
        if (capturedPath) stepReport.autoScreenshot = capturedPath;
      }

      pushStepReport(stepReport);

      // Apply the terminal routing decision. `continue` runs the next step; a
      // `stop` halts the remaining steps in this context (`spec`/`run` scope —
      // skipping later tests/specs — is deferred to the test-routing phase);
      // `goToStep` jumps the cursor to the target step. flow != verdict: a
      // FAILed step routed `continue`/`goToStep` still leaves the test FAILed
      // via rollUpResults. EXCEPTION: a cleanup (`_fromAfter`) step never stops
      // execution — cleanup is best-effort and must not cascade-skip later
      // cleanup steps; its FAIL still counts in the rollup so failures surface.
      if (routingDecision.action === "stop" && !step._fromAfter) {
        if (routingDecision.scope !== "test") {
          clog(
            "warning",
            `Routing stop scope '${routingDecision.scope}' is not yet propagated beyond the current test; it currently behaves as 'test'. Later tests/specs are not skipped.`
          );
        }
        stepExecutionFailed = true;
        // Preserve the historical wording when a FAIL stops the test (the
        // default onFail:stop); otherwise record that routing stopped it.
        stopReason =
          stepReport.result === "FAIL"
            ? "Skipped due to previous failure in context."
            : "Skipped because a prior step stopped execution (routing).";
        i++;
      } else if (routingDecision.action === "goToStep") {
        const target = indexByStepId.get(routingDecision.stepId);
        if (target === undefined) {
          clog(
            "error",
            `Routing goToStep target '${routingDecision.stepId}' not found in this test; stopping.`
          );
          // An unknown target is a routing misconfiguration (e.g. a typo'd
          // stepId). Surface a FAIL so it can't silently report green, then
          // stop the rest of the context.
          pushStepReport({
            result: "FAIL",
            resultDescription: `Routing goToStep target '${routingDecision.stepId}' does not exist.`,
          });
          stepExecutionFailed = true;
          stopReason = `Skipped because routing goToStep target '${routingDecision.stepId}' does not exist.`;
          i++;
        } else {
          i = target; // JUMP (no stepExecutionFailed — flow != verdict)
        }
      } else {
        i++; // continue
      }
    }

    // Stop every recording still active at the end of the context (the
    // synthetic autoRecord capture plus any explicit record steps the author
    // didn't stop). Each produces an ordered stopRecord step report.
    await stopAllRecordings({ config, context, driver, contextReport });
  } finally {
    // Safety net: if the context threw before the normal sweep above, recordings
    // are still active. Stop them now — while the driver session is still alive
    // (the deleteSession below would otherwise kill the browser/ffmpeg capture
    // and leak the process). On the normal path the set is already empty, so
    // this is a no-op. Best-effort: a stop failure here must not mask the
    // original error.
    try {
      // On the normal path the step loop above already drained every recording,
      // so this is a no-op; it only does work when the context threw before the
      // in-loop sweep, finalizing recordings before deleteSession kills them.
      await stopAllRecordings({ config, context, driver, contextReport });
    } catch (error: any) {
      clog("error", `Failed to stop recordings during cleanup: ${error?.message ?? error}`);
    }
    // Close driver. In a finally so an unexpected throw can't leak a session
    // while sibling contexts keep running.
    if (driver) {
      try {
        await driver.deleteSession();
      } catch (error: any) {
        clog("error", `Failed to delete driver session: ${error.message}`);
      }
    }
    // Return the Appium server to the pool for the next queued context. Always
    // runs (even on the driver-start-failure early return) so a port can't
    // leak out of the pool and starve later contexts.
    if (appiumPort !== undefined && appiumPool) {
      appiumPool.release(appiumPort);
    }
  }

  contextReport.result = rollUpResults(contextReport.steps);
  // Layer 5: a context that ran on a fallback engine is annotated so the
  // substitution is never silent. When the requested engine was explicitly
  // pinned and the run otherwise passed, downgrade PASS → WARNING so a degraded
  // run isn't reported as a clean success. An auto-selected browser keeps PASS.
  if (fellBackNote) {
    if (fellBackPinned && contextReport.result === "PASS") {
      contextReport.result = "WARNING";
    }
    contextReport.resultDescription = contextReport.resultDescription
      ? `${fellBackNote} ${contextReport.resultDescription}`
      : fellBackNote;
  }
  return contextReport;
}

// Stop every recording still active on the driver, pushing an ordered
// stopRecord step report for each. Drains the per-context stack (LIFO) by
// synthesizing `{ stopRecord: true, __stopAny: true }` steps — `__stopAny`
// lets the generic stop also end the synthetic autoRecord recording (a plain
// user `stopRecord: true` deliberately skips it). Each stop removes its handle
// even on failure, so the loop always makes progress; an explicit iteration
// cap is a belt-and-suspenders guard against a handle that somehow refuses to
// drop. Each synthesized stop is isolated so one failure doesn't abort the
// rest. Safe to call when nothing is active (no-op).
async function stopAllRecordings({
  config,
  context,
  driver,
  contextReport,
}: {
  config: any;
  context: any;
  driver: any;
  contextReport: any;
}): Promise<void> {
  if (!Array.isArray(driver?.state?.recordings)) return;
  let guard = driver.state.recordings.length + 1;
  while (driver.state.recordings.length > 0 && guard-- > 0) {
    const stopRecordStep: any = {
      stopRecord: true,
      __stopAny: true,
      description: "Stopping recording",
      stepId: randomUUID(),
    };
    try {
      const stepResult = await runStep({
        config,
        context,
        step: stopRecordStep,
        driver,
        options: { openApiDefinitions: context.openApi || [] },
      });
      stepResult.result = stepResult.status;
      stepResult.resultDescription = stepResult.description;
      delete stepResult.status;
      delete stepResult.description;
      // Don't leak the internal routing marker into the report.
      delete stopRecordStep.__stopAny;
      contextReport.steps.push({ ...stopRecordStep, ...stepResult });
    } catch (error: any) {
      // A throw from runStep would otherwise strand the remaining handles.
      // Drop the top handle so the loop can't spin, and record the failure.
      delete stopRecordStep.__stopAny;
      driver.state.recordings.pop();
      contextReport.steps.push({
        ...stopRecordStep,
        result: "FAIL",
        resultDescription: `Couldn't stop recording. ${error?.message ?? error}`,
      });
    }
  }
}

// Run a specific step
async function runStep({
  config = {},
  context = {},
  step,
  driver,
  metaValues = {},
  options = {},
  processRegistry,
}: {
  config?: any;
  context?: any;
  step: any;
  driver: any;
  metaValues?: any;
  options?: any;
  processRegistry?: Map<string, any>;
}): Promise<any> {
  let actionResult: any;
  // Load values from environment variables
  step = replaceEnvs(step);
  if (typeof step.click !== "undefined") {
    actionResult = await clickElement({
      config: config,
      step: step,
      driver: driver,
    });
  } else if (typeof step.dragAndDrop !== "undefined") {
    actionResult = await dragAndDropElement({
      config: config,
      step: step,
      driver: driver,
    });
  } else if (typeof step.checkLink !== "undefined") {
    actionResult = await checkLink({ config: config, step: step });
  } else if (typeof step.find !== "undefined") {
    actionResult = await findElement({ config: config, step: step, driver });
  } else if (typeof step.stopRecord !== "undefined") {
    actionResult = await stopRecording({ config: config, step: step, driver });
  } else if (typeof step.goTo !== "undefined") {
    actionResult = await goTo({ config: config, step: step, driver: driver });
  } else if (typeof step.loadVariables !== "undefined") {
    actionResult = await loadVariables({ step: step });
  } else if (typeof step.saveCookie !== "undefined") {
    actionResult = await saveCookie({
      config: config,
      step: step,
      driver: driver,
    });
  } else if (typeof step.loadCookie !== "undefined") {
    actionResult = await loadCookie({
      config: config,
      step: step,
      driver: driver,
    });
  } else if (typeof step.httpRequest !== "undefined") {
    actionResult = await httpRequest({
      config: config,
      step: step,
      openApiDefinitions: options?.openApiDefinitions,
    });
  } else if (typeof step.record !== "undefined") {
    actionResult = await startRecording({
      config: config,
      context: context,
      step: step,
      driver: driver,
    });
    // Push the started recording onto the per-context stack so several can
    // overlap. Carry the step's `id`/`name` so a later stopRecord can target
    // it (by name) and end-of-context cleanup can identify the synthetic one.
    if (actionResult.recording) {
      if (!Array.isArray(driver.state.recordings)) driver.state.recordings = [];
      const handle = actionResult.recording;
      handle.id = handle.id ?? randomUUID();
      handle.name = handle.name ?? recordStepName(step.record);
      if (step.__autoRecord) handle.synthetic = true;
      driver.state.recordings.push(handle);
    }
  } else if (typeof step.runCode !== "undefined") {
    actionResult = await runCode({ config: config, step: step, processRegistry });
  } else if (typeof step.runBrowserScript !== "undefined") {
    actionResult = await runBrowserScript({
      config: config,
      step: step,
      driver: driver,
    });
  } else if (typeof step.runShell !== "undefined") {
    actionResult = await runShell({ config: config, step: step, processRegistry });
  } else if (typeof step.closeSurface !== "undefined") {
    actionResult = await closeSurface({ config: config, step: step, processRegistry });
  } else if (typeof step.screenshot !== "undefined") {
    actionResult = await saveScreenshot({
      config: config,
      step: step,
      driver: driver,
    });
  } else if (typeof step.type !== "undefined") {
    actionResult = await typeKeys({
      config: config,
      step: step,
      driver: driver,
      processRegistry,
    });
  } else if (typeof step.wait !== "undefined") {
    actionResult = await wait({ step: step, driver: driver });
  } else {
    actionResult = {
      status: "FAIL",
      description: `Unknown step action: ${JSON.stringify(step)}`,
    };
  }
  // If recording, wait until browser is loaded, then instantiate cursor
  if (isRecordingActive(driver)) {
    const currentUrl = await driver.getUrl();
    if (currentUrl !== driver.state.url) {
      driver.state.url = currentUrl;
      await instantiateCursor(driver);
    }
  }
  // Clean up actionResult outputs
  if (actionResult?.outputs?.rawElement) {
    delete actionResult.outputs.rawElement;
  }

  // Evaluate author-written custom assertions (`step.assertions`). Strictly
  // additive: with no usable `assertions` field this is a no-op and the
  // actionResult is byte-identical. Folds custom records into
  // actionResult.assertions and re-rolls actionResult.status. See
  // evaluateCustomAssertions for the execution-error -> SKIPPED and
  // implicit-FAIL short-circuit semantics.
  if (step.assertions && actionResult) {
    // Custom assertions are evaluated with an empty `steps` map (cross-step
    // `$$steps.*` is deferred), so a `$$steps.*` reference always fails closed —
    // turning a passing step into a FAIL with no explanation. Warn the author
    // (parity with the spec/test-scope `guardReferencesSteps` warning) rather
    // than letting the misuse silently fail the step.
    if (customAssertionsReferenceSteps(step)) {
      log(
        config,
        "warning",
        `Step '${step.stepId || "(unnamed)"}': a custom assertion references '$$steps.*', which is not available to custom assertions yet — the assertion will always fail closed (the step fails). Remove the '$$steps.*' reference or assert on '$$outputs.*' instead.`
      );
    }
    await evaluateCustomAssertions({
      step,
      actionResult,
      platform: context?.platform,
    });
  }

  // If variables are defined, resolve and set them
  if (step.variables) {
    await Promise.all(
      Object.keys(step.variables).map(async (key: string) => {
        const expression = step.variables[key];
        const value = await resolveExpression({
          expression: expression,
          context: { ...metaValues, ...actionResult.outputs },
        });
        process.env[key] = value;
      })
    );
  }
  return actionResult;
}

// Start one Appium server on a free port and resolve once it answers /status.
// Each concurrent runner gets its own server (own port) so parallel contexts
// never create sessions on the same Appium instance.
async function startAppiumServer(
  appiumEntry: string,
  config: any,
  display?: string
): Promise<{ port: number; process: any; display?: string }> {
  const port = await findFreePort();
  log(config, "debug", `Starting Appium on port ${port}`);
  // When a virtual display is supplied (Linux Xvfb recording), launch the
  // server with DISPLAY set so the browser it spawns (via chromedriver)
  // renders on that display — which is what ffmpeg x11grab then captures.
  const env = display ? { ...process.env, DISPLAY: display } : process.env;
  const proc: any = spawn(
    process.execPath,
    [appiumEntry, "-a", "127.0.0.1", "-p", String(port)],
    {
      windowsHide: true,
      cwd: path.join(__dirname, "../.."),
      env,
    }
  );
  proc.on("error", (err: any) => {
    log(
      config,
      "warning",
      `Appium process error: ${err?.stack ?? err?.message ?? String(err)}`
    );
  });
  proc.stdout.on("data", () => {});
  proc.stderr.on("data", () => {});
  try {
    await appiumIsReady(port);
  } catch (error) {
    // appiumIsReady threw or timed out — the spawned child is still alive and
    // would leak (orphan process, port still bound). Tear it down before
    // propagating so subsequent runs don't trip on the stale state. Awaited
    // so the process is confirmed gone before this function returns control
    // to the caller.
    await killTree(proc?.pid);
    throw error;
  }
  log(config, "debug", `Appium is ready on port ${port}.`);
  return { port, process: proc, display };
}

// Delay execution until Appium server is available.
async function appiumIsReady(port: number, timeoutMs: number = 120000) {
  let isReady = false;
  const start = Date.now();
  while (!isReady) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Appium server on port ${port} failed to start within ${timeoutMs / 1000} seconds`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      let resp = await axios.get(`http://127.0.0.1:${port}/status`);
      if (resp.status === 200) isReady = true;
    } catch {}
  }
  return isReady;
}

// Start the Appium driver specified in `capabilities`.
async function driverStart(
  capabilities: any,
  port: number,
  maxAttempts: number = 4,
  ctx: { cacheDir?: string } = {}
) {
  // Two families of transient, retryable session-creation failures, both worse
  // under concurrency (the TRANSIENT regex below enumerates the specific
  // patterns):
  //   1. POST /session races a just-spawned-or-still-dying Appium (Windows):
  //      /status returns 200 from the outgoing process while /session no longer
  //      accepts, or Appium's proxy to chromedriver drops the socket ->
  //      ECONNREFUSED / ECONNRESET / "socket hang up" / "could not proxy command".
  //   2. Several Chromes launching at once briefly starve resources and
  //      ChromeDriver "crashed during startup" / "cannot connect to" /
  //      "DevToolsActivePort" / "session not created". A staggered retry lets
  //      the contention clear; it recovers on the next attempt in practice.
  // Retry these with linear backoff; any other error is a real session-
  // creation failure and propagates immediately.
  const TRANSIENT =
    /ECONNREFUSED|ECONNRESET|socket hang up|could not proxy command|crashed during startup|cannot connect to|DevToolsActivePort|session not created/i;
  const wdio = await loadHeavyDep<WdioModule>("webdriverio", { ctx });
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const driver: any = await wdio.remote({
        protocol: "http",
        hostname: "127.0.0.1",
        port,
        path: "/",
        logLevel: "error",
        capabilities,
        connectionRetryTimeout: 120000, // 2 minutes
        waitforTimeout: 120000, // 2 minutes
      });
      // Per-context mutable state. `recordings` lives here (not on config)
      // so concurrent contexts can't clobber each other's recordings. It is a
      // stack of active recording handles (LIFO) so several can overlap within
      // one context (e.g. an autoRecord full-context capture plus an explicit
      // record/stopRecord sub-section).
      driver.state = { url: "", x: null, y: null, recordings: [] };
      return driver;
    } catch (err: any) {
      lastError = err;
      if (!TRANSIENT.test(String(err && err.message))) throw err;
      if (attempt < maxAttempts) {
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }
  throw lastError;
}

/**
 * Creates and returns a Chrome WebDriver instance with an Appium server.
 * This function is designed for use by external libraries that need a Doc Detective runner.
 *
 * @param {Object} options - Configuration options for the runner.
 * @param {Object} [options.config={}] - Doc Detective configuration object for logging.
 * @param {number} [options.width=1200] - Browser window width in pixels.
 * @param {number} [options.height=800] - Browser window height in pixels.
 * @param {boolean} [options.headless=true] - Whether to run browser in headless mode.
 * @returns {Promise<Object>} Object containing:
 *   - runner: WebDriver instance for browser automation
 *   - appium: Appium server process (advanced use; prefer cleanup() for termination)
 *   - cleanup: Async function to properly cleanup driver and Appium server
 *   - runStep: Function to execute Doc Detective test steps
 * @throws {Error} If Chrome is not available or driver initialization fails
 *
 * @example
 * const { runner, cleanup } = await getRunner({ headless: false });
 * try {
 *   await runner.url('https://example.com');
 *   // ... perform automation tasks
 * } finally {
 *   await cleanup();
 * }
 */
/**
 * Lazy-install the heavy npm runtime + browser binaries needed to drive
 * Chrome into the doc-detective cache. Mirrors the npm/browser set that
 * inferRuntimeNeeds() derives for a chrome browser step, and the
 * ensureBrowserInstalled calls the runTests pre-flight makes. Heavy deps are
 * imported dynamically so a pure HTTP/CLI consumer never loads them.
 */
async function provisionChromeRuntime(config: any): Promise<void> {
  const { ensureRuntimeInstalled } = await import("../runtime/loader.js");
  const { ensureBrowserInstalled } = await import("../runtime/browsers.js");
  const ctx = { cacheDir: config?.cacheDir };
  // Bridge runtime modules' (msg, level) logger to core/utils.ts#log, mapping
  // "warn" → "warning" the same way the runTests pre-flight does.
  const logger = (msg: string, level: string = "info") =>
    log(config, level === "warn" ? "warning" : level, msg);
  await ensureRuntimeInstalled(
    ["webdriverio", "appium", "@puppeteer/browsers", "appium-chromium-driver"],
    { ctx, deps: { logger } }
  );
  await ensureBrowserInstalled("chrome", { ctx, deps: { logger } });
  await ensureBrowserInstalled("chromedriver", { ctx, deps: { logger } });
}

/**
 * Resolve the available-apps list with Chrome guaranteed present, lazy-
 * installing the browser runtime on a miss before giving up. This is the
 * runtime counterpart to the runTests pre-flight: it runs regardless of
 * DOC_DETECTIVE_AUTOINSTALL (that env var only governs the *eager* postinstall
 * download — first use should still self-provision). A provisioning failure
 * (e.g. offline) is swallowed so the caller sees the clear "not available"
 * error rather than a raw npm/network stack. Deps are injected for testing.
 *
 * @returns the available-apps array, with a chrome entry present.
 * @throws if chrome is still unavailable after a provisioning attempt.
 */
async function ensureChromeAvailable(
  config: any,
  deps: {
    detect: (config: any) => Promise<any[]>;
    provision: (config: any) => Promise<void>;
    invalidate: (config: any) => void;
    log?: (config: any, level: string, msg: string) => void;
  }
): Promise<any[]> {
  let availableApps = await deps.detect(config);
  if (availableApps.some((app: any) => app.name === "chrome")) {
    return availableApps;
  }
  // Chrome not detected — attempt to provision it, then re-detect.
  deps.log?.(
    config,
    "info",
    "Chrome not detected; installing browser runtime (note: DOC_DETECTIVE_AUTOINSTALL=0 only suppresses the eager postinstall, not this first-use install)…"
  );
  try {
    await deps.provision(config);
  } catch (err: any) {
    deps.log?.(
      config,
      "warning",
      `Browser runtime auto-install failed: ${err?.message ?? err}`
    );
  } finally {
    // Always drop the memoized "no chrome" entry so the re-detect below is a
    // real re-scan: provisioning installs several assets and may have
    // partially succeeded even if it ultimately threw, so the cached empty
    // snapshot can't be trusted on either path. In `finally` (not the try
    // body) so a bug in `invalidate` surfaces on its own rather than being
    // mislabeled as a provisioning failure.
    deps.invalidate(config);
  }
  availableApps = await deps.detect(config);
  if (!availableApps.some((app: any) => app.name === "chrome")) {
    throw new Error(
      "Chrome browser is not available. Please ensure Chrome is installed and accessible."
    );
  }
  return availableApps;
}

/**
 * On-demand, per-context browser/driver install used by the runner when a
 * context's browser isn't yet available (e.g. Firefox declared but geckodriver
 * missing). Attempts to install every asset the browser needs, memoizing the
 * outcome in `installAttempts` so a failed (or no-op) attempt isn't repeated
 * for every later context that shares the browser. Like ensureChromeAvailable,
 * this self-provisions regardless of DOC_DETECTIVE_AUTOINSTALL (that env var
 * only governs the eager postinstall). Deps are injected for testing.
 *
 * @returns "installed" when all assets installed, "failed" when an install
 *   threw, or "notInstallable" for browsers with no installable asset (safari).
 */
async function ensureContextBrowserInstalled({
  browserName,
  config,
  installAttempts,
  deps,
  repair = false,
}: {
  browserName: string | undefined;
  config: any;
  installAttempts: Map<string, "installed" | "failed" | "notInstallable">;
  deps: {
    ensureBrowser: (asset: BrowserAssetName, options: any) => Promise<any>;
    log?: (config: any, level: string, msg: string) => void;
  };
  // Layer 3 self-heal: when the browser is unavailable or its session failed —
  // because a component is missing OR didn't install correctly — force a clean
  // reinstall of *every* required asset (the browser binary AND its driver), so
  // a partial/corrupt component of either kind is replaced and re-validated.
  // Repair only fires when something is already wrong, so re-downloading a
  // healthy component is an acceptable cost for a guaranteed-clean state.
  repair?: boolean;
}): Promise<"installed" | "failed" | "notInstallable"> {
  const key = (browserName ?? "<none>").toLowerCase();
  const cached = installAttempts.get(key);
  if (cached) return cached;

  const assets = requiredBrowserAssets(browserName);
  if (assets.length === 0) {
    installAttempts.set(key, "notInstallable");
    return "notInstallable";
  }

  const ctx = { cacheDir: config?.cacheDir };
  // Bridge runtime modules' (msg, level) logger to core/utils.ts#log, mapping
  // "warn" → "warning" the same way provisionChromeRuntime does.
  const logger = (msg: string, level: string = "info") =>
    deps.log?.(config, level === "warn" ? "warning" : level, msg);
  try {
    deps.log?.(
      config,
      "info",
      `Browser '${browserName}' is not available; attempting on-demand ${
        repair ? "repair" : "install"
      } of: ${assets.join(", ")}.`
    );
    for (const asset of assets) {
      // On repair, force every component (browser binary + driver) so a
      // present-but-broken one is replaced, not just installed-if-missing.
      await deps.ensureBrowser(asset, {
        ctx,
        deps: { logger },
        force: !!repair,
      });
    }
    installAttempts.set(key, "installed");
    return "installed";
  } catch (err: any) {
    deps.log?.(
      config,
      "warning",
      `On-demand install for '${browserName}' failed: ${err?.message ?? err}`
    );
    installAttempts.set(key, "failed");
    return "failed";
  }
}

async function getRunner(options: any = {}) {
  const environment = getEnvironment();
  const config = { ...options.config, environment };
  const width = options.width || 1200;
  const height = options.height || 800;
  const headless = options.headless !== false;

  // Get runner details, self-provisioning Chrome on a miss (see
  // ensureChromeAvailable) so a runner started without a pre-warmed cache
  // installs what it needs instead of failing.
  const runnerDetails = {
    environment,
    availableApps: await ensureChromeAvailable(config, {
      detect: (c: any) => getAvailableApps({ config: c }),
      provision: provisionChromeRuntime,
      invalidate: clearAppCache,
      log,
    }),
  };

  // Set Appium home directory
  setAppiumHome({ cacheDir: config?.cacheDir });

  // Start Appium server on a free ephemeral port. Same `node <entry>`
  // pattern as the runSpecs spawn above — see comment there.
  const appiumPort = await findFreePort();
  const appiumEntry = resolveHeavyDepPath("appium", { cacheDir: config?.cacheDir });
  if (!appiumEntry) {
    throw new Error(
      "appium is not installed. Run `doc-detective install runtime appium` to install it."
    );
  }
  const appium = spawn(
    process.execPath,
    [appiumEntry, "-a", "127.0.0.1", "-p", String(appiumPort)],
    {
      windowsHide: true,
      cwd: path.join(__dirname, "../.."),
    }
  );
  // Without a listener an "error" event from spawn (e.g. ENOENT, EACCES)
  // would crash the process before appiumIsReady's timeout could surface
  // a meaningful failure.
  appium.on("error", (err: any) => {
    log(config, "warning", `Appium process error: ${err?.stack ?? err?.message ?? String(err)}`);
  });

  // Wait for Appium to be ready. Same kill-on-throw guard as in
  // runSpecs above — without it, a startup timeout would leave an
  // orphan Appium child holding the ephemeral port.
  try {
    await appiumIsReady(appiumPort);
  } catch (error) {
    try {
      if (appium && appium.pid) kill(appium.pid);
    } catch {
      // best-effort cleanup; the parent error is what matters
    }
    throw error;
  }
  log(config, "debug", `Appium is ready for external driver on port ${appiumPort}.`);

  // Get Chrome driver capabilities
  const caps: any = getDriverCapabilities({
    runnerDetails: runnerDetails,
    name: "chrome",
    options: {
      width,
      height,
      headless,
    },
  });

  // Start the runner
  let runner: any;
  try {
    runner = await driverStart(caps, appiumPort, 4, { cacheDir: config?.cacheDir });
  } catch (error: any) {
    // If runner fails, attempt to set headless and retry
    try {
      log(
        config,
        "warning",
        "Failed to start Chrome runner. Retrying as headless."
      );
      caps["goog:chromeOptions"].args.push("--headless", "--disable-gpu");
      runner = await driverStart(caps, appiumPort, 4, { cacheDir: config?.cacheDir });
    } catch (error: any) {
      // If runner fails, clean up Appium and rethrow
      kill(appium.pid!);
      throw new Error(`Failed to start Chrome runner: ${error.message}`);
    }
  }

  // Set window size
  try {
    await runner.setWindowSize(width, height);
  } catch (error: any) {
    log(config, "warning", `Failed to set window size: ${error.message}`);
  }

  // Create cleanup function
  const cleanup = async () => {
    try {
      if (runner) {
        await runner.deleteSession();
      }
    } catch (error: any) {
      log(config, "error", `Failed to delete runner session: ${error.message}`);
    }
    if (appium) {
      kill(appium.pid!);
    }
  };

  return { runner, appium, cleanup, runStep };
}
