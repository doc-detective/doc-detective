const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const { validate, resolvePaths, readFile } = require("doc-detective-common");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");
const axios = require("axios");

exports.setArgs = setArgs;
exports.setConfig = setConfig;
exports.outputResults = outputResults;
exports.spawnCommand = spawnCommand;
exports.setMeta = setMeta;
exports.getVersionData = getVersionData;
exports.log = log;
exports.getResolvedTestsFromEnv = getResolvedTestsFromEnv;
exports.reportResults = reportResults;

// Log function that respects logLevel
function log(message, level = "info", config = {}) {
  const logLevels = ["silent", "error", "warning", "info", "debug"];
  const currentLevel = config.logLevel || "info";
  const currentLevelIndex = logLevels.indexOf(currentLevel);
  const messageLevelIndex = logLevels.indexOf(level);

  // Only log if the message level is at or above the current log level
  if (currentLevelIndex >= messageLevelIndex && messageLevelIndex > 0) {
    if (level === "error") {
      console.error(message);
    } else {
      console.log(message);
    }
  }
}

// Define args
function setArgs(args) {
  if (!args) return {};
  let argv = yargs(hideBin(args))
    .option("config", {
      alias: "c",
      description: "Path to a `config.json` or `config.yaml` file.",
      type: "string",
    })
    .option("input", {
      alias: "i",
      description:
        "Path to test specifications and documentation source files. May be paths to specific files or to directories to scan for files.",
      type: "string",
    })
    .option("output", {
      alias: "o",
      description:
        "Path of the directory in which to store the output of Doc Detective commands.",
      type: "string",
    })
    .option("logLevel", {
      alias: "l",
      description:
        "Detail level of logging events. Accepted values: silent, error, warning, info (default), debug",
      type: "string",
    })
    .option("allow-unsafe", {
      description: "Allow execution of potentially unsafe tests",
      type: "boolean",
    })
    .help()
    .alias("help", "h").argv;

  return argv;
}

// Get resolved tests from environment variable, if set
async function getResolvedTestsFromEnv(config = {}) {
  if (!process.env.DOC_DETECTIVE_API) {
    return null;
  }

  let resolvedTests = null;
  let apiConfig = null;
  try {
    // Parse the environment variable as JSON
    apiConfig = JSON.parse(process.env.DOC_DETECTIVE_API);

    // Validate the structure: { accountId, url, token, contextIds }
    if (!apiConfig.accountId || !apiConfig.url || !apiConfig.token || !apiConfig.contextIds) {
      log(
        "Invalid DOC_DETECTIVE_API: must contain 'accountId', 'url', 'token', and 'contextIds' properties",
        "error",
        config
      );
      process.exit(1);
    }

    log(`CLI:Fetching resolved tests from ${apiConfig.url}/resolved-tests`, "debug", config);

    // Make GET request to the specified URL with token in header
    const response = await axios.get(`${apiConfig.url}/resolved-tests`, {
      headers: {
        "x-runner-token": apiConfig.token,
      },
    });

    // The response is the resolvedTests
    resolvedTests = response.data;

    // Validate against resolvedTests_v3 schema
    const validation = validate({
      schemaKey: "resolvedTests_v3",
      object: resolvedTests,
    });

    if (!validation.valid) {
      log(
        "Invalid resolvedTests from API response. " + validation.errors,
        "error",
        config
      );
      process.exit(1);
    }

    // Get config from environment variable for merging
    const envConfig = await getConfigFromEnv();
    if (envConfig) {
      // Apply config overrides to resolvedTests.config
      if (resolvedTests.config) {
        resolvedTests.config = { ...resolvedTests.config, ...envConfig };
      } else {
        resolvedTests.config = envConfig;
      }
    }

    log(
      `CLI:RESOLVED_TESTS:\n${JSON.stringify(resolvedTests, null, 2)}`,
      "debug",
      config
    );
  } catch (error) {
    log(
      `Error fetching resolved tests from DOC_DETECTIVE_API: ${error.message}`,
      "error",
      config
    );
    process.exit(1);
  }
  return { apiConfig, resolvedTests };
}

async function getConfigFromEnv() {
  if (!process.env.DOC_DETECTIVE_CONFIG) {
    return null;
  }

  let envConfig = null;
  try {
    // Parse the environment variable as JSON
    envConfig = JSON.parse(process.env.DOC_DETECTIVE_CONFIG);

    // Validate the environment variable config
    const envValidation = validate({
      schemaKey: "config_v3",
      object: envConfig,
    });

    if (!envValidation.valid) {
      console.error(
        "Invalid config from DOC_DETECTIVE_CONFIG environment variable.",
        envValidation.errors
      );
      process.exit(1);
    }

    log(`CLI:ENV_CONFIG:\n${JSON.stringify(envConfig, null, 2)}`, "debug", envConfig);
  } catch (error) {
    console.error(
      `Error parsing DOC_DETECTIVE_CONFIG environment variable: ${error.message}`
    );
    process.exit(1);
  }
  return envConfig;
}

// Override config values based on args and validate the config
async function setConfig({ configPath, args }) {
  if (args.config && !configPath) {
    configPath = args.config;
  }

  // If config file exists, read it
  let config = {};
  if (configPath) {
    try {
      config = await readFile({ fileURLOrPath: configPath });
    } catch (error) {
      console.error(`Error reading config file at ${configPath}: ${error}`);
      return null;
    }
  }

  // Check for DOC_DETECTIVE_CONFIG environment variable
  const envConfig = await getConfigFromEnv();
  if (envConfig) {
    // Merge with file config, preferring environment variable config (use raw envConfig, not validated with defaults)
    config = { ...config, ...envConfig };
  }

  // Validate config
  const validation = validate({
    schemaKey: "config_v3",
    object: config,
  });
  if (!validation.valid) {
    // Output validation errors
    console.error("Invalid config.", validation.errors);
    process.exit(1);
  }

  // Accept coerced and defaulted values
  config = validation.object;
  // Set default values
  config = {
    ...config,
    input: config.input || ".",
    output: config.output || ".",
    recursive: config.recursive ?? true,
    relativePathBase: config.relativePathBase || "file",
    loadVariables: config.loadVariables || ".env",
    detectSteps: config.detectSteps ?? true,
    logLevel: config.logLevel || "info",
    fileTypes: config.fileTypes || ["markdown", "asciidoc", "html"],
    telemetry: config.telemetry || { send: true },
  };
  // Override config values
  if (configPath) {
    config.configPath = configPath;
  }
  if (args.input) {
    // If input includes commas, split it into an array
    args.input = args.input.split(",").map((item) => item.trim());
    // Resolve paths
    args.input = args.input.map((item) => {
      if (item.startsWith("https://") || item.startsWith("http://")) {
        return item; // Don't resolve URLs
      }
      return path.resolve(item);
    });
    // Add to config
    config.input = args.input;
  }
  if (args.output) {
    config.output = path.resolve(args.output);
  }
  if (args.logLevel) {
    config.logLevel = args.logLevel;
  }
  if (typeof args.allowUnsafe === "boolean") {
    config.allowUnsafeSteps = args.allowUnsafe;
  }
  // Resolve paths
  config = await resolvePaths({
    config: config,
    object: config,
    filePath: configPath || ".",
    nested: false,
    objectType: "config",
  });

  return config;
}

