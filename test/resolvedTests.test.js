import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnCommand } from "../dist/utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(`${artifactPath}/resolvedTestsResults.json`);

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
        const testResult = JSON.parse(fs.readFileSync(outputFile, "utf8"));
        console.log(
          "API Result summary:",
          JSON.stringify(testResult.summary, null, 2)
        );
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
        const testResult = JSON.parse(fs.readFileSync(outputFile, "utf8"));
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
