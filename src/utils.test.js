const { setArgs, setConfig, outputResults } = require("./utils");
const path = require("path");
const fs = require("fs");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("Util tests", function () {
  // Test that arguments are parsed correctly
  it("Yargs parses arguments correctly", function () {
    const argSets = [
      {
        args: ["node", "runTests.js", "--input", "input.spec.json"],
        expected: { i: "input.spec.json" },
      },
      {
        args: [
          "node",
          "runTests.js",
          "--input",
          "input.spec.json",
          "--logLevel",
          "debug",
        ],
        expected: { i: "input.spec.json", l: "debug" },
      },
      {
        args: [
          "node",
          "runTests.js",
          "--input",
          "input.spec.json",
          "--logLevel",
          "debug",
          "--config",
          "config.json",
        ],

        expected: { i: "input.spec.json", l: "debug", c: "config.json" },
      },
      {
        args: [
          "node",
          "runTests.js",
          "--input",
          "input.spec.json",
          "--output",
          ".",
          "--logLevel",
          "debug",
          "--config",
          "config.json",
        ],
        expected: {
          i: "input.spec.json",
          o: ".",
          l: "debug",
          c: "config.json",
        },
      },
      {
        args: [
          "node",
          "runTests.js",
          "--input",
          "input.spec.json",
          "--output",
          ".",
          "--logLevel",
          "debug",
          "--config",
          "config.json",
          "--recursive",
          "false",
          "--setup",
          "setup.spec.json",
          "--cleanup",
          "cleanup.spec.json",
        ],
        expected: {
          i: "input.spec.json",
          o: ".",
          l: "debug",
          c: "config.json",
          r: "false",
          setup: "setup.spec.json",
          cleanup: "cleanup.spec.json",
        },
      },
    ];
    argSets.forEach((argSet) => {
      expect(setArgs(argSet.args)).to.deep.include(argSet.expected);
    });
  });

  // Test that config overrides are set correctly
  it("Config overrides are set correctly", function () {
    configSets = [
      {
        // Input override
        args: ["node", "runTests.js", "--input", "input.spec.json"],
        expected: { input: "input.spec.json" },
      },
      {
        // Input and logLevel overrides
        args: [
          "node",
          "runTests.js",
          "--input",
          "input.spec.json",
          "--logLevel",
          "debug",
        ],
        expected: { input: "input.spec.json", logLevel: "debug" },
      },
      {
        // Input, logLevel, and setup overrides
        args: [
          "node",
          "runTests.js",
          "--input",
          "input.spec.json",
          "--logLevel",
          "debug",
          "--setup",
          "setup.spec.json",
        ],
        expected: {
          input: "input.spec.json",
          logLevel: "debug",
          runTests: { setup: "setup.spec.json" },
        },
      },
      {
        // Referenced config without overrides
        args: ["node", "runTests.js", "--config", "./test/test-config.json"],
        expected: {
          input: ".",
          output: ".",
          logLevel: "silent",
          recursive: true,
          runTests: {
            setup: ".",
            cleanup: ".",
          },
        },
      },
      {
        // Referenced config with overrides
        args: [
          "node",
          "runTests.js",
          "--config",
          "./test/test-config.json",
          "--input",
          "input.spec.json",
        ],
        expected: {
          input: "input.spec.json",
          output: ".",
          logLevel: "silent",
          recursive: true,
          runTests: {
            setup: ".",
            cleanup: ".",
          },
        },
      },
    ];

    configSets.forEach(async (configSet) => {
      const configResult = await setConfig({}, setArgs(configSet.args));
      deepObjectExpect(configResult, configSet.expected);
    });
  });

  // Test that results output correctly.
  it("Results output correctly", async () => {
    // Output test-results.json, make sure it exists, and clean it up.
    const inputResultsPath = path.resolve(__dirname, "../test/test-results.json");
    const inputResultsJSON = require(inputResultsPath);
    const outputResultsPath = path.resolve(__dirname, "../test/output-test-results.json");
    // Check that input file exists
    expect(fs.existsSync(inputResultsPath)).to.equal(true);
    // Output results
    await outputResults(null, outputResultsPath, inputResultsJSON);
    // Check that output file exists
    expect(fs.existsSync(outputResultsPath)).to.equal(true);
    // Clean up
    fs.unlinkSync(outputResultsPath);
  });
});

// Deeply compares two objects
function deepObjectExpect(actual, expected) {
  // Check that actual has all the keys of expected
  Object.entries(expected).forEach(([key, value]) => {
    // If value is an object, recursively check it
    if (typeof value === "object") {
      deepObjectExpect(actual[key], expected[key]);
    } else {
      // Otherwise, check that the value is correct
      const expectedObject = {};
      expectedObject[key] = value;
      expect(actual).to.deep.include(expectedObject);
    }
  });
}