// Internal reporters
const reporters = {
  // JSON reporter: outputs results to a JSON file
  jsonReporter: async (config = {}, outputPath, results, options = {}) => {
    // Define supported output extensions
    const outputExtensions = [".json"];

    // Normalize output path
    outputPath = path.resolve(outputPath);

    let data = JSON.stringify(results, null, 2);
    let outputFile = "";
    let outputDir = "";
    let reportType = "doc-detective-results";
    if (options.command) {
      if (options.command === "runCoverage") {
        reportType = "coverageResults";
      } else if (options.command === "runTests") {
        reportType = "testResults";
      }
    }

    // Detect if output ends with a supported extension
    if (outputExtensions.some((ext) => outputPath.endsWith(ext))) {
      outputDir = path.dirname(outputPath);
      outputFile = outputPath;
      // If outputFile already exists, add a counter to the filename
      if (fs.existsSync(outputFile)) {
        let counter = 0;
        while (fs.existsSync(outputFile.replace(".json", `-${counter}.json`))) {
          counter++;
        }
        outputFile = outputFile.replace(".json", `-${counter}.json`);
      }
    } else {
      outputDir = outputPath;
      outputFile = path.resolve(outputDir, `${reportType}-${Date.now()}.json`);
    }

    try {
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write results to output file
      fs.writeFileSync(outputFile, data);
      console.log(`See detailed results at ${outputFile}\n`);
      return outputFile;
    } catch (err) {
      console.error(`Error writing results to ${outputFile}. ${err}`);
      return null;
    }
  },

  // Terminal reporter: outputs a summary to the terminal
  terminalReporter: async (config = {}, outputPath, results, options = {}) => {
    // Defines colors for terminal output
    const colors = {
      red: "\x1b[31m",
      green: "\x1b[32m",
      yellow: "\x1b[33m",
      cyan: "\x1b[36m",
      reset: "\x1b[0m",
      bold: "\x1b[1m",
    };

    // Check if we have the new results format with summary
    if (!results) {
      console.log("No results available.");
      return;
    }

    // Handle results that have a summary section
    if (results.summary) {
      // Extract summary data
      const { specs, tests, contexts, steps } = results.summary;

      // Calculate totals
      const totalSpecs = specs
        ? specs.pass + specs.fail + specs.warning + specs.skipped
        : 0;
      const totalTests = tests
        ? tests.pass + tests.fail + tests.warning + tests.skipped
        : 0;
      const totalContexts = contexts
        ? contexts.pass + contexts.fail + contexts.warning + contexts.skipped
        : 0;
      const totalSteps = steps
        ? steps.pass + steps.fail + steps.warning + steps.skipped
        : 0;

      // Any failures overall?
      const hasFailures =
        (specs && specs.fail > 0) ||
        (tests && tests.fail > 0) ||
        (contexts && contexts.fail > 0) ||
        (steps && steps.fail > 0);

      // Any skipped overall?
      const allSpecsSkipped =
        specs && specs.pass === 0 && specs.fail === 0 && specs.skipped > 0;

      console.log(
        `\n${colors.bold}===== Doc Detective Results Summary =====${colors.reset}`
      );

      // Print specs summary if available
      if (specs) {
        console.log(`\n${colors.bold}Specs:${colors.reset}`);
        console.log(`Total: ${totalSpecs}`);
        if (specs.pass > 0) {
          console.log(`${colors.green}Passed: ${specs.pass}${colors.reset}`);
        } else {
          console.log(`Passed: ${specs.pass}`);
        }
        console.log(
          `${specs.fail > 0 ? colors.red : colors.green}Failed: ${specs.fail}${
            colors.reset
          }`
        );
        if (specs.warning > 0)
          console.log(
            `${colors.yellow}Warnings: ${specs.warning}${colors.reset}`
          );
        if (specs.skipped > 0)
          console.log(
            `${colors.yellow}Skipped: ${specs.skipped}${colors.reset}`
          );
      }

      // Print tests summary if available
      if (tests) {
        console.log(`\n${colors.bold}Tests:${colors.reset}`);
        console.log(`Total: ${totalTests}`);
        if (tests.pass > 0) {
          console.log(`${colors.green}Passed: ${tests.pass}${colors.reset}`);
        } else {
          console.log(`Passed: ${tests.pass}`);
        }
        console.log(
          `${tests.fail > 0 ? colors.red : colors.green}Failed: ${tests.fail}${
            colors.reset
          }`
        );
        if (tests.warning > 0)
          console.log(
            `${colors.yellow}Warnings: ${tests.warning}${colors.reset}`
          );
        if (tests.skipped > 0)
          console.log(
            `${colors.yellow}Skipped: ${tests.skipped}${colors.reset}`
          );
      }

      // Print contexts summary if available
      if (contexts) {
        console.log(`\n${colors.bold}Contexts:${colors.reset}`);
        console.log(`Total: ${totalContexts}`);
        if (contexts.pass > 0) {
          console.log(`${colors.green}Passed: ${contexts.pass}${colors.reset}`);
        } else {
          console.log(`Passed: ${contexts.pass}`);
        }
        console.log(
          `${contexts.fail > 0 ? colors.red : colors.green}Failed: ${
            contexts.fail
          }${colors.reset}`
        );
        if (contexts.warning > 0)
          console.log(
            `${colors.yellow}Warnings: ${contexts.warning}${colors.reset}`
          );
        if (contexts.skipped > 0)
          console.log(
            `${colors.yellow}Skipped: ${contexts.skipped}${colors.reset}`
          );
      }

      // Print steps summary if available
      if (steps) {
        console.log(`\n${colors.bold}Steps:${colors.reset}`);
        console.log(`Total: ${totalSteps}`);
        if (steps.pass > 0) {
          console.log(`${colors.green}Passed: ${steps.pass}${colors.reset}`);
        } else {
          console.log(`Passed: ${steps.pass}`);
        }
        console.log(
          `${steps.fail > 0 ? colors.red : colors.green}Failed: ${steps.fail}${
            colors.reset
          }`
        );
        if (steps.warning > 0)
          console.log(
            `${colors.yellow}Warnings: ${steps.warning}${colors.reset}`
          );
        if (steps.skipped > 0)
          console.log(
            `${colors.yellow}Skipped: ${steps.skipped}${colors.reset}`
          );
      }

      // If all specs were skipped, call it out
      if (allSpecsSkipped) {
        console.log(
          `\n${colors.yellow}⚠️  All items were skipped. No specs passed or failed. ⚠️${colors.reset}`
        );
      }

      // If we have specs with failures, display them
      if (results.specs && hasFailures) {
        console.log(
          `\n${colors.bold}${colors.red}Failed Items:${colors.reset}`
        );

        // Collect failures
        const failedSpecs = [];
        const failedTests = [];
        const failedContexts = [];
        const failedSteps = [];

        // Collect skipped
        const skippedSpecs = [];
        const skippedTests = [];
        const skippedContexts = [];
        const skippedSteps = [];

        // Process specs array to collect failures and skipped
        results.specs.forEach((spec, specIndex) => {
          // Check if spec has failed
          if (spec.result === "FAIL") {
            failedSpecs.push({
              index: specIndex,
              id: spec.specId || `Spec ${specIndex + 1}`,
            });
          }
          // Check if spec was skipped
          if (spec.result === "SKIPPED") {
            skippedSpecs.push({
              index: specIndex,
              id: spec.specId || `Spec ${specIndex + 1}`,
            });
          }

          // Process tests in this spec
          if (spec.tests && spec.tests.length > 0) {
            spec.tests.forEach((test, testIndex) => {
              // Check if test has failed
              if (test.result === "FAIL") {
                failedTests.push({
                  specIndex,
                  testIndex,
                  specId: spec.specId || `Spec ${specIndex + 1}`,
                  id: test.testId || `Test ${testIndex + 1}`,
                });
              }
              // Check if test was skipped
              if (test.result === "SKIPPED") {
                skippedTests.push({
                  specIndex,
                  testIndex,
                  specId: spec.specId || `Spec ${specIndex + 1}`,
                  id: test.testId || `Test ${testIndex + 1}`,
                });
              }

              // Process contexts in this test
              if (test.contexts && test.contexts.length > 0) {
                test.contexts.forEach((context, contextIndex) => {
                  // Check if context has failed
                  if (
                    context.result === "FAIL" ||
                    (context.result && context.result.status === "FAIL")
                  ) {
                    failedContexts.push({
                      specIndex,
                      testIndex,
                      contextIndex,
                      specId: spec.specId || `Spec ${specIndex + 1}`,
                      testId: test.testId || `Test ${testIndex + 1}`,
                      platform: context.platform || "unknown",
                      browser: context.browser
                        ? context.browser.name
                        : "unknown",
                    });
                  }
                  // Check if context was skipped
                  if (
                    context.result === "SKIPPED" ||
                    (context.result && context.result.status === "SKIPPED")
                  ) {
                    skippedContexts.push({
                      specIndex,
                      testIndex,
                      contextIndex,
                      specId: spec.specId || `Spec ${specIndex + 1}`,
                      testId: test.testId || `Test ${testIndex + 1}`,
                      platform: context.platform || "unknown",
                      browser: context.browser
                        ? context.browser.name
                        : "unknown",
                    });
                  }

                  // Process steps in this context
                  if (context.steps && context.steps.length > 0) {
                    context.steps.forEach((step, stepIndex) => {
                      // Check if step has failed
                      if (step.result === "FAIL") {
                        failedSteps.push({
                          specIndex,
                          testIndex,
                          contextIndex,
                          stepIndex,
                          specId: spec.specId || `Spec ${specIndex + 1}`,
                          testId: test.testId || `Test ${testIndex + 1}`,
                          platform: context.platform || "unknown",
                          browser: context.browser
                            ? context.browser.name
                            : "unknown",
                          stepId: step.stepId || `Step ${stepIndex + 1}`,
                          error: step.resultDescription || "Unknown error",
                        });
                      }
                      // Check if step was skipped
                      if (step.result === "SKIPPED") {
                        skippedSteps.push({
                          specIndex,
                          testIndex,
                          contextIndex,
                          stepIndex,
                          specId: spec.specId || `Spec ${specIndex + 1}`,
                          testId: test.testId || `Test ${testIndex + 1}`,
                          platform: context.platform || "unknown",
                          browser: context.browser
                            ? context.browser.name
                            : "unknown",
                          stepId: step.stepId || `Step ${stepIndex + 1}`,
                        });
                      }
                    });
                  }
                });
              }
            });
          }
        });

        // Display failures
        if (failedSpecs.length > 0) {
          console.log(`\n${colors.red}Failed Specs:${colors.reset}`);
          failedSpecs.forEach((item, i) => {
            console.log(`${colors.red}${i + 1}. ${item.id}${colors.reset}`);
          });
        }

        if (failedTests.length > 0) {
          console.log(`\n${colors.red}Failed Tests:${colors.reset}`);
          failedTests.forEach((item, i) => {
            console.log(
              `${colors.red}${i + 1}. ${item.id} (from ${item.specId})${
                colors.reset
              }`
            );
          });
        }

        if (failedContexts.length > 0) {
          console.log(`\n${colors.red}Failed Contexts:${colors.reset}`);
          failedContexts.forEach((item, i) => {
            console.log(
              `${colors.red}${i + 1}. ${item.platform}/${item.browser} (from ${
                item.testId
              })${colors.reset}`
            );
          });
        }

        if (failedSteps.length > 0) {
          console.log(`\n${colors.red}Failed Steps:${colors.reset}`);
          failedSteps.forEach((item, i) => {
            console.log(
              `${colors.red}${i + 1}. ${item.platform}/${item.browser} - ${
                item.stepId
              }${colors.reset}`
            );
            console.log(`   Error: ${item.error}`);
          });
        }

        // Display skipped items in yellow
        if (skippedSpecs.length > 0) {
          console.log(`\n${colors.yellow}Skipped Specs:${colors.reset}`);
          skippedSpecs.forEach((item, i) => {
            console.log(`${colors.yellow}${i + 1}. ${item.id}${colors.reset}`);
          });
        }
        if (skippedTests.length > 0) {
          console.log(`\n${colors.yellow}Skipped Tests:${colors.reset}`);
          skippedTests.forEach((item, i) => {
            console.log(
              `${colors.yellow}${i + 1}. ${item.id} (from ${item.specId})${
                colors.reset
              }`
            );
          });
        }
        if (skippedContexts.length > 0) {
          console.log(`\n${colors.yellow}Skipped Contexts:${colors.reset}`);
          skippedContexts.forEach((item, i) => {
            console.log(
              `${colors.yellow}${i + 1}. ${item.platform}/${
                item.browser
              } (from ${item.testId})${colors.reset}`
            );
          });
        }
        if (skippedSteps.length > 0) {
          console.log(`\n${colors.yellow}Skipped Steps:${colors.reset}`);
          skippedSteps.forEach((item, i) => {
            console.log(
              `${colors.yellow}${i + 1}. ${item.platform}/${item.browser} - ${
                item.stepId
              }${colors.reset}`
            );
          });
        }
      } else if (!hasFailures && !allSpecsSkipped) {
        // Celebration when all tests pass
        console.log(`\n${colors.green}🎉 All items passed! 🎉${colors.reset}`);
      }
    } else {
      console.log(
        "No tests were executed or results are in an unknown format."
      );
    }

    console.log("\n===============================\n");
  },

  // HTML reporter: outputs results to a self-contained HTML file
  htmlReporter: async (config = {}, outputPath, results, options = {}) => {
    // Define supported output extensions
    const outputExtensions = [".html", ".htm"];

    // Normalize output path
    outputPath = path.resolve(outputPath);

    let outputFile = "";
    let outputDir = "";
    let reportType = "doc-detective-results";
    if (options.command) {
      if (options.command === "runCoverage") {
        reportType = "coverageResults";
      } else if (options.command === "runTests") {
        reportType = "testResults";
      }
    }

    // Detect if output ends with a supported extension
    if (outputExtensions.some((ext) => outputPath.endsWith(ext))) {
      outputDir = path.dirname(outputPath);
      outputFile = outputPath;
      // If outputFile already exists, add a counter to the filename
      const ext = outputPath.endsWith(".htm") ? ".htm" : ".html";
      if (fs.existsSync(outputFile)) {
        let counter = 0;
        const maxCounter = 1000; // Prevent infinite loop
        while (fs.existsSync(outputFile.replace(ext, `-${counter}${ext}`)) && counter < maxCounter) {
          counter++;
        }
        if (counter >= maxCounter) {
          console.error(`Error: Too many existing HTML report files with the same name.`);
          return null;
        }
        outputFile = outputFile.replace(ext, `-${counter}${ext}`);
      }
    } else {
      outputDir = outputPath;
      outputFile = path.resolve(outputDir, `${reportType}-${Date.now()}.html`);
    }

    // Generate HTML content
    const htmlContent = generateHtmlReport(results, options);

    try {
      // Create output directory if it doesn't exist
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      // Write results to output file
      fs.writeFileSync(outputFile, htmlContent);
      console.log(`See HTML report at ${outputFile}\n`);
      return outputFile;
    } catch (err) {
      console.error(`Error writing HTML report to ${outputFile}. ${err}`);
      return null;
    }
  },
};

