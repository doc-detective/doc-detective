import { spawnCommand } from "../dist/utils.js";
import assert from "node:assert/strict";

// A DOC_DETECTIVE_API run never writes to `-o`/config.output — cli.ts routes
// its results through reportResults() (a POST back to the orchestration
// API's /contexts endpoint) instead of outputResults(). The results object is
// still logged to stdout as a "(INFO) RESULTS:" marker followed by pretty
// JSON, so tests recover it from there rather than waiting on a file that
// this run mode never produces.
function extractResultsJson(stdout) {
  const marker = "(INFO) RESULTS:";
  const markerIndex = stdout.indexOf(marker);
  assert.ok(
    markerIndex !== -1,
    `Expected "${marker}" in stdout. Full stdout:\n${stdout}`
  );
  const jsonStart = stdout.indexOf("{", markerIndex);
  assert.ok(
    jsonStart !== -1,
    `Expected a JSON results blob after "${marker}". Full stdout:\n${stdout}`
  );
  let depth = 0;
  let jsonEnd = -1;
  let inString = false;
  let escaped = false;
  for (let i = jsonStart; i < stdout.length; i++) {
    const char = stdout[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) {
        jsonEnd = i;
        break;
      }
    }
  }
  assert.ok(
    jsonEnd !== -1,
    `Could not find the end of the JSON results blob. Full stdout:\n${stdout}`
  );
  return JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
}

describe("DOC_DETECTIVE_API environment variable", function () {
  // 5 minutes per test
  this.timeout(300000);

  it("Should fetch and run resolved tests from API", async () => {
    const apiConfig = {
      accountId: "test-account",
      url: "http://localhost:8093/api",
      token: "test-token-123",
      contextIds: "test-context",
    };

    // Set environment variable
    const originalEnv = process.env.DOC_DETECTIVE_API;
    process.env.DOC_DETECTIVE_API = JSON.stringify(apiConfig);

    try {
      const result = await spawnCommand("node ./bin/doc-detective.js");

      assert.equal(
        result.exitCode,
        0,
        `Expected a successful run. exitCode=${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
      const testResult = extractResultsJson(result.stdout);
      console.log(
        "API Result summary:",
        JSON.stringify(testResult.summary, null, 2)
      );

      // Check that tests were run
      assert.ok(testResult.summary);
      assert.ok(testResult.specs);
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
      const result = await spawnCommand("node ./bin/doc-detective.js");

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
      url: "http://localhost:8093/api",
      token: "wrong-token",
      contextIds: "test-context",
    };

    const originalEnv = process.env.DOC_DETECTIVE_API;
    process.env.DOC_DETECTIVE_API = JSON.stringify(apiConfigBadToken);

    try {
      const result = await spawnCommand("node ./bin/doc-detective.js");

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
      url: "http://localhost:8093/api",
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
      const result = await spawnCommand("node ./bin/doc-detective.js");

      assert.equal(
        result.exitCode,
        0,
        `Expected a successful run. exitCode=${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
      const testResult = extractResultsJson(result.stdout);

      // Check that tests were run
      assert.ok(testResult.summary);
      assert.ok(testResult.specs);
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
