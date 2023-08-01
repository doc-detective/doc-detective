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
  const output = config.runTests.output || config.output;
  let outputPath;
  if (output.includes(".json")) {
    // Output is a file path
    outputPath = path.resolve(output);
  } else {
    // Output is a directory path
    outputPath = path.resolve(output, `testResults-${Date.now()}.json`);
  } 
  await outputResults(config, outputPath, results);
}
