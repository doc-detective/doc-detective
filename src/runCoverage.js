const { runCoverage } = require("doc-detective-core");
const { argv } = require("node:process");
const { setArgs, setConfig, outputResults } = require("./utils");
const path = require("path");

main(argv);

// Run test coverage analysis
async function main(argv) {
  // Set args and config
  argv = setArgs(argv);
  const config = setConfig({}, argv);
  // Run tests
  const results = await runCoverage(config);
  // Output results
  const outputDir = config.runTests.output || config.output;
  const outputPath = path.resolve(outputDir, `coverageResults-${Date.now()}.json`);
  await outputResults(config, outputPath, results);
}
