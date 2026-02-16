import assert from "node:assert/strict";
import { setArgs, setConfig, outputResults } from "../dist/utils.js";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

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

    const configSets = [
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
        expected: {
          input: [path.resolve(process.cwd(), "input.spec.json")],
          logLevel: "debug",
        },
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
          input: [
            path.resolve(process.cwd(), "input.spec.json"),
            path.resolve(process.cwd(), "anotherInput.spec.json"),
          ],
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
      },
    ];

    // Use process.stdout.write directly to force console output during tests
    console.log("\n===== CONFIG TEST RESULTS =====\n");

    // Use Promise.all with map instead of forEach to properly handle async operations
    await Promise.all(
      configSets.map(async (configSet, index) => {
        // Set config with the args
        console.log(
          `Config test ${index}: ${JSON.stringify(configSet, null, 2)}`
        );
        const configResult = await setConfig({ args: setArgs(configSet.args) });
        console.log(
          `Config result ${index}: ${JSON.stringify(configResult, null, 2)}\n`
        );
        // Deeply compare the config result with the expected result
        deepObjectExpect(configResult, configSet.expected);
      })
    );
    process.stdout.write("===== END CONFIG TEST RESULTS =====\n");
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

  // Test environment variable config detection
  it("Config from DOC_DETECTIVE_CONFIG environment variable is loaded and merged", async function () {
    this.timeout(5000);

    // Save the original environment variable value
    const originalEnvConfig = process.env.DOC_DETECTIVE_CONFIG;

    try {
      // Ensure env override is not set for the default-value test
      delete process.env.DOC_DETECTIVE_CONFIG;

      // Test 1: Valid environment variable config without file config
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({
        logLevel: "debug",
      });

      const config1 = await setConfig({
        args: setArgs(["node", "runTests.js"]),
      });
      expect(config1.logLevel).to.equal("debug");

      // Test 2: Environment variable config merged with file config (env var takes precedence)
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({
        logLevel: "error",
      });

      const config2 = await setConfig({
        configPath: "./test/test-config.json",
        args: setArgs([
          "node",
          "runTests.js",
          "--config",
          "./test/test-config.json",
        ]),
      });
      // Environment variable should override file config
      expect(config2.logLevel).to.equal("error");
      // Check that other values from file config are preserved
      expect(config2.telemetry.send).to.equal(false);

      // Test 3: Environment variable config with command line args (args take precedence)
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({
        logLevel: "warning",
        input: "env-input.json",
      });

      const config3 = await setConfig({
        args: setArgs([
          "node",
          "runTests.js",
          "--input",
          "cli-input.json",
          "--logLevel",
          "debug",
        ]),
      });
      // Command line args should override environment variable
      expect(config3.logLevel).to.equal("debug");
      expect(config3.input).to.deep.equal([
        path.resolve(process.cwd(), "cli-input.json"),
      ]);
    } finally {
      // Restore the original environment variable value
      if (originalEnvConfig !== undefined) {
        process.env.DOC_DETECTIVE_CONFIG = originalEnvConfig;
      } else {
        delete process.env.DOC_DETECTIVE_CONFIG;
      }
    }
  });

  // Test that false values for recursive and detectSteps are preserved
  it("Preserves false values for recursive and detectSteps config properties", async function () {
    this.timeout(5000);

    // Save original environment variable
    const originalEnvConfig = process.env.DOC_DETECTIVE_CONFIG;

    try {
      // Test 1: Default values when not specified (should be true)
      const config1 = await setConfig({
        args: setArgs(["node", "runTests.js"]),
      });
      expect(config1.recursive).to.equal(
        true,
        "recursive should default to true"
      );
      expect(config1.detectSteps).to.equal(
        true,
        "detectSteps should default to true"
      );

      // Test 2: Explicitly set to false in environment variable
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({
        recursive: false,
        detectSteps: false,
      });

      const config2 = await setConfig({
        args: setArgs(["node", "runTests.js"]),
      });
      expect(config2.recursive).to.equal(
        false,
        "recursive should be false from env var"
      );
      expect(config2.detectSteps).to.equal(
        false,
        "detectSteps should be false from env var"
      );

      // Test 3: Explicitly set to true in environment variable
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({
        recursive: true,
        detectSteps: true,
      });

      const config3 = await setConfig({
        args: setArgs(["node", "runTests.js"]),
      });
      expect(config3.recursive).to.equal(
        true,
        "recursive should be true from env var"
      );
      expect(config3.detectSteps).to.equal(
        true,
        "detectSteps should be true from env var"
      );

      // Test 4: Only one set to false
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({
        recursive: false,
      });

      const config4 = await setConfig({
        args: setArgs(["node", "runTests.js"]),
      });
      expect(config4.recursive).to.equal(
        false,
        "recursive should be false from env var"
      );
      expect(config4.detectSteps).to.equal(
        true,
        "detectSteps should default to true"
      );

      // Test 5: Only detectSteps set to false
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({
        detectSteps: false,
      });

      const config5 = await setConfig({
        args: setArgs(["node", "runTests.js"]),
      });
      expect(config5.recursive).to.equal(
        true,
        "recursive should default to true"
      );
      expect(config5.detectSteps).to.equal(
        false,
        "detectSteps should be false from env var"
      );
    } finally {
      // Restore the original environment variable value
      if (originalEnvConfig !== undefined) {
        process.env.DOC_DETECTIVE_CONFIG = originalEnvConfig;
      } else {
        delete process.env.DOC_DETECTIVE_CONFIG;
      }
    }
  });

  // Test that false values from config file are preserved
  it("Preserves false values for recursive and detectSteps from config file", async function () {
    this.timeout(5000);

    const testConfigDir = path.resolve("./test");

    // Create temporary config files for testing
    const configWithFalseValues = path.join(
      testConfigDir,
      "test-config-false-values.json"
    );
    const configWithTrueValues = path.join(
      testConfigDir,
      "test-config-true-values.json"
    );
    const configWithMixedValues = path.join(
      testConfigDir,
      "test-config-mixed-values.json"
    );

    try {
      // Create config file with both set to false
      fs.writeFileSync(
        configWithFalseValues,
        JSON.stringify(
          {
            recursive: false,
            detectSteps: false,
            logLevel: "silent",
          },
          null,
          2
        )
      );

      // Create config file with both set to true
      fs.writeFileSync(
        configWithTrueValues,
        JSON.stringify(
          {
            recursive: true,
            detectSteps: true,
            logLevel: "silent",
          },
          null,
          2
        )
      );

      // Create config file with mixed values
      fs.writeFileSync(
        configWithMixedValues,
        JSON.stringify(
          {
            recursive: false,
            detectSteps: true,
            logLevel: "silent",
          },
          null,
          2
        )
      );

      // Test 1: Config file with false values
      const config1 = await setConfig({
        configPath: configWithFalseValues,
        args: setArgs([
          "node",
          "runTests.js",
          "--config",
          configWithFalseValues,
        ]),
      });
      expect(config1.recursive).to.equal(
        false,
        "recursive should be false from config file"
      );
      expect(config1.detectSteps).to.equal(
        false,
        "detectSteps should be false from config file"
      );

      // Test 2: Config file with true values
      const config2 = await setConfig({
        configPath: configWithTrueValues,
        args: setArgs([
          "node",
          "runTests.js",
          "--config",
          configWithTrueValues,
        ]),
      });
      expect(config2.recursive).to.equal(
        true,
        "recursive should be true from config file"
      );
      expect(config2.detectSteps).to.equal(
        true,
        "detectSteps should be true from config file"
      );

      // Test 3: Config file with mixed values
      const config3 = await setConfig({
        configPath: configWithMixedValues,
        args: setArgs([
          "node",
          "runTests.js",
          "--config",
          configWithMixedValues,
        ]),
      });
      expect(config3.recursive).to.equal(
        false,
        "recursive should be false from config file"
      );
      expect(config3.detectSteps).to.equal(
        true,
        "detectSteps should be true from config file"
      );
    } finally {
      // Clean up temporary config files
      if (fs.existsSync(configWithFalseValues)) {
        fs.unlinkSync(configWithFalseValues);
      }
      if (fs.existsSync(configWithTrueValues)) {
        fs.unlinkSync(configWithTrueValues);
      }
      if (fs.existsSync(configWithMixedValues)) {
        fs.unlinkSync(configWithMixedValues);
      }
    }
  });

  // Test that environment variable overrides config file for recursive and detectSteps
  it("Environment variable overrides config file for recursive and detectSteps", async function () {
    this.timeout(5000);

    const testConfigDir = path.resolve("./test");
    const testConfigPath = path.join(
      testConfigDir,
      "test-config-override.json"
    );

    // Save original environment variable
    const originalEnvConfig = process.env.DOC_DETECTIVE_CONFIG;

    try {
      // Create config file with true values
      fs.writeFileSync(
        testConfigPath,
        JSON.stringify(
          {
            recursive: true,
            detectSteps: true,
            logLevel: "silent",
          },
          null,
          2
        )
      );

      // Set environment variable with false values
      process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({
        recursive: false,
        detectSteps: false,
      });

      // Environment variable should override file config
      const config = await setConfig({
        configPath: testConfigPath,
        args: setArgs(["node", "runTests.js", "--config", testConfigPath]),
      });

      expect(config.recursive).to.equal(
        false,
        "recursive should be false from env var (overriding config file)"
      );
      expect(config.detectSteps).to.equal(
        false,
        "detectSteps should be false from env var (overriding config file)"
      );
      expect(config.logLevel).to.equal(
        "silent",
        "logLevel should be preserved from config file"
      );
    } finally {
      // Clean up
      if (fs.existsSync(testConfigPath)) {
        fs.unlinkSync(testConfigPath);
      }

      // Restore the original environment variable value
      if (originalEnvConfig !== undefined) {
        process.env.DOC_DETECTIVE_CONFIG = originalEnvConfig;
      } else {
        delete process.env.DOC_DETECTIVE_CONFIG;
      }
    }
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
      expect(Array.isArray(actual[key])).to.equal(
        true,
        `Expected ${key} to be an array. Expected: ${expected[key]}. Actual: ${actual[key]}.`
      );
      expect(actual[key].length).to.equal(
        value.length,
        `Expected ${key} array to have length ${value.length}. Actual: ${actual[key].length}`
      );

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

describe("log() function", function () {
  let log;
  before(async function () {
    const mod = await import("../dist/utils.js");
    log = mod.log;
  });

  it("does not throw with logLevel silent", function () {
    assert.doesNotThrow(() => log("test message", "debug", { logLevel: "silent" }));
  });

  it("does not throw with logLevel debug and level debug", function () {
    assert.doesNotThrow(() => log("test message", "debug", { logLevel: "debug" }));
  });

  it("does not throw with error level", function () {
    assert.doesNotThrow(() => log("error message", "error", { logLevel: "error" }));
  });

  it("does not throw with warning level", function () {
    assert.doesNotThrow(() => log("warn message", "warning", { logLevel: "warning" }));
  });
});

describe("setMeta()", function () {
  let setMeta;
  let originalMeta;

  before(async function () {
    const mod = await import("../dist/utils.js");
    setMeta = mod.setMeta;
  });

  beforeEach(function () {
    originalMeta = process.env.DOC_DETECTIVE_META;
    delete process.env.DOC_DETECTIVE_META;
  });

  afterEach(function () {
    if (originalMeta !== undefined) {
      process.env.DOC_DETECTIVE_META = originalMeta;
    } else {
      delete process.env.DOC_DETECTIVE_META;
    }
  });

  it("sets DOC_DETECTIVE_META environment variable", function () {
    setMeta();
    assert.ok(process.env.DOC_DETECTIVE_META);
    const meta = JSON.parse(process.env.DOC_DETECTIVE_META);
    assert.equal(meta.distribution, "doc-detective");
  });
});

describe("registerReporter()", function () {
  let registerReporter;
  before(async function () {
    const mod = await import("../dist/utils.js");
    registerReporter = mod.registerReporter;
  });

  it("registers a function successfully", function () {
    assert.doesNotThrow(() => registerReporter("test-reporter", () => {}));
  });

  it("throws for non-function reporter", function () {
    assert.throws(() => registerReporter("bad-reporter", "not a function"), /function/i);
  });
});
