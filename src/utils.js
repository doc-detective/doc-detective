const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const { validate } = require("doc-detective-common");
const path = require("path");

exports.setArgs = setArgs;
exports.setConfig = setConfig;

// Define args
function setArgs(args) {
  if (!args) return {};
  let argv = yargs(hideBin(args))
    .option("config", {
      alias: "c",
      description: "Path to a `config.json` file.",
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
    .option("setup", {
      description:
        "Path to test specifications to perform before those specified by `input`. Useful for setting up testing environments.",
      type: "string",
    })
    .option("cleanup", {
      description:
        "Path to test specifications to perform after those specified by input. Useful for cleaning up testing environments.",
      type: "string",
    })
    .option("recursive", {
      alias: "r",
      description:
        "Boolean.  If true searches input, setup, and cleanup paths recursively for test specificaions and source files. Defaults to `true`.",
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

// Override config values based on args
function setConfig(config, args) {
  // If no args, return config
  if (!args) return config;

  // Load config from file
  if (args.config) {
    const configPath = path.resolve(args.config);
    configContent = require(configPath);
    // Validate config
    const validation = validate("config_v2", configContent);
    if (validation.valid) {
      config = configContent;
    } else {
      // Output validation errors
      console.error("Invalid config file:");
      validation.errors.forEach((error) => {
        console.error(error);
      });
      process.exit(1);
    }
  }

  // Override config values
  if (args.input) config.input = args.input;
  if (args.output) config.output = args.output;
  if (args.recursive) config.recursive = args.recursive;
  if (args.logLevel) config.logLevel = args.logLevel;
  if ((args.setup || args.cleanup) && !config.runTests) config.runTests = {};
  if (args.setup) config.runTests.setup = args.setup;
  if (args.cleanup) config.runTests.cleanup = args.cleanup;

  // Validate config
  const validation = validate("config_v2", config);
  if (!validation.valid) {
    // Output validation errors
    console.error("Invalid config.");
    validation.errors.forEach((error) => {
      console.error(error);
    });
    process.exit(1);
  }

  return config;
}
