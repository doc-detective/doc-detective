const { suggestTests } = require("../node_modules/doc-detective-core");   // Intentionally calling from node_modules to allow console interaction without requiring the `--preserve-symlinks` flag.
const { argv } = require("node:process");
const { setArgs, setConfig, outputResults } = require("./utils");
const path = require("path");

main(argv);

// Suggest tests for documentation soure
async function main(argv) {
  // Set args and config
  argv = setArgs(argv);
  const config = setConfig({}, argv);
  // Suggest tests
  const results = await suggestTests(config);
  // Output results
  const outputDir = config.suggestTests.output || config.output;
  const outputPath = path.resolve(outputDir, `testSuggestions-${Date.now()}.json`);
  await outputResults(config, outputPath, results);
}
