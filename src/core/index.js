const { setConfig } = require("./config");
const { detectTests } = require("./detectTests");
const { resolveTests } = require("./resolveTests");
const { log, cleanTemp } = require("./utils");
const { runSpecs, runViaApi, getRunner } = require("./tests");
const { telemetryNotice, sendTelemetry } = require("./telem");
const { readFile, resolvePaths } = require("./files");

exports.runTests = runTests;
exports.getRunner = getRunner;
exports.detectTests = detectTests;
exports.detectAndResolveTests = detectAndResolveTests;
exports.resolveTests = resolveTests;
exports.readFile = readFile;
exports.resolvePaths = resolvePaths;

const supportMessage = `
##########################################################################
# Thanks for using Doc Detective! If this project was helpful to you,    #
# please consider starring the repo on GitHub or sponsoring the project: #
# - GitHub Sponsors: https://github.com/sponsors/doc-detective           #
# - Open Collective: https://opencollective.com/doc-detective            #
##########################################################################`;

/**
 * Detects and resolves tests based on the provided configuration.
 * Chains setConfig -> detectTests -> resolveTests.
 *
 * @async
 * @param {Object} options
 * @param {Object} options.config - The configuration object
 * @returns {Promise<Object|null>} Resolved tests object or null if none found
 */
async function detectAndResolveTests({ config }) {
  config = await setConfig({ config });
  const detectedTests = await detectTests({ config });
  if (!detectedTests || detectedTests.length === 0) {
    log(config, "warning", "No tests detected.");
    return null;
  }
  const resolvedTests = await resolveTests({ config, detectedTests });
  return resolvedTests;
}

// Run tests defined in specifications and documentation source files.
async function runTests(config, options = {}) {
  let resolvedTests;
  let results;

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
