const { setArgs, setConfig, setFiles, outputResults } = require("./lib/utils");
const { setTests, runTests } = require("./lib/tests");

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
  const tests = setTests(config, files);
  if (debug) {
    console.log("TESTS:");
    console.log(tests);
    console.log("ACTIONS:");
    tests.forEach((test) => {
      test.actions.forEach((action) => {
        console.log(action);
      });
    });
  }

  // Run tests
  const results = await runTests(config, tests);
  if (debug) {
    console.log("RESULTS:");
    console.log(results);
  }

  // Output
  outputResults(config, results);
}