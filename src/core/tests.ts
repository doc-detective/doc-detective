import kill from "tree-kill";
// webdriverio is loaded lazily via loadHeavyDep at the driverStart() call
// site so the shim's CLI startup doesn't pay its ~50MB load cost when the
// user is only running e.g. install-agents or install status. The type
// reference uses `typeof import('webdriverio')` directly at the call site
// so we don't carry a top-level `import type` whose `typeof` would refer
// to a non-runtime identifier.
import { loadHeavyDep, resolveHeavyDepPath } from "../runtime/loader.js";
import {
  requiredBrowserAssets,
  ensureBrowserInstalled,
  type BrowserAssetName,
} from "../runtime/browsers.js";
import os from "node:os";
import {
  log,
  replaceEnvs,
  selectSpecsForRun,
  findFreePort,
  runConcurrentByTest,
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
  checkSystemBinary,
  xvfbDisplay,
  startXvfb,
  XVFB_SCREEN_SIZE,
} from "./tests/ffmpegRecorder.js";
import { loadVariables } from "./tests/loadVariables.js";
import { saveCookie } from "./tests/saveCookie.js";
import { loadCookie } from "./tests/loadCookie.js";
import { httpRequest } from "./tests/httpRequest.js";
import { clickElement } from "./tests/click.js";
import { runCode } from "./tests/runCode.js";
import { dragAndDropElement } from "./tests/dragAndDrop.js";
import path from "node:path";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { setAppiumHome } from "./appium.js";
import { contentHash } from "../common/src/detectTests.js";
import { resolveExpression } from "./expressions.js";
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
  isSupportedContext,
  resolveAutoScreenshot,
};
// exports.appiumStart = appiumStart;
// exports.appiumIsReady = appiumIsReady;
// exports.driverStart = driverStart;

// Doc Detective actions that require a driver.
const driverActions = [
  "click",
  "dragAndDrop",
  "stopRecord",
  "find",
  "goTo",
  "loadCookie",
  "record",
  "saveCookie",
  "screenshot",
  "type",
];

