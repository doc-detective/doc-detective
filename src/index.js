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
const { checkTestCoverage, checkMarkupCoverage } = require("./lib/analysis");
const { reportCoverage } = require("./lib/coverage");
const { suggestTests, runSuggestions } = require("./lib/suggest");
const { exit } = require("process");

exports.run = test;
exports.test = test;
exports.coverage = coverage;
exports.suggest = suggest;

async function test(config, argv) {
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
  outputResults(config.output, results, config);
  if (config.analytics.send) {
    // sendAnalytics(config, results);
  }
}

async function coverage(config, argv) {
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

  const testCoverage = checkTestCoverage(config, files);
  log(config, "debug", "TEST COVERAGE:");
  log(config, "debug", testCoverage);

  const markupCoverage = checkMarkupCoverage(config, testCoverage);
  log(config, "debug", "MARKUP COVERAGE:");
  log(config, "debug", markupCoverage);

  const coverageReport = reportCoverage(config, markupCoverage);
  log(config, "debug", "COVERAGE REPORT:");
  log(config, "debug", coverageReport);

  // Output
  outputResults(config.coverageOutput, coverageReport, config);
}

async function suggest(config, argv) {
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

  const testCoverage = checkTestCoverage(config, files);
  log(config, "debug", "TEST COVERAGE:");
  log(config, "debug", testCoverage);

  const markupCoverage = checkMarkupCoverage(config, testCoverage);
  log(config, "debug", "MARKUP COVERAGE:");
  log(config, "debug", markupCoverage);

  const suggestionReport = suggestTests(config, markupCoverage);
  log(config, "debug", "TEST SUGGESTIONS:");
  log(config, "debug", suggestionReport);

  await runSuggestions(config, suggestionReport);

  // Output
  outputResults(
    config.testSuggestions.reportOutput,
    suggestionReport,
    config
  );
}
