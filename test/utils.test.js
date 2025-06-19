const { setArgs, setConfig, outputResults } = require("../src/utils");
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
          "--allow-unsafe",
        ],
        expected: {
          i: "input.spec.json",
          allowUnsafe: true,
        },
      },
    ];
    argSets.forEach((argSet) => {
      expect(setArgs(argSet.args)).to.deep.include(argSet.expected);
    });
  });

  // Test that config overrides are set correctly
  it("Config overrides are set correctly", async function () {
    // This test takes a bit longer
    this.timeout(5000);
    
    configSets = [
      {
        // Input override
        args: ["node", "runTests.js", "--input", "input.spec.json"],
        expected: { input: [path.resolve(process.cwd(), "input.spec.json")] },
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
        expected: { input: [path.resolve(process.cwd(), "input.spec.json")], logLevel: "debug" },
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
        ],
        expected: {
          input: [path.resolve(process.cwd(), "input.spec.json")],
          logLevel: "debug",
        },
      },
      {
        // Referenced config without overrides
        args: ["node", "runTests.js", "--config", "./test/test-config.json"],
        expected: {
          input: process.cwd(),
          logLevel: "silent",
          recursive: true,
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
          input: [path.resolve(process.cwd(), "input.spec.json")],
          logLevel: "silent",
          recursive: true,
        },
      },
      {
        // Multiple inputs
        args: [
          "node",
          "runTests.js",
          "--config",
          "./test/test-config.json",
          "--input",
          "input.spec.json,anotherInput.spec.json",
        ],
        expected: {
          input: [path.resolve(process.cwd(), "input.spec.json"), path.resolve(process.cwd(), "anotherInput.spec.json")],
          output: process.cwd(),
          recursive: true,
        },
      },
      {
        // allow-unsafe override
        args: [
          "node",
          "runTests.js",
          "--input",
          "input.spec.json",
          "--allow-unsafe",
        ],
        expected: {
          input: [path.resolve(process.cwd(), "input.spec.json")],
          allowUnsafeSteps: true,
        },
      }
    ];

    // Use process.stdout.write directly to force console output during tests
    console.log('\n===== CONFIG TEST RESULTS =====\n');
    
    // Use Promise.all with map instead of forEach to properly handle async operations
    await Promise.all(configSets.map(async (configSet, index) => {
      // Set config with the args
      console.log(`Config test ${index}: ${JSON.stringify(configSet, null, 2)}`);
      const configResult = await setConfig({ args: setArgs(configSet.args) });
      console.log(`Config result ${index}: ${JSON.stringify(configResult, null, 2)}\n`);
      // Deeply compare the config result with the expected result
      deepObjectExpect(configResult, configSet.expected);
    }));
    process.stdout.write('===== END CONFIG TEST RESULTS =====\n');
  });

  // Test that results output correctly.
  it("Results output correctly", async () => {
    // Output test-results.json, make sure it exists, and clean it up.
    const inputResultsPath = path.resolve("./test/test-results.json");
    const inputResultsJSON = require(inputResultsPath);
    const outputResultsPath = path.resolve("./test/output-test-results.json");
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
    // Make sure the property exists in actual
    expect(actual).to.have.property(key);
    
    // If value is null, check directly
    if (value === null) {
      expect(actual[key]).to.equal(null);
    }
    // If value is an array, check each item
    else if (Array.isArray(value)) {
      expect(Array.isArray(actual[key])).to.equal(true, `Expected ${key} to be an array. Expected: ${expected[key]}. Actual: ${actual[key]}.`);
      expect(actual[key].length).to.equal(value.length, `Expected ${key} array to have length ${value.length}. Actual: ${actual[key].length}`);

      // Check each array item
      value.forEach((item, index) => {
        if (typeof item === "object" && item !== null) {
          deepObjectExpect(actual[key][index], item);
        } else {
          expect(actual[key][index]).to.equal(item);
        }
      });
    }
    // If value is an object but not null, recursively check it
    else if (typeof value === "object") {
      deepObjectExpect(actual[key], expected[key]);
    } 
    // Otherwise, check that the value is correct
    else {
      const expectedObject = {};
      expectedObject[key] = value;
      expect(actual).to.deep.include(expectedObject);
    }
  });
}
