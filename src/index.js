const { setArgs, setConfig, setFiles, parseFiles, outputResults } = require("./lib/utils");
const { runTests } = require("./lib/tests");

const defaultConfig = require("./config.json");

main(defaultConfig, process.argv);

async function main(config, argv) {
  // Debug flag
  const debug = true;

  // Set args
  argv = setArgs(argv);
  if (debug) {
    console.log("ARGV:");
    console.log(argv);
  }

  // Set config
  config = setConfig(config, argv);
  if (debug) {
    console.log("CONFIG:");
    console.log(config);
  }

  // Set files
  const files = setFiles(config);
  if (debug) {
    console.log("FILES:");
    console.log(files);
  }

  // Set tests
  const tests = parseFiles(config, files);
  if (debug) {
    console.log("TESTS:");
    tests.tests.forEach((test) => {
      console.log(test);
    });
  }

  // // Run tests
  const results = await runTests(config, tests);
  if (debug) {
    console.log("RESULTS:");
    console.log(results);
  }

  // // Output
  outputResults(config, results);
}