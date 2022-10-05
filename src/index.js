const {
  setArgs,
  setConfig,
  setFiles,
  parseTests,
  outputResults,
  log,
} = require("./lib/utils");
const { sendAnalytics } = require("./lib/analytics.js");
const { runTests } = require("./lib/tests");

exports.run = function (config, argv) {
  main(config, argv);
};

async function main(config, argv) {
  // Set args
  argv = setArgs(argv);
  log(config, "debug", `ARGV:`);
  log(config, "debug", argv);

  // Set config
  config = setConfig(config, argv);
  log(config, "debug", `CONFIG:`);
  log(config, "debug", config);

  // Set files
  const files = setFiles(config);
  log(config, "debug", `FILES:`);
  log(config, "debug", files);

  // Set tests
  const tests = parseTests(config, files);
  if (config.logLevel === "debug") {
    console.log("(DEBUG) TESTS:");
    tests.tests.forEach((test) => {
      console.log(test);
    });
  }

  // Run tests
  const results = await runTests(config, tests);

  // Output
  outputResults(config, results);
  if (config.analytics.send) {
    sendAnalytics(config, results);
  }
}