// Helper function to escape HTML characters
function escapeHtml(text) {
  if (!text) return '';
  const str = String(text);
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Helper function to sanitize a value for use in CSS class names
// Only allows known valid result values to prevent CSS injection
function sanitizeResultClass(result) {
  const validResults = ['pass', 'fail', 'warning', 'skipped', 'unknown'];
  const normalizedResult = String(result || 'unknown').toLowerCase();
  return validResults.includes(normalizedResult) ? normalizedResult : 'unknown';
}

// Helper function to format step details
function formatStepDetails(step) {
  const details = [];
  
  if (step.url) details.push('URL: ' + escapeHtml(step.url));
  if (step.selector) details.push('Selector: ' + escapeHtml(step.selector));
  if (step.command) details.push('Command: ' + escapeHtml(step.command));
  if (step.method) details.push('Method: ' + escapeHtml(step.method));
  if (step.path) details.push('Path: ' + escapeHtml(step.path));
  if (step.args && step.args.length > 0) details.push('Args: ' + escapeHtml(JSON.stringify(step.args)));
  if (step.statusCodes && step.statusCodes.length > 0) details.push('Status Codes: ' + escapeHtml(step.statusCodes.join(', ')));
  
  return details.length > 0 ? details.join(' | ') : '';
}

// Helper function to generate step HTML
function generateStepHtml(step, stepIndex) {
  const stepResult = step.result || 'UNKNOWN';
  const stepResultClass = sanitizeResultClass(stepResult);
  const stepAction = step.action || 'unknown';
  const stepDescription = step.resultDescription || '';
  const stepDetails = formatStepDetails(step);
  
  var html = '<div class="step ' + stepResultClass + '">';
  html += '<div class="step-header">';
  html += '<span class="step-number">' + (stepIndex + 1) + '</span>';
  html += '<span class="step-action">' + escapeHtml(stepAction) + '</span>';
  html += '<span class="result-badge ' + stepResultClass + '">' + escapeHtml(stepResult) + '</span>';
  html += '</div>';
  if (stepDescription) {
    html += '<p class="step-description">' + escapeHtml(stepDescription) + '</p>';
  }
  if (stepDetails) {
    html += '<div class="step-details">' + stepDetails + '</div>';
  }
  html += '</div>';
  return html;
}

// Helper function to generate context HTML
function generateContextHtml(context) {
  const ctxResult = context.result || 'UNKNOWN';
  const ctxResultClass = sanitizeResultClass(ctxResult);
  const ctxApp = context.app || 'unknown';
  const ctxPlatform = context.platform || 'unknown';
  
  var stepsHtml = '';
  if (context.steps && context.steps.length > 0) {
    context.steps.forEach(function(step, stepIndex) {
      stepsHtml += generateStepHtml(step, stepIndex);
    });
  } else {
    stepsHtml = '<p class="no-steps">No steps found.</p>';
  }
  
  var html = '<div class="context ' + ctxResultClass + '">';
  html += '<div class="context-header">';
  html += '<span class="context-info">';
  html += '<span class="platform">' + escapeHtml(ctxPlatform) + '</span>';
  html += '<span class="app">' + escapeHtml(ctxApp) + '</span>';
  html += '</span>';
  html += '<span class="result-badge ' + ctxResultClass + '">' + escapeHtml(ctxResult) + '</span>';
  html += '</div>';
  html += '<div class="steps">' + stepsHtml + '</div>';
  html += '</div>';
  return html;
}

// Helper function to generate test HTML
function generateTestHtml(test, testIndex) {
  const testResult = test.result || 'UNKNOWN';
  const testResultClass = sanitizeResultClass(testResult);
  const testId = escapeHtml(test.id || 'Test ' + (testIndex + 1));
  
  var contextsHtml = '';
  if (test.contexts && test.contexts.length > 0) {
    test.contexts.forEach(function(context) {
      contextsHtml += generateContextHtml(context);
    });
  } else {
    contextsHtml = '<p class="no-contexts">No contexts found.</p>';
  }
  
  var html = '<div class="test ' + testResultClass + '">';
  html += '<div class="test-header">';
  html += '<h4>' + testId + '</h4>';
  html += '<span class="result-badge ' + testResultClass + '">' + escapeHtml(testResult) + '</span>';
  html += '</div>';
  if (test.description) {
    html += '<p class="description">' + escapeHtml(test.description) + '</p>';
  }
  html += '<div class="contexts">' + contextsHtml + '</div>';
  html += '</div>';
  return html;
}

// Helper function to generate spec HTML
function generateSpecHtml(spec, specIndex) {
  const specResult = spec.result || 'UNKNOWN';
  const specResultClass = sanitizeResultClass(specResult);
  const specId = escapeHtml(spec.id || 'Spec ' + (specIndex + 1));
  
  var testsHtml = '';
  if (spec.tests && spec.tests.length > 0) {
    spec.tests.forEach(function(test, testIndex) {
      testsHtml += generateTestHtml(test, testIndex);
    });
  } else {
    testsHtml = '<p class="no-tests">No tests found.</p>';
  }
  
  var html = '<div class="spec ' + specResultClass + '">';
  html += '<div class="spec-header">';
  html += '<h3>' + specId + '</h3>';
  html += '<span class="result-badge ' + specResultClass + '">' + escapeHtml(specResult) + '</span>';
  html += '</div>';
  html += '<div class="tests">' + testsHtml + '</div>';
  html += '</div>';
  return html;
}

// Helper function to generate the HTML report content
function generateHtmlReport(results, options) {
  // Green-based color scheme
  const colors = {
    primaryDark: "#1b5e20",
    primary: "#2e7d32",
    primaryLight: "#4caf50",
    primaryBg: "#e8f5e9",
    pass: "#2e7d32",
    passLight: "#c8e6c9",
    fail: "#c62828",
    failLight: "#ffcdd2",
    warning: "#f57f17",
    warningLight: "#fff9c4",
    skipped: "#757575",
    skippedLight: "#f5f5f5",
    text: "#212121",
    textSecondary: "#616161",
    background: "#fafafa",
    card: "#ffffff",
    border: "#e0e0e0"
  };

  const timestamp = new Date().toLocaleString();

  // Handle empty/null results
  var summary = { specs: {}, tests: {}, contexts: {}, steps: {} };
  var specs = [];
  
  if (results) {
    summary = results.summary || {
      specs: { pass: 0, fail: 0, warning: 0, skipped: 0 },
      tests: { pass: 0, fail: 0, warning: 0, skipped: 0 },
      contexts: { pass: 0, fail: 0, warning: 0, skipped: 0 },
      steps: { pass: 0, fail: 0, warning: 0, skipped: 0 }
    };
    specs = results.specs || [];
  }

  // Extract metadata from results and options
  var inputFiles = [];
  var duration = null;
  
  // Get input files from options/config if available
  if (options && options.config && options.config.input) {
    var input = options.config.input;
    if (Array.isArray(input)) {
      inputFiles = input;
    } else if (typeof input === 'string') {
      inputFiles = [input];
    }
  }
  
  // Get duration from results if available
  if (results && results.duration) {
    duration = results.duration;
  } else if (results && results.startTime && results.endTime) {
    duration = results.endTime - results.startTime;
  }
  
  // Collect unique file sources from specs
  if (specs && specs.length > 0) {
    specs.forEach(function(spec) {
      if (spec.file && inputFiles.indexOf(spec.file) === -1) {
        inputFiles.push(spec.file);
      }
      if (spec.source && inputFiles.indexOf(spec.source) === -1) {
        inputFiles.push(spec.source);
      }
    });
  }

  // Calculate totals
  function calcTotal(stat) {
    return stat ? (stat.pass || 0) + (stat.fail || 0) + (stat.warning || 0) + (stat.skipped || 0) : 0;
  }
  const totalSpecs = calcTotal(summary.specs);
  const totalTests = calcTotal(summary.tests);
  const totalContexts = calcTotal(summary.contexts);
  const totalSteps = calcTotal(summary.steps);

  // Determine overall status
  const hasFailures = 
    (summary.specs && summary.specs.fail > 0) ||
    (summary.tests && summary.tests.fail > 0) ||
    (summary.contexts && summary.contexts.fail > 0) ||
    (summary.steps && summary.steps.fail > 0);

  const hasWarnings = 
    (summary.specs && summary.specs.warning > 0) ||
    (summary.tests && summary.tests.warning > 0) ||
    (summary.contexts && summary.contexts.warning > 0) ||
    (summary.steps && summary.steps.warning > 0);

  const allSkipped = 
    summary.specs && 
    summary.specs.pass === 0 && 
    summary.specs.fail === 0 && 
    summary.specs.warning === 0 &&
    summary.specs.skipped > 0;

  // Generate specs HTML
  var specsHtml = '';
  if (specs && specs.length > 0) {
    specs.forEach(function(spec, specIndex) {
      specsHtml += generateSpecHtml(spec, specIndex);
    });
  } else {
    specsHtml = '<p class="no-results">No test specifications found.</p>';
  }

  // Generate overall status text - header is always black/gray
  var overallStatusClass, overallStatusText;
  var headerBgStart = '#2d2d2d';
  var headerBgEnd = '#424242';
  
  if (hasFailures) {
    overallStatusClass = 'fail';
    overallStatusText = '❌ Some Tests Failed';
  } else if (hasWarnings) {
    overallStatusClass = 'warning';
    overallStatusText = '⚠️ Tests Passed with Warnings';
  } else if (allSkipped) {
    overallStatusClass = 'skipped';
    overallStatusText = '⏭️ All Tests Skipped';
  } else {
    overallStatusClass = 'pass';
    overallStatusText = '✅ All Tests Passed';
  }

  // Generate summary stats HTML - always show all stats (pass, fail, warning, skipped)
  var specsWarningHtml = '<span class="stat warning">⚠ ' + (summary.specs ? summary.specs.warning || 0 : 0) + '</span>';
  var specsSkippedHtml = '<span class="stat skipped">⏭ ' + (summary.specs ? summary.specs.skipped || 0 : 0) + '</span>';
  var testsWarningHtml = '<span class="stat warning">⚠ ' + (summary.tests ? summary.tests.warning || 0 : 0) + '</span>';
  var testsSkippedHtml = '<span class="stat skipped">⏭ ' + (summary.tests ? summary.tests.skipped || 0 : 0) + '</span>';
  var contextsWarningHtml = '<span class="stat warning">⚠ ' + (summary.contexts ? summary.contexts.warning || 0 : 0) + '</span>';
  var contextsSkippedHtml = '<span class="stat skipped">⏭ ' + (summary.contexts ? summary.contexts.skipped || 0 : 0) + '</span>';
  var stepsWarningHtml = '<span class="stat warning">⚠ ' + (summary.steps ? summary.steps.warning || 0 : 0) + '</span>';
  var stepsSkippedHtml = '<span class="stat skipped">⏭ ' + (summary.steps ? summary.steps.skipped || 0 : 0) + '</span>';

  // Build the complete HTML document using string concatenation
  var html = '<!DOCTYPE html>\n';
  html += '<html lang="en">\n';
  html += '<head>\n';
  html += '  <meta charset="UTF-8">\n';
  html += '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n';
  html += '  <title>Doc Detective Test Results</title>\n';
  html += '  <style>\n';
  html += '    * { box-sizing: border-box; margin: 0; padding: 0; }\n';
  html += '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Oxygen, Ubuntu, sans-serif; background-color: ' + colors.background + '; color: ' + colors.text + '; line-height: 1.6; padding: 20px; }\n';
  html += '    .container { max-width: 1200px; margin: 0 auto; }\n';
  html += '    header { background: linear-gradient(135deg, ' + headerBgStart + ' 0%, ' + headerBgEnd + ' 100%); color: white; padding: 30px; border-radius: 12px; margin-bottom: 24px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }\n';
  html += '    header h1 { font-size: 28px; margin-bottom: 8px; }\n';
  html += '    header .timestamp { opacity: 0.9; font-size: 14px; }\n';
  html += '    header .header-details { margin-top: 12px; font-size: 13px; opacity: 0.9; }\n';
  html += '    header .header-details div { margin-bottom: 4px; }\n';
  html += '    header .header-details .label { opacity: 0.8; margin-right: 6px; }\n';
  html += '    .overall-status { display: inline-block; padding: 6px 16px; border-radius: 20px; font-weight: bold; margin-top: 12px; background-color: rgba(255,255,255,0.9); }\n';
  html += '    .overall-status.pass { color: ' + colors.pass + '; }\n';
  html += '    .overall-status.fail { color: ' + colors.fail + '; }\n';
  html += '    .overall-status.warning { color: ' + colors.warning + '; }\n';
  html += '    .overall-status.skipped { color: ' + colors.skipped + '; }\n';
  html += '    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }\n';
  html += '    .summary-card { background: ' + colors.card + '; border-radius: 8px; padding: 20px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05); border-left: 4px solid #424242; }\n';
  html += '    .summary-card h3 { color: ' + colors.textSecondary + '; font-size: 14px; text-transform: uppercase; margin-bottom: 12px; }\n';
  html += '    .summary-card .total { font-size: 32px; font-weight: bold; margin-bottom: 8px; color: #2d2d2d; }\n';
  html += '    .summary-card .stats { display: flex; gap: 12px; font-size: 13px; }\n';
  html += '    .summary-card .stat { display: flex; align-items: center; gap: 4px; }\n';
  html += '    .stat.pass { color: ' + colors.pass + '; }\n';
  html += '    .stat.fail { color: ' + colors.fail + '; }\n';
  html += '    .stat.warning { color: ' + colors.warning + '; }\n';
  html += '    .stat.skipped { color: ' + colors.skipped + '; }\n';
  html += '    .results-section h2 { color: ' + colors.primaryDark + '; margin-bottom: 16px; padding-bottom: 8px; border-bottom: 2px solid ' + colors.primaryLight + '; }\n';
  html += '    .spec { background: ' + colors.card + '; border-radius: 8px; margin-bottom: 16px; box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05); overflow: hidden; border-left: 4px solid #424242; }\n';
  html += '    .spec.pass { border-left-color: ' + colors.pass + '; }\n';
  html += '    .spec.fail { border-left-color: ' + colors.fail + '; }\n';
  html += '    .spec.warning { border-left-color: ' + colors.warning + '; }\n';
  html += '    .spec.skipped { border-left-color: ' + colors.skipped + '; }\n';
  html += '    .spec-header { display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: ' + colors.primaryBg + '; border-bottom: 1px solid ' + colors.border + '; }\n';
  html += '    .spec-header h3 { font-size: 18px; color: ' + colors.primaryDark + '; }\n';
  html += '    .test { border-bottom: 1px solid ' + colors.border + '; padding: 16px 20px; }\n';
  html += '    .test:last-child { border-bottom: none; }\n';
  html += '    .test-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }\n';
  html += '    .test-header h4 { font-size: 16px; color: ' + colors.text + '; }\n';
  html += '    .description { color: ' + colors.textSecondary + '; font-size: 14px; margin-bottom: 12px; }\n';
  html += '    .context { background: ' + colors.background + '; border-radius: 6px; margin-top: 12px; overflow: hidden; }\n';
  html += '    .context-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: ' + colors.primaryBg + '; font-size: 14px; }\n';
  html += '    .context-info { display: flex; gap: 8px; }\n';
  html += '    .context-info span { background: white; padding: 2px 10px; border-radius: 12px; font-size: 12px; color: ' + colors.primaryDark + '; }\n';
  html += '    .steps { padding: 12px 16px; }\n';
  html += '    .step { padding: 12px; border-radius: 6px; margin-bottom: 8px; border-left: 3px solid ' + colors.border + '; }\n';
  html += '    .step:last-child { margin-bottom: 0; }\n';
  html += '    .step.pass { background: ' + colors.passLight + '; border-left-color: ' + colors.pass + '; }\n';
  html += '    .step.fail { background: ' + colors.failLight + '; border-left-color: ' + colors.fail + '; }\n';
  html += '    .step.warning { background: ' + colors.warningLight + '; border-left-color: ' + colors.warning + '; }\n';
  html += '    .step.skipped { background: ' + colors.skippedLight + '; border-left-color: ' + colors.skipped + '; }\n';
  html += '    .step-header { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }\n';
  html += '    .step-number { background: ' + colors.primary + '; color: white; width: 24px; height: 24px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: bold; }\n';
  html += '    .step-action { font-weight: 600; color: ' + colors.text + '; }\n';
  html += '    .step-description { color: ' + colors.textSecondary + '; font-size: 13px; margin-left: 34px; }\n';
  html += '    .step-details { margin-top: 8px; margin-left: 34px; font-size: 12px; font-family: Monaco, Consolas, monospace; background: rgba(0,0,0,0.03); padding: 8px 12px; border-radius: 4px; overflow-x: auto; color: ' + colors.textSecondary + '; }\n';
  html += '    .result-badge { padding: 4px 12px; border-radius: 12px; font-size: 12px; font-weight: bold; text-transform: uppercase; }\n';
  html += '    .result-badge.pass { background: ' + colors.passLight + '; color: ' + colors.pass + '; }\n';
  html += '    .result-badge.fail { background: ' + colors.failLight + '; color: ' + colors.fail + '; }\n';
  html += '    .result-badge.warning { background: ' + colors.warningLight + '; color: ' + colors.warning + '; }\n';
  html += '    .result-badge.skipped { background: ' + colors.skippedLight + '; color: ' + colors.skipped + '; }\n';
  html += '    .no-results, .no-tests, .no-contexts, .no-steps { color: ' + colors.textSecondary + '; font-style: italic; padding: 20px; text-align: center; }\n';
  html += '    footer { text-align: center; padding: 20px; color: ' + colors.textSecondary + '; font-size: 13px; margin-top: 20px; }\n';
  html += '    footer a { color: ' + colors.primary + '; text-decoration: none; }\n';
  html += '    footer a:hover { text-decoration: underline; }\n';
  html += '  </style>\n';
  html += '</head>\n';
  html += '<body>\n';
  html += '  <div class="container">\n';
  html += '    <header>\n';
  html += '      <h1>🔍 Doc Detective Test Results</h1>\n';
  html += '      <div class="timestamp">Generated: ' + timestamp + '</div>\n';
  
  // Add header details section
  html += '      <div class="header-details">\n';
  if (inputFiles.length > 0) {
    html += '        <div><span class="label">📁 Input:</span>' + escapeHtml(inputFiles.join(', ')) + '</div>\n';
  }
  if (duration !== null) {
    var durationStr = '';
    if (duration >= 60000) {
      durationStr = Math.floor(duration / 60000) + 'm ' + Math.floor((duration % 60000) / 1000) + 's';
    } else if (duration >= 1000) {
      durationStr = (duration / 1000).toFixed(2) + 's';
    } else {
      durationStr = duration + 'ms';
    }
    html += '        <div><span class="label">⏱️ Duration:</span>' + durationStr + '</div>\n';
  }
  html += '        <div><span class="label">📊 Spec Files:</span>' + totalSpecs + '</div>\n';
  html += '      </div>\n';
  
  html += '      <div class="overall-status ' + overallStatusClass + '">' + overallStatusText + '</div>\n';
  html += '    </header>\n';
  html += '    <section class="summary">\n';
  html += '      <div class="summary-card">\n';
  html += '        <h3>Specs</h3>\n';
  html += '        <div class="total">' + totalSpecs + '</div>\n';
  html += '        <div class="stats">\n';
  html += '          <span class="stat pass">✓ ' + (summary.specs ? summary.specs.pass || 0 : 0) + '</span>\n';
  html += '          <span class="stat fail">✗ ' + (summary.specs ? summary.specs.fail || 0 : 0) + '</span>\n';
  html += '          ' + specsWarningHtml + '\n';
  html += '          ' + specsSkippedHtml + '\n';
  html += '        </div>\n';
  html += '      </div>\n';
  html += '      <div class="summary-card">\n';
  html += '        <h3>Tests</h3>\n';
  html += '        <div class="total">' + totalTests + '</div>\n';
  html += '        <div class="stats">\n';
  html += '          <span class="stat pass">✓ ' + (summary.tests ? summary.tests.pass || 0 : 0) + '</span>\n';
  html += '          <span class="stat fail">✗ ' + (summary.tests ? summary.tests.fail || 0 : 0) + '</span>\n';
  html += '          ' + testsWarningHtml + '\n';
  html += '          ' + testsSkippedHtml + '\n';
  html += '        </div>\n';
  html += '      </div>\n';
  html += '      <div class="summary-card">\n';
  html += '        <h3>Contexts</h3>\n';
  html += '        <div class="total">' + totalContexts + '</div>\n';
  html += '        <div class="stats">\n';
  html += '          <span class="stat pass">✓ ' + (summary.contexts ? summary.contexts.pass || 0 : 0) + '</span>\n';
  html += '          <span class="stat fail">✗ ' + (summary.contexts ? summary.contexts.fail || 0 : 0) + '</span>\n';
  html += '          ' + contextsWarningHtml + '\n';
  html += '          ' + contextsSkippedHtml + '\n';
  html += '        </div>\n';
  html += '      </div>\n';
  html += '      <div class="summary-card">\n';
  html += '        <h3>Steps</h3>\n';
  html += '        <div class="total">' + totalSteps + '</div>\n';
  html += '        <div class="stats">\n';
  html += '          <span class="stat pass">✓ ' + (summary.steps ? summary.steps.pass || 0 : 0) + '</span>\n';
  html += '          <span class="stat fail">✗ ' + (summary.steps ? summary.steps.fail || 0 : 0) + '</span>\n';
  html += '          ' + stepsWarningHtml + '\n';
  html += '          ' + stepsSkippedHtml + '\n';
  html += '        </div>\n';
  html += '      </div>\n';
  html += '    </section>\n';
  html += '    <section class="results-section">\n';
  html += '      <h2>Detailed Results</h2>\n';
  html += '      ' + specsHtml + '\n';
  html += '    </section>\n';
  html += '    <footer>\n';
  html += '      <p>Generated by <a href="https://github.com/doc-detective/doc-detective" target="_blank">Doc Detective</a></p>\n';
  html += '    </footer>\n';
  html += '  </div>\n';
  html += '</body>\n';
  html += '</html>';

  return html;
}

// Export reporters for external use
exports.reporters = reporters;

// Helper function to register custom reporters
function registerReporter(name, reporterFunction) {
  if (typeof reporterFunction !== "function") {
    throw new Error("Reporter must be a function");
  }
  reporters[name] = reporterFunction;
  return true;
}

// Export the registerReporter function
exports.registerReporter = registerReporter;

async function reportResults({ apiConfig, results }) {
  // Transform results into the required format for the API
  // Extract contexts from the nested structure and format them
  const contexts = [];

  if (results.specs) {
    results.specs.forEach((spec) => {
      if (spec.tests) {
        spec.tests.forEach((test) => {
          if (test.contexts) {
            test.contexts.forEach((context) => {
              // Extract or generate contextId
              const contextId =
                context.contextId;

              // Convert result status to lowercase (PASS -> passed, FAIL -> failed, etc.)
              let status;
              if (context.result === "PASS") {
                status = "passed";
              } else if (context.result === "FAIL") {
                status = "failed";
              } else if (context.result === "WARNING") {
                status = "warning";
              } else if (context.result === "SKIPPED") {
                status = "skipped";
              }
              if (!status) {
                log(config, "error", `Unknown context result status for context ID ${contextId}`);
                return; 
              }

              // Build the context payload with the entire context object embedded
              contexts.push({
                contextId: contextId,
                status: status,
                result: context,
              });
            });
          }
        });
      }
    });
  }

  // POST to the /contexts endpoint
  try {
    const url = `${apiConfig.url}/contexts`;
    const payload = { contexts };

    console.log(payload);

    const response = await axios.post(url, payload, {
      headers: {
        "x-runner-token": apiConfig.token,
      },
    });
    console.log("Results reported successfully:", response.data);
  } catch (error) {
    console.error(
      `Error reporting results to ${apiConfig.url}/contexts: ${error.message}`
    );
  }
}

async function outputResults(config = {}, outputPath, results, options = {}) {
  // Default to using both built-in reporters if none specified
  const defaultReporters = ["terminal", "json"];

  let activeReporters = options.reporters || defaultReporters;

  // If the reporters option is provided as strings, normalize them
  if (activeReporters.length > 0) {
    // Convert any shorthand names to full reporter names
    activeReporters = activeReporters.map((reporter) => {
      if (typeof reporter === "string") {
        // Convert shorthand names to actual reporter keys
        switch (reporter.toLowerCase()) {
          case "json":
            return "jsonReporter";
          case "terminal":
            return "terminalReporter";
          case "html":
            return "htmlReporter";
          default:
            return reporter;
        }
      }
      return reporter;
    });
  }

  // Execute each reporter
  const reporterPromises = activeReporters.map((reporter) => {
    if (typeof reporter === "function") {
      // Direct function reference
      return reporter(config, outputPath, results, options);
    } else if (typeof reporter === "string" && reporters[reporter]) {
      // String reference to built-in or registered reporter
      return reporters[reporter](config, outputPath, results, options);
    } else if (typeof reporter === "string" && !reporters[reporter]) {
      console.error(
        `Reporter "${reporter}" not found. Available reporters: ${Object.keys(
          reporters
        ).join(", ")}`
      );
      return Promise.resolve();
    } else {
      console.error(`Invalid reporter: ${reporter}`);
      return Promise.resolve();
    }
  });

  // Wait for all reporters to complete
  return Promise.all(reporterPromises);
}

// Perform a native command in the current working directory.
async function spawnCommand(cmd, args) {
  // Split command into command and arguments
  if (cmd.includes(" ")) {
    const cmdArray = cmd.split(" ");
    cmd = cmdArray[0];
    cmdArgs = cmdArray.slice(1);
    // Add arguments to args array
    if (args) {
      args = cmdArgs.concat(args);
    } else {
      args = cmdArgs;
    }
  }

  const runCommand = spawn(cmd, args, {
    env: process.env, // Explicitly pass environment variables
  });

  // Capture stdout
  let stdout = "";
  for await (const chunk of runCommand.stdout) {
    stdout += chunk;
  }
  // Remove trailing newline
  stdout = stdout.replace(/\n$/, "");

  // Capture stderr
  let stderr = "";
  for await (const chunk of runCommand.stderr) {
    stderr += chunk;
  }
  // Remove trailing newline
  stderr = stderr.replace(/\n$/, "");

  // Capture exit code
  const exitCode = await new Promise((resolve, reject) => {
    runCommand.on("close", resolve);
  });

  return { stdout, stderr, exitCode };
}

function setMeta() {
  const platformMap = {
    win32: "windows",
    darwin: "mac",
    linux: "linux",
  };

  // Set meta
  const meta =
    process.env["DOC_DETECTIVE_META"] !== undefined
      ? JSON.parse(process.env["DOC_DETECTIVE_META"])
      : {};
  const package = require("../package.json");
  meta.distribution = "doc-detective";
  meta.dist_version = package.version;
  meta.dist_platform = platformMap[os.platform()] || os.platform();
  meta.dist_platform_version = os.release();
  meta.dist_platform_arch = os.arch();
  meta.dist_deployment = meta.dist_deployment || "node";
  meta.dist_deployment_version =
    meta.dist_deployment_version || process.version;
  meta.dist_interface = meta.dist_interface || "cli";
  process.env["DOC_DETECTIVE_META"] = JSON.stringify(meta);
}

// Get version data programmatically (no console output)
function getVersionData() {
  try {
    // Get main package version
    const mainPackage = require("../package.json");
    const versionData = {
      main: {
        "doc-detective": {
          version: mainPackage.version,
          expected: "main package",
        },
      },
      dependencies: {},
      context: {
        executionMethod: "direct node execution",
        nodeVersion: process.version,
        platform: `${os.platform()} ${os.arch()}`,
        timestamp: new Date().toISOString(),
      },
      locations: {},
    };

    // Auto-discover all doc-detective-* packages in node_modules
    const nodeModulesPath = path.resolve(process.cwd(), "node_modules");
    const dependenciesToCheck = [];

    if (fs.existsSync(nodeModulesPath)) {
      const nodeModulesContents = fs.readdirSync(nodeModulesPath);
      nodeModulesContents.forEach((dir) => {
        if (dir.startsWith("doc-detective-") && dir !== "doc-detective") {
          dependenciesToCheck.push(dir);
        }
      });
    }

    // Detect execution method
    const isNpx =
      process.env.npm_execpath && process.env.npm_execpath.includes("npx");
    const isNpm = process.env.npm_execpath && !isNpx;

    if (isNpx) {
      versionData.context.executionMethod = "npx";
    } else if (isNpm) {
      versionData.context.executionMethod = "npm";
    }

    // Check installed versions of dependencies
    dependenciesToCheck.sort().forEach((dep) => {
      try {
        // Try to read the dependency's package.json
        const depPackagePath = path.resolve(
          process.cwd(),
          "node_modules",
          dep,
          "package.json"
        );
        if (fs.existsSync(depPackagePath)) {
          const depPackage = JSON.parse(
            fs.readFileSync(depPackagePath, "utf8")
          );
          const installedVersion = depPackage.version;

          // Look for expected version in main package dependencies or devDependencies
          const expectedVersion =
            mainPackage.dependencies[dep] ||
            mainPackage.devDependencies[dep] ||
            "not specified in main package";

          versionData.dependencies[dep] = {
            installed: installedVersion,
            expected: expectedVersion,
            status:
              expectedVersion !== "not specified in main package" &&
              !expectedVersion.includes(installedVersion) &&
              !installedVersion.includes(expectedVersion.replace(/[\^~]/, ""))
                ? "mismatch"
                : "ok",
          };

          versionData.locations[dep] = path.resolve(
            process.cwd(),
            "node_modules",
            dep
          );
        } else {
          versionData.dependencies[dep] = {
            installed: null,
            expected:
              mainPackage.dependencies[dep] ||
              mainPackage.devDependencies[dep] ||
              "not specified",
            status: "not found",
            error: "package.json not found",
          };
        }
      } catch (error) {
        versionData.dependencies[dep] = {
          installed: null,
          expected:
            mainPackage.dependencies[dep] ||
            mainPackage.devDependencies[dep] ||
            "not specified",
          status: "error",
          error: error.message,
        };
      }
    });

    return versionData;
  } catch (error) {
    return { error: error.message };
  }
}
