const { setArgs, setConfig, outputResults } = require("../src/utils");
const path = require("path");
const fs = require("fs");

// Test that arguments are parsed correctly
test("Yargs parses arguments correctly", () => {
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
      expected: { i: "input.spec.json", o: ".", l: "debug", c: "config.json" },
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
    expect(setArgs(argSet.args)).toMatchObject(argSet.expected);
  });
});

// Test that config overrides are set correctly
test("Config overrides are set correctly", () => {
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
        logLevel: "info",
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
        logLevel: "info",
        recursive: true,
        runTests: {
          setup: ".",
          cleanup: ".",
        },
      },
    },
  ];

  configSets.forEach((configSet) => {
    expect(setConfig({}, setArgs(configSet.args))).toMatchObject(
      configSet.expected
    );
  });
});

// Test that results output correctly.
test("Results output correctly", async () => {
  // Output test-results.json, make sure it exists, and clean it up.
  const inputResultsPath = path.resolve("./test/test-results.json");
  const inputResultsJSON = require(inputResultsPath);
  const outputResultsPath = path.resolve("./test/output-test-results.json");
  // Output results
  await outputResults(null, outputResultsPath, inputResultsJSON);
  // Check that output file exists
  expect(fs.existsSync(outputResultsPath)).toBe(true);
  // Clean up
  fs.unlinkSync(outputResultsPath);
});