#!/usr/bin/env node

const { runTests, runCoverage } = require("doc-detective-core");
const { setArgs, setConfig, outputResults } = require("./utils");
const { argv } = require("node:process");
const path = require("path");

main(argv);

// Run tests
async function main(argv) {
  // Find index of `doc-detective` or `run` in argv
  let index = argv.indexOf("doc-detective");
  if (index === -1) {
    index = argv.findIndex((arg) => arg.endsWith("index.js"));
  }
  // `command` is the next argument after `doc-detective` or `src/index.js`
  const command = argv[index + 1];
  // Set args and config
  argv = setArgs(argv);
  const config = setConfig({}, argv);
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
