const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const { validate, resolvePaths, readFile } = require("doc-detective-common");
const path = require("path");
const fs = require("fs");
const { spawn } = require("child_process");
const os = require("os");

exports.setArgs = setArgs;
exports.setConfig = setConfig;
exports.outputResults = outputResults;
exports.spawnCommand = spawnCommand;
exports.setMeta = setMeta;

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
    .help()
    .alias("help", "h").argv;

  return argv;
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
    recursive: config.recursive || true,
    relativePathBase: config.relativePathBase || "file",
    loadVariables: config.loadVariables || ".env",
    detectSteps: config.detectSteps || true,
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

      console.log(
        `\n${colors.bold}===== Doc Detective Results Summary =====${colors.reset}`
      );

      // Print specs summary if available
      if (specs) {
        console.log(`\n${colors.bold}Specs:${colors.reset}`);
        console.log(`Total: ${totalSpecs}`);
        console.log(`${colors.green}Passed: ${specs.pass}${colors.reset}`);
        console.log(
          `${specs.fail > 0 ? colors.red : colors.green}Failed: ${specs.fail}${
            colors.reset
          }`
        );
        if (specs.warning > 0)
          console.log(
            `${colors.yellow}Warnings: ${specs.warning}${colors.reset}`
          );
        if (specs.skipped > 0) console.log(`Skipped: ${specs.skipped}`);
      }

      // Print tests summary if available
      if (tests) {
        console.log(`\n${colors.bold}Tests:${colors.reset}`);
        console.log(`Total: ${totalTests}`);
        console.log(`${colors.green}Passed: ${tests.pass}${colors.reset}`);
        console.log(
          `${tests.fail > 0 ? colors.red : colors.green}Failed: ${tests.fail}${
            colors.reset
          }`
        );
        if (tests.warning > 0)
          console.log(
            `${colors.yellow}Warnings: ${tests.warning}${colors.reset}`
          );
        if (tests.skipped > 0) console.log(`Skipped: ${tests.skipped}`);
      }

      // Print contexts summary if available
      if (contexts) {
        console.log(`\n${colors.bold}Contexts:${colors.reset}`);
        console.log(`Total: ${totalContexts}`);
        console.log(`${colors.green}Passed: ${contexts.pass}${colors.reset}`);
        console.log(
          `${contexts.fail > 0 ? colors.red : colors.green}Failed: ${
            contexts.fail
          }${colors.reset}`
        );
        if (contexts.warning > 0)
          console.log(
            `${colors.yellow}Warnings: ${contexts.warning}${colors.reset}`
          );
        if (contexts.skipped > 0) console.log(`Skipped: ${contexts.skipped}`);
      }

      // Print steps summary if available
      if (steps) {
        console.log(`\n${colors.bold}Steps:${colors.reset}`);
        console.log(`Total: ${totalSteps}`);
        console.log(`${colors.green}Passed: ${steps.pass}${colors.reset}`);
        console.log(
          `${steps.fail > 0 ? colors.red : colors.green}Failed: ${steps.fail}${
            colors.reset
          }`
        );
        if (steps.warning > 0)
          console.log(
            `${colors.yellow}Warnings: ${steps.warning}${colors.reset}`
          );
        if (steps.skipped > 0) console.log(`Skipped: ${steps.skipped}`);
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

        // Process specs array to collect failures
        results.specs.forEach((spec, specIndex) => {
          // Check if spec has failed
          if (spec.result === "FAIL") {
            failedSpecs.push({
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
      } else if (!hasFailures) {
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
};

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

  const runCommand = spawn(cmd, args);

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
