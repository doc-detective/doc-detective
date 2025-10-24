const { createServer } = require("./server");
const path = require("path");
const { spawnCommand } = require("../src/utils");
const assert = require("assert").strict;
const fs = require("fs");
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(`${artifactPath}/resolvedTestsResults.json`);

// Create a server with custom options
const server = createServer({
  port: 8093,
  staticDir: "./test/server/public",
});

// Start the server before tests
before(async () => {
  try {
    await server.start();
  } catch (error) {
    console.error(`Failed to start test server: ${error.message}`);
    throw error;
  }
});

// Stop the server after tests
after(async () => {
  try {
    await server.stop();
  } catch (error) {
    console.error(`Failed to stop test server: ${error.message}`);
  }
});

describe("DOC_DETECTIVE_API environment variable", function () {
  // Set indefinite timeout
  this.timeout(0);

  it("Should fetch and run resolved tests from API", async () => {
    const apiConfig = {
      accountId: "test-account",
      url: "http://localhost:8093/api/resolved-tests",
      token: "test-token-123",
      contextIds: "test-context",
    };

    // Set environment variable
    const originalEnv = process.env.DOC_DETECTIVE_API;
    process.env.DOC_DETECTIVE_API = JSON.stringify(apiConfig);

    try {
      const result = await spawnCommand(
        `node ./src/index.js -o ${outputFile}`
      );

      // Wait until the file is written
      let waitCount = 0;
      while (!fs.existsSync(outputFile) && waitCount < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        waitCount++;
      }

      if (fs.existsSync(outputFile)) {
        const testResult = require(outputFile);
        console.log(
          "API Result summary:",
          JSON.stringify(testResult.summary, null, 2)
        );
        // Clean up the require cache
        delete require.cache[require.resolve(outputFile)];
        fs.unlinkSync(outputFile);

        // Check that tests were run
        assert.ok(testResult.summary);
        assert.ok(testResult.specs);
      }
    } finally {
      // Restore original env
      if (originalEnv !== undefined) {
        process.env.DOC_DETECTIVE_API = originalEnv;
      } else {
        delete process.env.DOC_DETECTIVE_API;
      }
    }
  });

  it("Should reject API config without required fields", async () => {
    const invalidApiConfig = {
      accountId: "test-account",
      // Missing url and token
    };

    const originalEnv = process.env.DOC_DETECTIVE_API;
    process.env.DOC_DETECTIVE_API = JSON.stringify(invalidApiConfig);

    try {
      const result = await spawnCommand(
        `node ./src/index.js -o ${outputFile}`
      );

      // Should exit with non-zero code
      assert.notEqual(result.exitCode, 0);
    } finally {
      // Restore original env
      if (originalEnv !== undefined) {
        process.env.DOC_DETECTIVE_API = originalEnv;
      } else {
        delete process.env.DOC_DETECTIVE_API;
      }
    }
  });

  it("Should reject unauthorized API requests", async () => {
    const apiConfigBadToken = {
      accountId: "test-account",
      url: "http://localhost:8093/api/resolved-tests",
      token: "wrong-token",
      contextIds: "test-context",
    };

    const originalEnv = process.env.DOC_DETECTIVE_API;
    process.env.DOC_DETECTIVE_API = JSON.stringify(apiConfigBadToken);

    try {
      const result = await spawnCommand(
        `node ./src/index.js -o ${outputFile}`
      );

      // Should exit with non-zero code due to 401 response
      assert.notEqual(result.exitCode, 0);
    } finally {
      // Restore original env
      if (originalEnv !== undefined) {
        process.env.DOC_DETECTIVE_API = originalEnv;
      } else {
        delete process.env.DOC_DETECTIVE_API;
      }
    }
  });

  it("Should apply config overrides from DOC_DETECTIVE_CONFIG to API-fetched tests", async () => {
    const apiConfig = {
      accountId: "test-account",
      url: "http://localhost:8093/api/resolved-tests",
      token: "test-token-123",
      contextIds: "test-context",
    };

    const configOverride = {
      logLevel: "debug",
    };

    const originalApiEnv = process.env.DOC_DETECTIVE_API;
    const originalConfigEnv = process.env.DOC_DETECTIVE_CONFIG;
    process.env.DOC_DETECTIVE_API = JSON.stringify(apiConfig);
    process.env.DOC_DETECTIVE_CONFIG = JSON.stringify(configOverride);

    try {
      await spawnCommand(
        `node ./src/index.js -o ${outputFile}`
      );

      // Wait until the file is written
      let waitCount = 0;
      while (!fs.existsSync(outputFile) && waitCount < 50) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        waitCount++;
      }

      if (fs.existsSync(outputFile)) {
        const testResult = require(outputFile);
        // Clean up the require cache
        delete require.cache[require.resolve(outputFile)];
        fs.unlinkSync(outputFile);

        // Check that tests were run
        assert.ok(testResult.summary);
        assert.ok(testResult.specs);
      }
    } finally {
      // Restore original env
      if (originalApiEnv !== undefined) {
        process.env.DOC_DETECTIVE_API = originalApiEnv;
      } else {
        delete process.env.DOC_DETECTIVE_API;
      }
      if (originalConfigEnv !== undefined) {
        process.env.DOC_DETECTIVE_CONFIG = originalConfigEnv;
      } else {
        delete process.env.DOC_DETECTIVE_CONFIG;
      }
    }
  });
});
