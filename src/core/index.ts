import { setConfig } from "./config.js";
import { detectTests } from "./detectTests.js";
import { resolveTests } from "./resolveTests.js";
import { log, cleanTemp } from "./utils.js";
import { runSpecs, runViaApi, getRunner } from "./tests.js";
import { telemetryNotice, sendTelemetry } from "./telem.js";
import { readFile, resolvePaths } from "./files.js";

export { runTests, getRunner, detectTests, detectAndResolveTests, resolveTests, readFile, resolvePaths };

const supportMessage = `
##########################################################################
# Thanks for using Doc Detective! If this project was helpful to you,    #
# please consider starring the repo on GitHub or sponsoring the project: #
# - GitHub Sponsors: https://github.com/sponsors/doc-detective           #
# - Open Collective: https://opencollective.com/doc-detective            #
##########################################################################`;

/**
 * Detects tests according to the given configuration and returns the resolved test set.
 *
 * @param config - Configuration used to detect and resolve tests
 * @returns The resolved tests object, or `null` if no tests were detected
 */
async function detectAndResolveTests({ config }: any) {
  config = await setConfig({ config });
  const detectedTests = await detectTests({ config });
  if (!detectedTests || detectedTests.length === 0) {
    log(config, "warning", "No tests detected.");
    return null;
  }
  const resolvedTests = await resolveTests({ config, detectedTests });
  return resolvedTests;
}

/**
 * Execute test specifications and return their execution results.
 *
 * If `options.resolvedTests` is provided it will be used instead of detecting and resolving tests.
 *
 * @param config - Runtime configuration used for detecting, resolving, selecting execution mode (API vs local), and telemetry
 * @param options - Optional settings. Recognized property: `resolvedTests` — a pre-resolved test set to run instead of performing detection/resolution
 * @returns The test run results object, or `null` if no tests could be resolved
 */
async function runTests(config: any, options: any = {}) {
  let resolvedTests: any;
  let results: any;

  if (options.resolvedTests) {
    resolvedTests = options.resolvedTests;
    config = resolvedTests.config;
  }

  // Telemetry notice
  telemetryNotice(config);

  if (!resolvedTests) {
    resolvedTests = await detectAndResolveTests({ config });
    if (!resolvedTests || resolvedTests.specs.length === 0) {
      log(config, "warn", "Couldn't resolve any tests.");
      return null;
    }
  }

  // If config.integrations.docDetectiveApi.apiKey is set, run tests via API instead of locally
  if (!process.env.DOC_DETECTIVE_API && config.integrations && config.integrations.docDetectiveApi && config.integrations.docDetectiveApi.apiKey) {
    // Run test specs via API
    results = await runViaApi({
      resolvedTests,
      apiKey: config.integrations.docDetectiveApi.apiKey,
    });
  } else {
    // Run test specs locally
    results = await runSpecs({ resolvedTests });
  }
  log(config, "info", "RESULTS:");
  log(config, "info", results);
  log(config, "info", "Cleaning up and finishing post-processing.");

  // Clean up
  cleanTemp();

  // Send telemetry
  sendTelemetry(config, "runTests", results);
  log(config, "info", supportMessage);

  return results;
}