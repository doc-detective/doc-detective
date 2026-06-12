import kill from "tree-kill";
// webdriverio is loaded lazily via loadHeavyDep at the driverStart() call
// site so the shim's CLI startup doesn't pay its ~50MB load cost when the
// user is only running e.g. install-agents or install status. The type
// reference uses `typeof import('webdriverio')` directly at the call site
// so we don't carry a top-level `import type` whose `typeof` would refer
// to a non-runtime identifier.
import { loadHeavyDep, resolveHeavyDepPath } from "../runtime/loader.js";
import os from "node:os";
import {
  log,
  replaceEnvs,
  selectSpecsForRun,
  findFreePort,
  runConcurrent,
  rollUpResults,
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
  getDriverCapabilities,
  getDefaultBrowser,
  isSupportedContext,
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
        args.push(`--auto-select-desktop-capture-source=RECORD_ME`);
        if (options.headless) args.push("--headless", "--disable-gpu");
        if (process.platform === "linux") args.push("--no-sandbox");
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
              "download.default_directory": os.tmpdir(),
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

// Check if any steps require an Appium driver.
function isAppiumRequired(specs: any[]) {
  let appiumRequired = false;
  specs.forEach((spec: any) => {
    spec.tests.forEach((test: any) => {
      test.contexts.forEach((context: any) => {
        // Check if test includes actions that require a driver.
        if (isDriverRequired({ test: context })) {
          appiumRequired = true;
        }
      });
    });
  });
  return appiumRequired;
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
  const availableApps = runnerDetails.availableApps;
  const metaValues: any = { specs: {} };
  let appium: any;
  const report: any = {
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

  // Determine which apps are required
  const appiumRequired = isAppiumRequired(specs);

  // Warm up Appium
  let appiumPort: number | undefined;
  if (appiumRequired) {
    setAppiumHome({ cacheDir: config?.cacheDir });
    appiumPort = await findFreePort();
    log(config, "debug", `Starting Appium on port ${appiumPort}`);
    // Resolve appium's actual JS entrypoint via `require.resolve`
    // (shim node_modules first, runtime cache second) and invoke it
    // with `node <entry>`. This sidesteps every shell-injection trap
    // at once: no `.cmd` shim, so no Windows-requires-shell:true; no
    // `npx`, so no PATH lookup; no user-controlled paths in a shell-
    // interpreted string. Works for both `--omit=optional` users
    // (appium in cache only) and default installs (appium in shim).
    const appiumEntry = resolveHeavyDepPath("appium", { cacheDir: config?.cacheDir });
    if (!appiumEntry) {
      throw new Error(
        "appium is not installed. The runtime pre-flight should have installed it; check DOC_DETECTIVE_CACHE_DIR / config.cacheDir or run `doc-detective install runtime appium`."
      );
    }
    appium = spawn(
      process.execPath,
      [appiumEntry, "-a", "127.0.0.1", "-p", String(appiumPort)],
      {
        windowsHide: true,
        cwd: path.join(__dirname, "../.."),
      }
    );
    appium.on("error", (err: any) => {
      log(config, "warning", `Appium process error: ${err?.stack ?? err?.message ?? String(err)}`);
    });
    appium.stdout.on("data", (data: any) => {
      // console.log(`stdout: ${data}`);
    });
    appium.stderr.on("data", (data: any) => {
      // console.error(`stderr: ${data}`);
    });
    try {
      await appiumIsReady(appiumPort);
    } catch (error) {
      // appiumIsReady threw or timed out — the spawned child is still
      // alive and would leak (orphan process, port still bound). Tear
      // it down before propagating so subsequent runs don't trip on
      // the stale state.
      try {
        if (appium && appium.pid) kill(appium.pid);
      } catch {
        // best-effort cleanup; the parent error is what matters
      }
      throw error;
    }
    log(config, "debug", "Appium is ready.");
  }

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
      test.contexts.forEach((context: any, slot: number) => {
        context.contextId = context.contextId || randomUUID();
        jobs.push({ spec, test, context, contexts: testReport.contexts, slot });
      });
    }
  }

  // Phase 2: run every context job through one flat worker pool. A limit of 1
  // (the default) is strictly sequential in input order. Re-resolve
  // defensively: API callers can hand runSpecs a config that never went
  // through core setConfig, leaving concurrentRunners as `true`.
  const limit = resolveConcurrentRunners(config);
  if (
    limit > 1 &&
    jobs.some((job: any) =>
      job.context.steps?.some((step: any) => step.record !== undefined)
    )
  ) {
    // Concurrent headed recordings capture via getDisplayMedia and can grab
    // the wrong window. Recording filenames in the temp dir can also collide.
    log(
      config,
      "warning",
      "Tests include record steps while concurrentRunners is greater than 1. Concurrent recordings can capture the wrong window; set concurrentRunners to 1 for recording runs."
    );
  }
  await runConcurrent(jobs, limit, async (job: any) => {
    try {
      job.contexts[job.slot] = await runContext({
        config,
        spec: job.spec,
        test: job.test,
        context: job.context,
        runnerDetails,
        appiumPort,
        metaValues,
        logPrefix:
          limit > 1 ? `[${job.test.testId}/${job.context.contextId}]` : "",
      });
    } catch (error: any) {
      // Error isolation: one crashing context must not abort sibling jobs.
      log(
        config,
        "error",
        `Context '${job.context.contextId}' crashed: ${error.message}`
      );
      job.contexts[job.slot] = {
        contextId: job.context.contextId,
        platform: job.context.platform,
        browser: job.context.browser,
        result: "FAIL",
        resultDescription: `Unexpected error: ${error.message}`,
        steps: [],
      };
    }
  });

  // Phase 3: roll results up the tree and count the summary in one
  // deterministic pass after all contexts have finished.
  for (const specReport of report.specs) {
    for (const testReport of specReport.tests) {
      for (const contextReport of testReport.contexts) {
        for (const stepReport of contextReport.steps) {
          report.summary.steps[stepReport.result.toLowerCase()]++;
        }
        report.summary.contexts[contextReport.result.toLowerCase()]++;
      }
      testReport.result = rollUpResults(testReport.contexts);
      report.summary.tests[testReport.result.toLowerCase()]++;
    }
    specReport.result = rollUpResults(specReport.tests);
    report.summary.specs[specReport.result.toLowerCase()]++;
  }

  // Close appium server
  if (appium) {
    log(config, "debug", "Closing Appium server");
    try {
      kill(appium.pid);
    } catch {
      // Process may already be terminated
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
  appiumPort,
  metaValues,
  logPrefix = "",
}: {
  config: any;
  spec: any;
  test: any;
  context: any;
  runnerDetails: any;
  appiumPort: number | undefined;
  metaValues: any;
  logPrefix?: string;
}): Promise<any> {
  const platform = runnerDetails.environment.platform;
  const availableApps = runnerDetails.availableApps;
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
  const supportedContext = isSupportedContext({
    context: context,
    apps: availableApps,
    platform: platform,
  });

  // If context isn't supported, skip it
  if (!supportedContext) {
    clog(
      "info",
      `Skipping context. The current system doesn't support this context: {"platform": "${
        context.platform
      }", "apps": ${JSON.stringify(context.apps)}}`
    );
    contextReport.result = "SKIPPED";
    return contextReport;
  }
  clog("debug", `CONTEXT:\n${JSON.stringify(context, null, 2)}`);

  let driver: any;
  const driverRequired = isDriverRequired({ test: context });
  if (driverRequired) {
    // Define driver capabilities
    // TODO: Support custom apps
    let caps: any = getDriverCapabilities({
      runnerDetails: runnerDetails,
      name: context.browser.name,
      options: {
        width: context.browser?.window?.width || 1200,
        height: context.browser?.window?.height || 800,
        headless: context.browser?.headless !== false,
      },
    });
    clog("debug", "CAPABILITIES:");
    clog("debug", caps);

    if (appiumPort === undefined) {
      throw new Error(
        "Driver requested but Appium was not started. " +
          "isAppiumRequired(specs) and isDriverRequired(context) disagreed; this is a bug."
      );
    }
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
          },
        });
        driver = await driverStart(caps, appiumPort, 4, { cacheDir: config?.cacheDir });
      } catch (error: any) {
        let errorMessage = `Failed to start context '${context.browser?.name}' on '${platform}'.`;
        if (context.browser?.name === "safari")
          errorMessage =
            errorMessage +
            " Make sure you've run `safaridriver --enable` in a terminal and enabled 'Allow Remote Automation' in Safari's Develop menu.";
        clog("error", errorMessage);
        contextReport.result = "SKIPPED";
        contextReport.resultDescription = errorMessage;
        return contextReport;
      }
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

  try {
    // Iterates steps
    let stepExecutionFailed = false;
    for (let step of context.steps) {
      // Set step id if not defined
      if (!step.stepId) step.stepId = randomUUID();
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
  // POST /session can race a just-spawned-or-still-dying Appium on Windows:
  // /status may already return 200 from the outgoing process while /session
  // is no longer accepting. Retry with linear backoff ONLY on ECONNREFUSED --
  // any other error is a real session-creation failure and propagates.
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
      if (!/ECONNREFUSED/.test(String(err && err.message))) throw err;
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
