import fs from "node:fs";
import { runTests } from "../dist/core/index.js";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";

const artifactPath = path.resolve("./test/core-artifacts");
const config_base = JSON.parse(fs.readFileSync(`${artifactPath}/config.json`, "utf8"));
const inputPath = artifactPath;

describe("Run tests successfully", function () {
  // Set indefinite timeout
  this.timeout(0);
  describe("Core test suite", function () {
    // For each file (not directory) in artifactPath, create an individual test
    const files = fs.readdirSync(artifactPath);
    files.forEach((file) => {
      const filePath = path.join(artifactPath, file);
      if (fs.lstatSync(filePath).isFile() && file.endsWith(".json") && file !== "config.json") {
        it(`Test file: ${file}`, async () => {
          const config_tests = JSON.parse(JSON.stringify(config_base));
          config_tests.runTests.input = filePath;
          const result = await runTests(config_tests);
          if (result === null) assert.fail("Expected result to be non-null");
          assert.equal(result.summary.specs.fail, 0);
        });
      }
    });
  });

  it("Tests skip steps after a failure", async () => {
    const failureTest = {
      tests: [
        {
          steps: [
            {
              runShell: "exit 1", // This step will fail
            },
            {
              runShell:
                "echo 'This step should be skipped if the previous fails'",
            },
          ],
        },
      ],
    };
    // Write the failure test to a temporary file
    const tempFilePath = path.resolve("./test/temp-failure-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(failureTest, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.steps.fail, 1);
      assert.equal(result.summary.steps.skipped, 1);
    } finally {
      // Ensure cleanup even on failure
      fs.unlinkSync(tempFilePath);
    }
  });

  it("Test skips when unsafe and unsafe is disallowed", async () => {
    const unsafeTest = {
      tests: [
        {
          steps: [
            {
              runShell: "echo 'This step is unsafe'",
              unsafe: true, // Marked as potentially unsafe
            },
          ],
        },
      ],
    };
    // Write the unsafe test to a temporary file
    const tempFilePath = path.resolve("./test/temp-unsafe-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(unsafeTest, null, 2));
    const config = {
      input: tempFilePath,
      logLevel: "debug",
      allowUnsafeSteps: false,
    };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      assert.equal(result.summary.specs.skipped, 1);
    } finally {
      // Ensure cleanup even on failure
      fs.unlinkSync(tempFilePath);
    }
  });

  it("Test is marked as skipped when all contexts are skipped", async () => {
    // Create a spec with a context for a different platform than the current one.
    // The resolver will generate a context that doesn't match the current platform,
    // which will cause it to be skipped.
    const currentPlatform = os.platform();
    const targetPlatform = currentPlatform === "win32" ? "linux" : "windows";

    const allContextsSkippedTest = {
      id: "test-all-contexts-skipped",
      contexts: [
        {
          app: { name: "firefox" },
          platforms: [targetPlatform], // Will be skipped on current platform
        },
      ],
      tests: [
        {
          id: "test-1",
          steps: [
            {
              action: "runShell",
              command: "echo 'This should not run'",
            },
          ],
        },
      ],
    };

    // Write the test to a temporary file
    const tempFilePath = path.resolve("./test/temp-all-contexts-skipped.json");
    fs.writeFileSync(
      tempFilePath,
      JSON.stringify(allContextsSkippedTest, null, 2)
    );
    const config = {
      input: tempFilePath,
      logLevel: "silent",
    };
    let result;
    try {
      result = await runTests(config);
      // Verify that the test is marked as skipped, not passed
      assert.equal(result.summary.tests.skipped, 1);
      assert.equal(result.summary.tests.pass, 0);
      assert.equal(result.summary.specs.skipped, 1);
      assert.equal(result.summary.specs.pass, 0);
      assert.equal(result.summary.contexts.skipped, 1);
      // Also verify the actual test result
      assert.equal(result.specs[0].result, "SKIPPED");
      assert.equal(result.specs[0].tests[0].result, "SKIPPED");
      assert.equal(result.specs[0].tests[0].contexts[0].result, "SKIPPED");
    } finally {
      // Ensure cleanup even on failure
      fs.unlinkSync(tempFilePath);
    }
  });

  it("runShell regression test returns WARNING when variation exceeds threshold", async () => {
    // Create a test file path
    const outputFilePath = path.resolve("./test/temp-regression-output.txt");

    // Create initial file with content
    fs.writeFileSync(outputFilePath, "initial content");

    const regressionTest = {
      tests: [
        {
          steps: [
            {
              runShell: {
                command: "echo",
                args: ["completely different content"],
                path: outputFilePath,
                maxVariation: 0.1,
                overwrite: "aboveVariation",
              },
            },
          ],
        },
      ],
    };

    const tempFilePath = path.resolve("./test/temp-regression-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(regressionTest, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    let result;
    try {
      result = await runTests(config);
      // Verify that the step is marked as WARNING, not FAIL
      assert.equal(result.summary.steps.warning, 1);
      assert.equal(result.summary.steps.fail, 0);
      assert.equal(
        result.specs[0].tests[0].contexts[0].steps[0].result,
        "WARNING"
      );
    } finally {
      // Ensure cleanup even on failure
      fs.unlinkSync(tempFilePath);
      if (fs.existsSync(outputFilePath)) {
        fs.unlinkSync(outputFilePath);
      }
    }
  });

  it("screenshot regression test returns WARNING when variation exceeds threshold", async () => {
    // Create a test screenshot path
    const screenshotPath = path.resolve(
      "./test/temp-regression-screenshot.png"
    );
    const screenshotDir = path.dirname(screenshotPath);

    // Ensure directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // First, create an initial screenshot
    const initialTest = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092",
            },
            {
              screenshot: {
                path: screenshotPath,
                maxVariation: 0.05,
                overwrite: "false",
              },
            },
          ],
        },
      ],
    };

    const tempInitialFilePath = path.resolve(
      "./test/temp-initial-screenshot-test.json"
    );
    fs.writeFileSync(tempInitialFilePath, JSON.stringify(initialTest, null, 2));
    const initialConfig = { input: tempInitialFilePath, logLevel: "silent" };

    try {
      // Run initial test to create the baseline screenshot
      await runTests(initialConfig);

      // Now create a test that navigates to a different page to create variation
      const regressionTest = {
        tests: [
          {
            steps: [
              {
                goTo: "http://localhost:8092/drag-drop-test.html",
              },
              {
                screenshot: {
                  path: screenshotPath,
                  maxVariation: 0.05,
                  overwrite: "aboveVariation",
                },
              },
            ],
          },
        ],
      };

      const tempFilePath = path.resolve(
        "./test/temp-screenshot-regression-test.json"
      );
      fs.writeFileSync(tempFilePath, JSON.stringify(regressionTest, null, 2));
      const config = { input: tempFilePath, logLevel: "silent" };

      const result = await runTests(config);

      // Verify that the step is marked as WARNING, not FAIL
      assert.equal(result.summary.steps.warning, 1);
      assert.equal(result.summary.steps.fail, 0);
      assert.equal(
        result.specs[0].tests[0].contexts[0].steps[1].result,
        "WARNING"
      );

      // Cleanup test files
      fs.unlinkSync(tempFilePath);
      fs.unlinkSync(tempInitialFilePath);
    } finally {
      // Ensure cleanup even on failure
      if (fs.existsSync(tempInitialFilePath)) {
        fs.unlinkSync(tempInitialFilePath);
      }
      if (fs.existsSync(screenshotPath)) {
        fs.unlinkSync(screenshotPath);
      }
    }
  });
});

