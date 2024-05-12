const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const { validate } = require("doc-detective-common");
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
  if (
    (args.setup || args.cleanup || args.input || args.output) &&
    !config.runTests
  )
    config.runTests = {};
  if (args.input) config.runTests.input = args.input;
  if (args.output) config.runTests.output = args.output;
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

async function outputResults(config, path, results) {
  let data = JSON.stringify(results, null, 2);
  try {
    fs.writeFileSync(path, data);
    console.log(`See results at ${path}`);
  } catch (err) {
    console.error(`Error writing results to ${path}: ${err}`);
  }
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
