import kill from "tree-kill";
import * as wdio from "webdriverio";
import os from "node:os";
import { log, replaceEnvs } from "./utils.js";
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
import { getEnvironment, getAvailableApps } from "./config.js";
import { uploadChangedFiles } from "./integrations/index.js";
import http from "node:http";
import https from "node:https";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export { runSpecs, runViaApi, getRunner };
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

// Get Appium driver capabilities and apply options.
function getDriverCapabilities({ runnerDetails, name, options }: { runnerDetails: any; name: any; options: any }): any {
  let capabilities: any = {};
  let args: string[] = [];

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
  test.steps.forEach((step: any) => {
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
  if (context?.browser?.name)
    isSupportedApp = apps.find((app: any) => app.name === context.browser.name);
  // Return boolean
  if (isSupportedApp && isSupportedPlatform) {
    return true;
  } else {
    return false;
  }
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
  else if (config.allowUnsafeSteps === false) return false;
  // if DOC_DETECTIVE.container is set to true, return true
  else if (process.env.DOC_DETECTIVE) {
    try {
      if (JSON.parse(process.env.DOC_DETECTIVE).container) return true;
    } catch {
      // Invalid JSON in DOC_DETECTIVE env var; treat as unset
    }
  }
  // If allowUnsafeSteps is not set, return false by default
  else return false;
}

// Run specifications via API.
async function runViaApi({ resolvedTests, apiKey, config = {} }: { resolvedTests: any; apiKey: any; config?: any }): Promise<any> {
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
 * Executes each spec -> test -> context -> step, conditionally starts Appium and browser drivers,
 * applies viewport/window sizing, handles unsafe-step policies and recording, aggregates per-step,
 * per-context, per-test, and per-spec results, and performs resource cleanup.
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
  const specs = resolvedTests.specs;

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
  if (appiumRequired) {
    // Set Appium home directory
    setAppiumHome();
    // Start Appium server
    appium = spawn("npx", ["appium"], {
      shell: true,
      windowsHide: true,
      cwd: path.join(__dirname, "../.."),
    });
    appium.stdout.on("data", (data: any) => {
      // console.log(`stdout: ${data}`);
    });
    appium.stderr.on("data", (data: any) => {
      // console.error(`stderr: ${data}`);
    });
    await appiumIsReady();
    log(config, "debug", "Appium is ready.");
  }

  // Iterate specs
  log(config, "info", "Running test specs.");
  for (const spec of specs) {
    log(config, "debug", `SPEC: ${spec.specId}`);

    // Set spec report
    let specReport: any = {
      specId: spec.specId,
      description: spec.description,
      contentPath: spec.contentPath,
      tests: [],
    };
    // Set meta values
    metaValues.specs[spec.specId] = { tests: {} };

    // Iterates tests
    for (const test of spec.tests) {
      log(config, "debug", `TEST: ${test.testId}`);

      // Set test report
      let testReport: any = {
        testId: test.testId,
        description: test.description,
        contentPath: test.contentPath,
        detectSteps: test.detectSteps,
        contexts: [],
      };
      // Set meta values
      metaValues.specs[spec.specId].tests[test.testId] = { contexts: [] };

      // Iterate contexts
      // TODO: Support both serial and parallel execution
      for (const context of test.contexts) {
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
        let contextReport: any = {
          contextId: context.contextId || randomUUID(),
          platform: context.platform,
          browser: context.browser,
          steps: [],
        };
        // Set meta values
        metaValues.specs[spec.specId].tests[test.testId].contexts[
          context.contextId
        ] = { steps: {} };

        // Check if current environment supports given contexts
        const supportedContext = isSupportedContext({
          context: context,
          apps: availableApps,
          platform: platform,
        });

        // If context isn't supported, skip it
        if (!supportedContext) {
          log(
            config,
            "info",
            `Skipping context. The current system doesn't support this context: {"platform": "${
              context.platform
            }", "apps": ${JSON.stringify(context.apps)}}`
          );
          contextReport = { result: "SKIPPED", ...contextReport };
          report.summary.contexts.skipped++;
          testReport.contexts.push(contextReport);
          continue;
        }
        log(config, "debug", `CONTEXT:\n${JSON.stringify(context, null, 2)}`);

        let driver: any;
        // Ensure context contains a 'steps' property
        if (!context.steps) {
          context.steps = [];
        }
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
          log(config, "debug", "CAPABILITIES:");
          log(config, "debug", caps);

          // Instantiate driver
          try {
            driver = await driverStart(caps);
          } catch (error: any) {
            try {
              // If driver fails to start, try again as headless
              log(
                config,
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
              driver = await driverStart(caps);
            } catch (error: any) {
              let errorMessage = `Failed to start context '${context.browser?.name}' on '${platform}'.`;
              if (context.browser?.name === "safari")
                errorMessage =
                  errorMessage +
                  " Make sure you've run `safaridriver --enable` in a terminal and enabled 'Allow Remote Automation' in Safari's Develop menu.";
              log(config, "error", errorMessage);
              contextReport = {
                result: "SKIPPED",
                resultDescription: errorMessage,
                ...contextReport,
              };
              report.summary.contexts.skipped++;
              testReport.contexts.push(contextReport);
              continue;
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

        // Iterates steps
        let stepExecutionFailed = false;
        for (let step of context.steps) {
          // Set step id if not defined
          if (!step.stepId) step.stepId = randomUUID();
          log(config, "debug", `STEP:\n${JSON.stringify(step, null, 2)}`);

          if (step.unsafe && runnerDetails.allowUnsafeSteps === false) {
            log(
              config,
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
            report.summary.steps.skipped++;
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
            report.summary.steps.skipped++;
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
          log(
            config,
            "debug",
            `RESULT: ${stepResult.status}\n${JSON.stringify(
              stepResult,
              null,
              2
            )}`
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
          report.summary.steps[stepReport.result.toLowerCase()]++;

          // If this step failed, set flag to skip remaining steps
          if (stepReport.result === "FAIL") {
            stepExecutionFailed = true;
          }
        }

        // If recording, stop recording
        if (config.recording) {
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
            ...stepResult,
            ...stopRecordStep,
          };
          contextReport.steps.push(stepReport);
          report.summary.steps[stepReport.result.toLowerCase()]++;
        }

        // Parse step results to calc context result

        // If any step fails, context fails
        let contextResult: string;
        if (contextReport.steps.find((step: any) => step.result === "FAIL"))
          contextResult = "FAIL";
        // If any step warns, context warns
        else if (contextReport.steps.find((step: any) => step.result === "WARNING"))
          contextResult = "WARNING";
        // If all steps skipped, context skipped
        else if (
          contextReport.steps.length ===
          contextReport.steps.filter((step: any) => step.result === "SKIPPED").length
        )
          contextResult = "SKIPPED";
        // If all steps pass, context passes
        else contextResult = "PASS";

        contextReport = { result: contextResult, ...contextReport };
        testReport.contexts.push(contextReport);
        report.summary.contexts[contextResult.toLowerCase()]++;

        if (driverRequired) {
          // Close driver
          try {
            await driver.deleteSession();
          } catch (error: any) {
            log(
              config,
              "error",
              `Failed to delete driver session: ${error.message}`
            );
          }
        }
      }

      // Parse context results to calc test result

      // If any context fails, test fails
      let testResult: string;
      if (testReport.contexts.find((context: any) => context.result === "FAIL"))
        testResult = "FAIL";
      // If any context warns, test warns
      else if (
        testReport.contexts.find((context: any) => context.result === "WARNING")
      )
        testResult = "WARNING";
      // If all contexts skipped, test skipped
      else if (
        testReport.contexts.length ===
        testReport.contexts.filter((context: any) => context.result === "SKIPPED")
          .length
      )
        testResult = "SKIPPED";
      // If all contexts pass, test passes
      else testResult = "PASS";

      testReport = { result: testResult, ...testReport };
      specReport.tests.push(testReport);
      report.summary.tests[testResult.toLowerCase()]++;
    }

    // Parse test results to calc spec result

    // If any context fails, test fails
    let specResult: string;
    if (specReport.tests.find((test: any) => test.result === "FAIL"))
      specResult = "FAIL";
    // If any test warns, spec warns
    else if (specReport.tests.find((test: any) => test.result === "WARNING"))
      specResult = "WARNING";
    // If all tests skipped, spec skipped
    else if (
      specReport.tests.length ===
      specReport.tests.filter((test: any) => test.result === "SKIPPED").length
    )
      specResult = "SKIPPED";
    // If all contexts pass, test passes
    else specResult = "PASS";

    specReport = { result: specResult, ...specReport };
    report.specs.push(specReport);
    report.summary.specs[specResult.toLowerCase()]++;
  }

  // Close appium server
  if (appium) {
    log(config, "debug", "Closing Appium server");
    kill(appium.pid);
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
    config.recording = actionResult.recording;
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
  if (config?.recording) {
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
async function appiumIsReady(timeoutMs: number = 120000) {
  let isReady = false;
  const start = Date.now();
  while (!isReady) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`Appium server failed to start within ${timeoutMs / 1000} seconds`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
    try {
      let resp = await axios.get("http://127.0.0.1:4723/status");
      if (resp.status === 200) isReady = true;
    } catch {}
  }
  return isReady;
}

// Start the Appium driver specified in `capabilities`.
async function driverStart(capabilities: any) {
  const driver: any = await wdio.remote({
    protocol: "http",
    hostname: "127.0.0.1",
    port: 4723,
    path: "/",
    logLevel: "error",
    capabilities,
    connectionRetryTimeout: 120000, // 2 minutes
    waitforTimeout: 120000, // 2 minutes
  });
  driver.state = { url: "", x: null, y: null };
  return driver;
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
async function getRunner(options: any = {}) {
  const environment = getEnvironment();
  const config = { ...options.config, environment };
  const width = options.width || 1200;
  const height = options.height || 800;
  const headless = options.headless !== false;

  // Get runner details
  const runnerDetails = {
    environment,
    availableApps: await getAvailableApps({ config }),
  };

  // Check if Chrome is available
  const chrome = runnerDetails.availableApps.find(
    (app: any) => app.name === "chrome"
  );
  if (!chrome) {
    throw new Error(
      "Chrome browser is not available. Please ensure Chrome is installed and accessible."
    );
  }

  // Set Appium home directory
  setAppiumHome();

  // Start Appium server
  const appium = spawn("npx", ["appium"], {
    shell: true,
    windowsHide: true,
    cwd: path.join(__dirname, "../.."),
  });

  // Wait for Appium to be ready
  await appiumIsReady();
  log(config, "debug", "Appium is ready for external driver.");

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
    runner = await driverStart(caps);
  } catch (error: any) {
    // If runner fails, attempt to set headless and retry
    try {
      log(
        config,
        "warning",
        "Failed to start Chrome runner. Retrying as headless."
      );
      caps["goog:chromeOptions"].args.push("--headless", "--disable-gpu");
      runner = await driverStart(caps);
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
