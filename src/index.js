#!/usr/bin/env node

const { runTests, runCoverage } = require("doc-detective-core");
const { setArgs, setConfig, outputResults } = require("./utils");
const { argv } = require("node:process");
const path = require("path");

main(argv);

// Run tests
async function main(argv) {
  const command = argv[2];
  // Set args and config
  argv = setArgs(argv);
  const config = setConfig({}, argv);
  // Run command
  let results = {};
  let outputDir;
  let outputReportType;
  if (command === "runCoverage") {
    outputDir = config.runCoverage.output || config.output;
    outputReportType = "coverageResults";
    results = await runCoverage(config);
  } else if (command === "runTests") {
    outputDir = config.runTests.output || config.output;
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
