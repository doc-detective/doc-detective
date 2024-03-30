#!/usr/bin/env node

const { runTests, runCoverage } = require("doc-detective-core");
const { setArgs, setConfig, outputResults, setMeta } = require("./utils");
const { argv } = require("node:process");
const path = require("path");
const fs = require("fs");

// Run
setMeta();
main(argv);

// Run
async function main(argv) {
  // Find index of `doc-detective` or `run` in argv
  const index = argv.findIndex(
    (arg) => arg.endsWith("doc-detective") || arg.endsWith("index.js")
  );
  // `command` is the next argument after `doc-detective` or `src/index.js`
  const command = argv[index + 1];
  // Set args
  argv = setArgs(argv);
  // Get .doc-detective.json config, if it exists
  const configPath = path.resolve(process.cwd(), ".doc-detective.json");
  let config = {};
  if (fs.existsSync(configPath)) {
    config = require(configPath);
  }
  // Set config
  config = setConfig(config, argv);
  // Run command
  let results = {};
  let outputDir;
  let outputReportType;
  if (command === "runCoverage") {
    outputDir = config?.runCoverage?.output || config.output;
    outputReportType = "coverageResults";
    results = await runCoverage(config);
  } else if (command === "runTests") {
    outputDir = config?.runTests?.output || config.output;
    outputReportType = "testResults";
    results = await runTests(config);
  } else {
    throw new Error(`Command ${command} not found`);
  }
  // Output results
  const outputPath = path.resolve(
    outputDir,
    `${outputReportType}-${Date.now()}.json`
  );
  await outputResults(config, outputPath, results);
}
