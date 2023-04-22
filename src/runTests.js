const { runTests } = require("doc-detective-core");
const { argv } = require("node:process");
const { setArgs, setConfig, outputResults } = require("./utils");
const path = require("path");

main(argv);

// Run tests
async function main(argv) {
  // Set args and config
  argv = setArgs(argv);
  const config = setConfig({}, argv);
  // Run tests
  const results = await runTests(config);
  // Output results
  const outputDir = config.runTests.output || config.output;
  const outputPath = path.resolve(outputDir, `testResults-${Date.now()}.json`);
  await outputResults(config, outputPath, results);
}