describe("Intelligent goTo behavior", function () {
  // Set indefinite timeout
  this.timeout(0);
  it("goTo fails with timeout on network idle check", async () => {
    const networkTimeoutTest = {
      tests: [
        {
          steps: [
            {
              goTo: {
                url: "http://localhost:8092/waitUntil-test-network-forever.html",
                timeout: 5000,
                waitUntil: {
                  networkIdleTime: 500,
                },
              },
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-network-timeout-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(networkTimeoutTest, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.steps.fail, 1);
      assert.equal(result.summary.tests.fail, 1);
    } finally {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
  });

  it("goTo fails with timeout on DOM idle check", async () => {
    const domTimeoutTest = {
      tests: [
        {
          steps: [
            {
              goTo: {
                url: "http://localhost:8092/waitUntil-test-dom-mutations-forever.html",
                timeout: 5000,
                waitUntil: {
                  domIdleTime: 500,
                },
              },
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-dom-timeout-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(domTimeoutTest, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.steps.fail, 1);
      assert.equal(result.summary.tests.fail, 1);
    } finally {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
  });

  it("goTo fails with timeout on element finding check", async () => {
    const elementTimeoutTest = {
      tests: [
        {
          steps: [
            {
              goTo: {
                url: "http://localhost:8092/index.html",
                timeout: 5000,
                waitUntil: {
                  find: {
                    selector: ".nonexistent-element-that-will-never-appear",
                  },
                },
              },
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-element-timeout-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(elementTimeoutTest, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.steps.fail, 1);
      assert.equal(result.summary.tests.fail, 1);
    } finally {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
  });
});

describe("getRunner() function", function () {
  this.timeout(0); // Indefinite timeout for browser initialization

  let getRunner;

  before(async function () {
    const testsModule = await import("../dist/core/tests.js");
    getRunner = testsModule.getRunner;
  });

  it("should create a runner with default options", async function () {
    let cleanup;
    try {
      const result = await getRunner();
      cleanup = result.cleanup;

      // Verify returned object structure
      assert.ok(result.runner, "runner should be defined");
      assert.ok(result.appium, "appium should be defined");
      assert.ok(result.cleanup, "cleanup should be defined");
      assert.ok(result.runStep, "runStep should be defined");

      // Verify runner is functional
      assert.ok(typeof result.runner.url === "function", "runner should have url method");
      assert.ok(typeof result.runner.deleteSession === "function", "runner should have deleteSession method");

      // Verify appium process
      assert.ok(result.appium.pid, "appium should have a PID");
      assert.ok(!result.appium.killed, "appium should be running");

      // Verify cleanup is a function
      assert.equal(typeof result.cleanup, "function", "cleanup should be a function");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should create a headless runner by default", async function () {
    let cleanup;
    try {
      const result = await getRunner({ headless: true });
      cleanup = result.cleanup;

      // Default should be headless (headless !== false means headless = true)
      // We can't directly check if browser is headless from outside, but we can verify it works
      await result.runner.url("http://localhost:8092/index.html");
      const title = await result.runner.getTitle();
      assert.ok(title, "should be able to navigate and get title in headless mode");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should create a non-headless runner when headless=false", async function () {
    let cleanup;
    try {
      const result = await getRunner({ headless: false });
      cleanup = result.cleanup;

      // Verify runner works in non-headless mode
      await result.runner.url("http://localhost:8092/index.html");
      const title = await result.runner.getTitle();
      assert.ok(title, "should be able to navigate and get title in non-headless mode");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should respect custom width and height", async function () {
    let cleanup;
    try {
      const width = 1024;
      const height = 768;
      const result = await getRunner({ width, height });
      cleanup = result.cleanup;

      // Get window size
      const size = await result.runner.getWindowSize();

      // Allow for small variance (some browsers don't set exact sizes)
      assert.ok(
        Math.abs(size.width - width) <= 10,
        `width should be close to ${width}, got ${size.width}`
      );
      assert.ok(
        Math.abs(size.height - height) <= 10,
        `height should be close to ${height}, got ${size.height}`
      );
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should use default width and height when not specified", async function () {
    let cleanup;
    try {
      const result = await getRunner();
      cleanup = result.cleanup;

      const size = await result.runner.getWindowSize();

      // Default is 1200x800
      assert.ok(
        Math.abs(size.width - 1200) <= 10,
        `default width should be close to 1200, got ${size.width}`
      );
      assert.ok(
        Math.abs(size.height - 800) <= 10,
        `default height should be close to 800, got ${size.height}`
      );
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should accept and use a custom config object", async function () {
    let cleanup;
    try {
      const customConfig = {
        logLevel: "silent",
      };
      const result = await getRunner({ config: customConfig });
      cleanup = result.cleanup;

      // Verify runner was created successfully with custom config
      assert.ok(result.runner, "runner should be created with custom config");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should throw error if Chrome is not available", async function () {
    // This test would require mocking getAvailableApps to return no Chrome
    // Skipping implementation as it would require significant mocking infrastructure
    // In a real scenario, you'd mock the getAvailableApps function
    this.skip();
  });

  it("cleanup function should properly close runner session", async function () {
    const result = await getRunner();
    const { runner, cleanup } = result;

    // Verify runner is active
    await runner.url("http://localhost:8092/index.html");

    // Call cleanup
    await cleanup();

    // Verify session is closed (attempting to use it should fail)
    try {
      await runner.getTitle();
      assert.fail("Should have thrown error after cleanup");
    } catch (error) {
      assert.ok(error, "Should throw error when using runner after cleanup");
    }
  });

  it("cleanup should complete without throwing errors", async function () {
    const result = await getRunner();
    const { appium, cleanup } = result;

    const pid = appium.pid;
    assert.ok(pid, "Appium should have a PID");

    await cleanup();

    assert.ok(true, "Cleanup should complete without error");
  });

  it("cleanup should handle errors gracefully when session already closed", async function () {
    const result = await getRunner();
    const { runner, cleanup } = result;

    // Manually close the session
    await runner.deleteSession();

    // Cleanup should not throw even though session is already closed
    await assert.doesNotReject(
      async () => await cleanup(),
      "cleanup should not throw when session already closed"
    );
  });

  it("should be able to perform basic navigation", async function () {
    let cleanup;
    try {
      const result = await getRunner();
      cleanup = result.cleanup;

      // Verify session is ready before navigating
      await result.runner.getTitle();

      // Navigate to test page
      await result.runner.url("http://localhost:8092/index.html");

      // Verify we can interact with the page
      const title = await result.runner.getTitle();
      assert.ok(title, "should get page title");

      // Verify we can find elements
      const element = await result.runner.$("body");
      assert.ok(element, "should be able to find elements");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should handle multiple sequential runners", async function () {
    // Create first runner
    const result1 = await getRunner();
    await result1.runner.url("http://localhost:8092/index.html");
    const title1 = await result1.runner.getTitle();
    assert.ok(title1, "first runner should work");
    await result1.cleanup();

    // Create second runner after first cleanup
    const result2 = await getRunner();
    await result2.runner.url("http://localhost:8092/index.html");
    const title2 = await result2.runner.getTitle();
    assert.ok(title2, "second runner should work after first cleanup");
    await result2.cleanup();
  });

  it("should return runStep function", async function () {
    let cleanup;
    try {
      const result = await getRunner();
      cleanup = result.cleanup;

      assert.ok(result.runStep, "runStep should be defined");
      assert.equal(typeof result.runStep, "function", "runStep should be a function");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should handle errors during runner initialization", async function () {
    // This would require mocking driverStart to throw an error
    // The actual implementation should cleanup Appium on failure
    // Skipping as it requires mocking infrastructure
    this.skip();
  });

  it("should handle empty options object", async function () {
    let cleanup;
    try {
      const result = await getRunner({});
      cleanup = result.cleanup;

      assert.ok(result.runner, "runner should be created with empty options");
      assert.ok(result.cleanup, "cleanup should be defined");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should handle options with only width specified", async function () {
    let cleanup;
    try {
      const result = await getRunner({ width: 800 });
      cleanup = result.cleanup;

      const size = await result.runner.getWindowSize();
      assert.ok(
        Math.abs(size.width - 800) <= 10,
        `width should be close to 800, got ${size.width}`
      );
      // Height should default to 800
      assert.ok(
        Math.abs(size.height - 800) <= 10,
        `height should default to 800, got ${size.height}`
      );
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should handle options with only height specified", async function () {
    let cleanup;
    try {
      const result = await getRunner({ height: 600 });
      cleanup = result.cleanup;

      const size = await result.runner.getWindowSize();
      // Width should default to 1200
      assert.ok(
        Math.abs(size.width - 1200) <= 10,
        `width should default to 1200, got ${size.width}`
      );
      assert.ok(
        Math.abs(size.height - 600) <= 10,
        `height should be close to 600, got ${size.height}`
      );
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should handle very small window dimensions", async function () {
    let cleanup;
    try {
      const result = await getRunner({ width: 400, height: 300 });
      cleanup = result.cleanup;

      const size = await result.runner.getWindowSize();
      // Browser may have minimum sizes, so we just verify it doesn't crash
      assert.ok(size.width > 0, "width should be positive");
      assert.ok(size.height > 0, "height should be positive");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should handle very large window dimensions", async function () {
    let cleanup;
    try {
      const result = await getRunner({ width: 2560, height: 1440 });
      cleanup = result.cleanup;

      const size = await result.runner.getWindowSize();
      // Verify dimensions are set (may be capped by screen size)
      assert.ok(size.width > 0, "width should be positive");
      assert.ok(size.height > 0, "height should be positive");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("runner should have proper state object initialized", async function () {
    let cleanup;
    try {
      const result = await getRunner();
      cleanup = result.cleanup;

      // Check if runner has state object as per implementation
      assert.ok(result.runner.state !== undefined, "runner should have state object");
      assert.strictEqual(result.runner.state.url, "", "initial url should be empty string");
      assert.strictEqual(result.runner.state.x, null, "initial x should be null");
      assert.strictEqual(result.runner.state.y, null, "initial y should be null");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should allow multiple operations before cleanup", async function () {
    let cleanup;
    try {
      const result = await getRunner();
      cleanup = result.cleanup;

      // Perform multiple operations
      await result.runner.url("http://localhost:8092/index.html");
      await result.runner.getTitle();

      await result.runner.url("http://localhost:8092/waitUntil-test.html");
      await result.runner.getTitle();

      const body = await result.runner.$("body");
      assert.ok(body, "should be able to perform multiple operations");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("cleanup should be idempotent (safe to call multiple times)", async function () {
    const result = await getRunner();
    const { cleanup } = result;

    // Call cleanup multiple times
    await cleanup();

    // Second cleanup should not throw
    await assert.doesNotReject(
      async () => await cleanup(),
      "second cleanup call should not throw"
    );

    // Third cleanup should also not throw
    await assert.doesNotReject(
      async () => await cleanup(),
      "third cleanup call should not throw"
    );
  });

  it("should handle config with logLevel set", async function () {
    let cleanup;
    try {
      const result = await getRunner({
        config: { logLevel: "debug" }
      });
      cleanup = result.cleanup;

      assert.ok(result.runner, "runner should be created with debug log level");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should properly set platform in config", async function () {
    let cleanup;
    try {
      const customConfig = { logLevel: "silent" };
      const result = await getRunner({ config: customConfig });
      cleanup = result.cleanup;

      // The function should set environment.platform based on process.platform
      // We can't directly verify this without exposing internal state,
      // but we verify it doesn't break functionality
      await result.runner.url("http://localhost:8092/index.html");
      assert.ok(await result.runner.getTitle(), "should work with platform set");
    } finally {
      if (cleanup) await cleanup();
    }
  });
});
