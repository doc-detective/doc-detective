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
async function setConfig(config, args, configPath) {
  // Override config values
  if (args.input) {
    config.input = args.input;
  }
  if (args.output) {
    config.output = args.output;
  }
  if (args.logLevel) config.logLevel = args.logLevel;

  // Validate config
  const validation = validate({
    schemaKey: "config_v3",
    object: config,
  });
  if (!validation.valid) {
    // Output validation errors
    console.error("Invalid config.");
    validation.errors.forEach((error) => {
      console.error(error);
    });
    process.exit(1);
  }
  // Accept coerced and defaulted values
  config = validation.object;
  // Set default values
  config = {
    ...config,
    input: config.input || ".",
    outputDirectory: config.outputDirectory || ".",
    recursive: config.recursive || true,
    relativePathBase: config.relativePathBase || "file",
    loadVariables: config.loadVariables || ".env",
    detectSteps: config.detectSteps || true,
    logLevel: config.logLevel || "info",
    fileTypes: config.fileTypes || ["markdown", "asciidoc", "html", "xml"],
    telemetry: config.telemetry || { send: true },
  }
  // Resolve paths
  config = await resolvePaths({
    config: config,
    object: config,
    filePath: configPath,
    nested: false,
    objectType: "config",
  });

  return config;
}

async function outputResults(config = {}, outputPath, results, options = {}) {
  // DEBUG
  // outputPath = "./foobar/results.json";
  // END DEBUG

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
  // outputPath = path.resolve(outputPath, `${reportType}.json`);

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
    console.log(`See results at ${outputFile}`);
  } catch (err) {
    console.error(`Error writing results to ${outputFile}. ${err}`);
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
