const fs = require("fs");
const path = require("path");
const assert = require("assert").strict;
const { runTests } = require("../src/core");
const { createServer } = require("./server");

// Create a server for screenshot tests
const server = createServer({
  port: 8092,
  staticDir: "./test/server/public",
});

let serverStarted = false;

// Start the server before tests
before(async () => {
  try {
    await server.start();
    serverStarted = true;
  } catch (error) {
    if (error.code === "EADDRINUSE") {
      // Server already running from another test file
      console.log("Test server already running on port 8092");
    } else {
      console.error(`Failed to start test server: ${error.message}`);
      throw error;
    }
  }
});

// Stop the server after tests
after(async () => {
  if (!serverStarted) return;
  try {
    await server.stop();
  } catch (error) {
    console.error(`Failed to stop test server: ${error.message}`);
  }
});

describe("Screenshot sourceIntegration preservation", function () {
  this.timeout(60000); // 60 seconds

  const tempDir = path.resolve("./test/temp-screenshot-tests");

  beforeEach(function () {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(function () {
    // Cleanup temp files
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    }
  });

  it("preserves sourceIntegration for new screenshots", async function () {
    const screenshotPath = path.join(tempDir, "new-screenshot.png");
    const tempFilePath = path.join(tempDir, "test-spec.json");

    const testSpec = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092",
            },
            {
              screenshot: {
                path: screenshotPath,
                sourceIntegration: {
                  type: "heretto",
                  integrationName: "test-integration",
                  filePath: "new-screenshot.png",
                  contentPath: "/content/topic.dita",
                },
              },
            },
          ],
        },
      ],
    };

    try {
      fs.writeFileSync(tempFilePath, JSON.stringify(testSpec, null, 2));

      const result = await runTests({ input: tempFilePath, logLevel: "silent" });

      // Find the screenshot step
      const screenshotStep = result.specs[0].tests[0].contexts[0].steps[1];

      // Verify sourceIntegration is preserved
      assert.ok(screenshotStep.outputs.sourceIntegration, "sourceIntegration should be present");
      assert.equal(screenshotStep.outputs.sourceIntegration.type, "heretto");
      assert.equal(screenshotStep.outputs.sourceIntegration.integrationName, "test-integration");
      assert.equal(screenshotStep.outputs.sourceIntegration.filePath, "new-screenshot.png");
      assert.equal(screenshotStep.outputs.sourceIntegration.contentPath, "/content/topic.dita");

      // Verify changed is true for new screenshots
      assert.equal(screenshotStep.outputs.changed, true, "changed should be true for new screenshots");
    } finally {
      // Cleanup temp files
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
    }
  });

  it("preserves sourceIntegration when variation exceeds threshold", async function () {
    const screenshotPath = path.join(tempDir, "variation-screenshot.png");
    const initialFilePath = path.join(tempDir, "initial-spec.json");
    const variationFilePath = path.join(tempDir, "variation-spec.json");

    // First, create an initial screenshot
    const initialSpec = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092",
            },
            {
              screenshot: {
                path: screenshotPath,
                maxVariation: 0,
                overwrite: "false",
              },
            },
          ],
        },
      ],
    };

    // Variation spec to trigger warning
    const variationSpec = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092/drag-drop-test.html", // Different page
            },
            {
              screenshot: {
                path: screenshotPath,
                maxVariation: 0,
                overwrite: "aboveVariation",
                sourceIntegration: {
                  type: "heretto",
                  integrationName: "variation-test",
                  filePath: "variation-screenshot.png",
                  contentPath: "/content/variation-topic.dita",
                },
              },
            },
          ],
        },
      ],
    };

    try {
      fs.writeFileSync(initialFilePath, JSON.stringify(initialSpec, null, 2));
      const initialResult = await runTests({ input: initialFilePath, logLevel: "silent" });
      assert.ok(initialResult, "Initial screenshot run should produce a result");
      assert.ok(fs.existsSync(screenshotPath), "Initial screenshot file should have been created");

      // Now run with a different page to trigger variation warning
      fs.writeFileSync(variationFilePath, JSON.stringify(variationSpec, null, 2));

      const result = await runTests({ input: variationFilePath, logLevel: "silent" });

      const screenshotStep = result.specs[0].tests[0].contexts[0].steps[1];

      // Verify the step is a WARNING (variation exceeded)
      assert.equal(screenshotStep.result, "WARNING");

      // Verify sourceIntegration is preserved
      assert.ok(screenshotStep.outputs.sourceIntegration, "sourceIntegration should be present");
      assert.equal(screenshotStep.outputs.sourceIntegration.type, "heretto");
      assert.equal(screenshotStep.outputs.sourceIntegration.integrationName, "variation-test");

      // Verify changed is true
      assert.equal(screenshotStep.outputs.changed, true, "changed should be true when variation exceeds threshold");
    } finally {
      // Cleanup temp files
      if (fs.existsSync(initialFilePath)) fs.unlinkSync(initialFilePath);
      if (fs.existsSync(variationFilePath)) fs.unlinkSync(variationFilePath);
      if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
    }
  });

  it("preserves sourceIntegration when screenshot is within variation", async function () {
    const screenshotPath = path.join(tempDir, "same-screenshot.png");
    const initialFilePath = path.join(tempDir, "initial-spec.json");
    const sameFilePath = path.join(tempDir, "same-spec.json");

    // First, create an initial screenshot
    const initialSpec = {
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

    // Same page spec to test within variation
    const samePageSpec = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092", // Same page
            },
            {
              screenshot: {
                path: screenshotPath,
                maxVariation: 0.95, // High threshold to ensure within variation
                overwrite: "aboveVariation",
                sourceIntegration: {
                  type: "heretto",
                  integrationName: "same-page-test",
                  filePath: "same-screenshot.png",
                  contentPath: "/content/same-topic.dita",
                },
              },
            },
          ],
        },
      ],
    };

    try {
      fs.writeFileSync(initialFilePath, JSON.stringify(initialSpec, null, 2));
      await runTests({ input: initialFilePath, logLevel: "silent" });

      // Now run with the same page (should be within variation)
      fs.writeFileSync(sameFilePath, JSON.stringify(samePageSpec, null, 2));

      const result = await runTests({ input: sameFilePath, logLevel: "silent" });

      const screenshotStep = result.specs[0].tests[0].contexts[0].steps[1];

      // Verify the step passed (within variation)
      assert.equal(screenshotStep.result, "PASS");

      // Verify sourceIntegration is preserved
      assert.ok(screenshotStep.outputs.sourceIntegration, "sourceIntegration should be present");
      assert.equal(screenshotStep.outputs.sourceIntegration.type, "heretto");
      assert.equal(screenshotStep.outputs.sourceIntegration.integrationName, "same-page-test");

      // Verify changed is false (within variation, no update)
      assert.equal(screenshotStep.outputs.changed, false, "changed should be false when within variation");
    } finally {
      // Cleanup temp files
      if (fs.existsSync(initialFilePath)) fs.unlinkSync(initialFilePath);
      if (fs.existsSync(sameFilePath)) fs.unlinkSync(sameFilePath);
      if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
    }
  });

  it("does not set sourceIntegration when not provided", async function () {
    const screenshotPath = path.join(tempDir, "no-integration-screenshot.png");
    const tempFilePath = path.join(tempDir, "test-spec.json");

    const testSpec = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092",
            },
            {
              screenshot: {
                path: screenshotPath,
              },
            },
          ],
        },
      ],
    };

    try {
      fs.writeFileSync(tempFilePath, JSON.stringify(testSpec, null, 2));

      const result = await runTests({ input: tempFilePath, logLevel: "silent" });

      const screenshotStep = result.specs[0].tests[0].contexts[0].steps[1];

      // Verify sourceIntegration is NOT set
      assert.equal(screenshotStep.outputs.sourceIntegration, undefined, "sourceIntegration should not be set when not provided");
    } finally {
      // Cleanup temp files
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
    }
  });
});