// Browser names getDriverCapabilities knows how to build caps for. `safari` is
// rewritten to `webkit` during context resolution, so both appear here.
const KNOWN_BROWSERS = ["firefox", "chrome", "safari", "webkit"];

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
  // `.doc-detective/run-<id>/` behind. Pass the selected specs so per-spec/test
  // autoScreenshot reserves the folder atomically up front rather than via the
  // non-atomic memoized branch when the first screenshot fires.
  const runDir = getRunOutputDir(config, {
    create: runArchivesArtifacts(config, specs),
  });
  const runId = path.basename(runDir).replace(/^run-/, "");
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
  for (const spec of specs) {
    log(config, "debug", `SPEC: ${spec.specId}`);
    // Create-if-missing: specIds (and testIds) aren't guaranteed unique
    // across the run, and all registration now happens up front — an
    // overwrite here would wipe an earlier spec's registered tests.
    metaValues.specs[spec.specId] ??= { tests: {} };
    const specReport: any = {
      specId: spec.specId,
      description: spec.description,
      contentPath: spec.contentPath,
      tests: [],
    };
    report.specs.push(specReport);
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
      // Track contextIds within this test so the deterministic fallback below
      // can suffix collisions, mirroring resolveTests' deriveContextId.
      const usedContextIds = new Set<string>(
        test.contexts.map((c: any) => c.contextId).filter(Boolean)
      );
      test.contexts.forEach((context: any, slot: number) => {
        // Derive a stable contextId from platform/browser when unset (the
        // resolver normally assigns one) so the same context keeps the same
        // ID across runs for comparison — `default` when neither is known,
        // with an ordinal suffix on collision. No randomness, so two
        // otherwise-identical runs produce identical reports. Normalized onto
        // the context so runContext's metaValues keys and the report all read
        // the same value.
        if (!context.contextId) {
          const base =
            [context.platform, context.browser?.name]
              .filter(Boolean)
              .join("-") || "default";
          let id = base;
          let suffix = 2;
          while (usedContextIds.has(id)) {
            id = `${base}-${suffix++}`;
          }
          usedContextIds.add(id);
          context.contextId = id;
        }
        // Auto-resolution: when a record step has no explicit engine and the
        // user never chose a browser, prefer the concurrency-safe browser
        // engine by coercing to headed Chrome (when available). Done here,
        // before the concurrency calc below, so each job's engine is settled.
        // Non-record contexts keep runContext's normal browser defaulting.
        const coercedBrowser = coerceRecordContextBrowser({
          context,
          availableApps: runnerDetails.availableApps,
        });
        if (coercedBrowser) context.browser = coercedBrowser;
        jobs.push({ spec, test, context, contexts: testReport.contexts, slot });
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
  const anyFfmpegRecording = jobs.some(jobIsFfmpegRecording);
  let xvfbAvailable = false;
  if (anyFfmpegRecording && process.platform === "linux") {
    xvfbAvailable = await checkSystemBinary("Xvfb");
  }
  const concurrency = computeEffectiveConcurrency({
    requestedLimit: limit,
    jobs,
    platform: process.platform,
    xvfbAvailable,
  });
  limit = concurrency.limit;
  if (concurrency.forcedSerial) {
    log(
      config,
      "warning",
      "Recording with the ffmpeg engine needs exclusive use of the display, so this run is executing serially (concurrentRunners=1). To record concurrently, use the Chrome browser engine (record: { engine: \"browser\" }) or, on Linux, install Xvfb."
    );
    report.recordingForcedSerial = true;
  }

  // Start one Appium server per concurrent runner that will actually use a
  // driver (capped at the number of driver contexts). Each server owns a
  // distinct port, so parallel contexts never create sessions on the same
  // server — that contention crashed ChromeDriver when every context shared
  // one server. Non-driver runs start none.
  const driverJobCount = jobs.filter((job: any) =>
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
      for (const server of appiumServers) {
        try {
          kill(server.process.pid);
        } catch {
          // best-effort
        }
      }
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
        jobs,
        config,
        runnerDetails,
        appiumPool,
        installAttempts,
        warmUpResults,
      });
    }

    // Phase 2: run context jobs with a global cap of `limit` concurrent
    // contexts, but preserve each spec's test order — test i+1 of a spec waits
    // for all of test i's contexts. Contexts within a test still run
    // concurrently, and different specs run concurrently. This keeps specs that
    // rely on test ordering (e.g. a setup test that starts a server later tests
    // depend on) correct under concurrency. A limit of 1 (the default) is
    // strictly sequential in input order.
    await runConcurrentByTest(jobs, limit, async (job: any) => {
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
    });

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
    // Close every Appium server we started.
    for (const server of appiumServers) {
      log(config, "debug", `Closing Appium server on port ${server.port}`);
      try {
        kill(server.process.pid);
      } catch {
        // Process may already be terminated
      }
    }
    // Tear down any Xvfb virtual displays started for recording.
    for (const xvfb of xvfbProcesses) {
      try {
        xvfb.kill();
      } catch {
        // Process may already be terminated
      }
    }
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

// Directory/file segments built from IDs are capped so deeply nested doc
// trees can't push the full screenshot path past Windows' MAX_PATH. Keep the
// tail — content hashes live at the end of generated IDs.
function capPathSegment(segment: string, max: number = 64): string {
  return segment.length <= max ? segment : segment.slice(segment.length - max);
}

// Capture a post-step screenshot for `autoScreenshot` runs. The relative
// path is derived from stable IDs (spec/test/context) plus the step's
// order, action, and ID (e.g. screenshots/docs_guide.md/
// docs_guide.md~3f9a2c1b/windows-chrome/01-goTo-s4f2a91c.png), so the same
// step lands on the same relative path inside every run's folder — that's
// what makes run-over-run image comparison possible. Failures are logged as
// warnings, never thrown: a missed capture must not fail the step it
// documents.
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
      "screenshots",
      capPathSegment(sanitizeFilesystemName(String(spec.specId ?? ""), "spec")),
      capPathSegment(sanitizedTestId),
      capPathSegment(
        sanitizeFilesystemName(String(context.contextId ?? ""), "context")
      )
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
    });
    // Re-detect after a real attempt regardless of outcome: a "failed" install
    // can still have materialized assets before it threw, so a stale snapshot
    // could wrongly skip a now-usable browser.
    if (firstAttempt && (outcome === "installed" || outcome === "failed")) {
      freshInstallRedetected = true;
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

  // If context isn't supported, skip it
  if (!supportedContext) {
    // Distinguish "we installed the dependency but still can't see it" from a
    // plain unsupported context, so the skip reason points at the real problem.
    const errorMessage = freshInstallRedetected
      ? `Skipping context '${context.browser?.name}' on '${context.platform}': the missing browser dependency was installed but still could not be detected.`
      : `Skipping context. The current system doesn't support this context: {"platform": "${
          context.platform
        }", "apps": ${JSON.stringify(context.apps)}}`;
    clog(freshInstallRedetected ? "warning" : "info", errorMessage);
    contextReport.result = "SKIPPED";
    contextReport.resultDescription = errorMessage;
    return contextReport;
  }
  clog("debug", `CONTEXT:\n${JSON.stringify(context, null, 2)}`);

  let driver: any;
  let appiumPort: number | undefined;
  const driverRequired = isDriverRequired({ test: context });
  if (driverRequired && !appiumPool) {
    throw new Error(
      "Driver requested but no Appium server pool was created; " +
        "driverJobCount and isDriverRequired(context) disagreed; this is a bug."
    );
  }

  // Warm-up memoization. The first context of each combination acts as the
  // warm-up; if that combination already failed to start a driver earlier in
  // this run, skip it outright instead of paying driverStart's retry/backoff
  // again. Under concurrency this is a best-effort speedup, not correctness —
  // same-combo contexts may start before one records a result.
  const combo = combinationKey(context);

  try {
    if (driverRequired) {
      if (warmUpDecision(warmUpResults.get(combo)) === "skip") {
        const errorMessage = `Skipping context '${context.browser?.name}' on '${context.platform}': this context combination could not start a driver earlier in this run.`;
        clog("warning", errorMessage);
        contextReport.result = "SKIPPED";
        contextReport.resultDescription = errorMessage;
        return contextReport;
      }
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

      // Define driver capabilities
      // TODO: Support custom apps
      // Per-context recording identifiers so concurrent Chrome recordings
      // auto-select their own window and download to their own dir.
      const recordOptions = {
        captureSourceTitle: browserCaptureTitle(context.contextId),
        downloadDir: browserDownloadDir(context.contextId),
      };
      let caps: any = getDriverCapabilities({
        runnerDetails: runnerDetails,
        name: context.browser.name,
        options: {
          width: context.browser?.window?.width || 1200,
          height: context.browser?.window?.height || 800,
          headless: context.browser?.headless !== false,
          ...recordOptions,
        },
      });
      clog("debug", "CAPABILITIES:");
      clog("debug", caps);

      // Instantiate driver
      try {
        driver = await driverStart(caps, appiumPort, 4, { cacheDir: config?.cacheDir });
      } catch (error: any) {
        try {
          // If driver fails to start, try again as headless
          clog(
            "warning",
            `Failed to start context '${context.browser?.name}' on '${platform}'. Retrying as headless.`
          );
          context.browser.headless = true;
          caps = getDriverCapabilities({
            runnerDetails: runnerDetails,
            name: context.browser.name,
            options: {
              width: context.browser?.window?.width || 1200,
              height: context.browser?.window?.height || 800,
              headless: context.browser?.headless !== false,
              ...recordOptions,
            },
          });
          driver = await driverStart(caps, appiumPort, 4, { cacheDir: config?.cacheDir });
        } catch (error: any) {
          let errorMessage = `Failed to start context '${context.browser?.name}' on '${platform}'.`;
          // `safari` is normalized to `webkit` during context resolution, so
          // match both or this Safari-specific hint never fires on real runs.
          if (
            context.browser?.name === "safari" ||
            context.browser?.name === "webkit"
          )
            errorMessage =
              errorMessage +
              " Make sure you've run `safaridriver --enable` in a terminal and enabled 'Allow Remote Automation' in Safari's Develop menu.";
          clog("error", errorMessage);
          // Record the combination as failed so every later context that shares
          // it is skipped instantly (see the warm-up check above).
          if (!warmUpResults.has(combo)) warmUpResults.set(combo, "failed");
          contextReport.result = "SKIPPED";
          contextReport.resultDescription = errorMessage;
          return contextReport;
        }
      }
      // Driver started (first attempt or headless retry) — mark this
      // combination as known-good for the rest of the run.
      if (!warmUpResults.has(combo)) warmUpResults.set(combo, "ok");

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
    const usedStepIds = new Set(
      context.steps.map((s: any) => s.stepId).filter(Boolean)
    );
    for (const [stepIndex, step] of context.steps.entries()) {
      // Set step id if not defined. Derived from the test ID and a hash of
      // the step's authored definition so the same step keeps the same ID
      // (and any `screenshot: true` default filename) across runs.
      // Sanitized because the ID doubles as a screenshot filename; identical
      // steps in one test get an ordinal suffix.
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
        contextReport.steps.push(stepReport);
        continue;
      }

      if (stepExecutionFailed) {
        // Mark as skipped
        const stepReport = {
          ...step,
          result: "SKIPPED",
          resultDescription: "Skipped due to previous failure in context.",
        };
        contextReport.steps.push(stepReport);
        continue;
      }

      // Set meta values
      metaValues.specs[spec.specId].tests[test.testId].contexts[
        context.contextId
      ].steps[step.stepId] = {};

      // Run step
      const stepResult = await runStep({
        config: config,
        context: context,
        step: step,
        driver: driver,
        metaValues: metaValues,
        options: {
          openApiDefinitions: context.openApi || [],
        },
      });
      clog(
        "debug",
        `RESULT: ${stepResult.status}\n${JSON.stringify(stepResult, null, 2)}`
      );

      stepResult.result = stepResult.status;
      stepResult.resultDescription = stepResult.description;
      delete stepResult.status;
      delete stepResult.description;

      // Add step result to report
      const stepReport = {
        ...step,
        ...stepResult,
      };

      // Capture a post-step screenshot for autoScreenshot runs. Applies to
      // browser steps (explicit `screenshot` steps already produce an image);
      // failed steps are captured too — the failure frame is often the most
      // useful. A capture failure logs a warning and never fails the step.
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

      contextReport.steps.push(stepReport);

      // If this step failed, set flag to skip remaining steps
      if (stepReport.result === "FAIL") {
        stepExecutionFailed = true;
      }
    }

    // If recording, stop recording
    if (driver?.state?.recording) {
      const stopRecordStep = {
        stopRecord: true,
        description: "Stopping recording",
        stepId: randomUUID(),
      };
      const stepResult = await runStep({
        config: config,
        context: context,
        step: stopRecordStep,
        driver: driver,
        options: {
          openApiDefinitions: context.openApi || [],
        },
      });
      stepResult.result = stepResult.status;
      stepResult.resultDescription = stepResult.description;
      delete stepResult.status;
      delete stepResult.description;

      // Add step result to report
      const stepReport = {
        ...stopRecordStep,
        ...stepResult,
      };
      contextReport.steps.push(stepReport);
    }
  } finally {
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
  return contextReport;
}

// Run a specific step
async function runStep({
  config = {},
  context = {},
  step,
  driver,
  metaValues = {},
  options = {},
}: {
  config?: any;
  context?: any;
  step: any;
  driver: any;
  metaValues?: any;
  options?: any;
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
    driver.state.recording = actionResult.recording ?? null;
  } else if (typeof step.runCode !== "undefined") {
    actionResult = await runCode({ config: config, step: step });
  } else if (typeof step.runShell !== "undefined") {
    actionResult = await runShell({ config: config, step: step });
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
  if (driver?.state?.recording) {
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
    // propagating so subsequent runs don't trip on the stale state.
    try {
      if (proc && proc.pid) kill(proc.pid);
    } catch {
      // best-effort cleanup; the parent error is what matters
    }
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
  const wdio = await loadHeavyDep<typeof import("webdriverio")>(
    "webdriverio",
    { ctx }
  );
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
      // Per-context mutable state. `recording` lives here (not on config)
      // so concurrent contexts can't clobber each other's recordings.
      driver.state = { url: "", x: null, y: null, recording: null };
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
}: {
  browserName: string | undefined;
  config: any;
  installAttempts: Map<string, "installed" | "failed" | "notInstallable">;
  deps: {
    ensureBrowser: (asset: BrowserAssetName, options: any) => Promise<any>;
    log?: (config: any, level: string, msg: string) => void;
  };
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
      `Browser '${browserName}' is not available; attempting on-demand install of: ${assets.join(
        ", "
      )}.`
    );
    for (const asset of assets) {
      await deps.ensureBrowser(asset, { ctx, deps: { logger } });
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
