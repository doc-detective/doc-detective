import { spawnCommand } from "../dist/utils.js";
import assert from "node:assert/strict";
import http from "node:http";

// A DOC_DETECTIVE_API run never writes to `-o`/config.output — cli.ts routes
// its results through reportResults() (a POST back to the orchestration
// API's /contexts endpoint) instead of outputResults(). The results object is
// logged to stderr as a "(DEBUG) RESULTS:" marker followed by pretty JSON, so
// tests recover it from there rather than waiting on a file that this run mode
// never produces. The dump is debug-level (ADR 01064 demoted it from info so it
// no longer floods the default-level terminal), so these tests run the CLI at
// logLevel "debug" via DOC_DETECTIVE_CONFIG to surface it.
function extractResultsJson(stdout) {
  const marker = "(DEBUG) RESULTS:";
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

    // Set environment variables. logLevel "debug" surfaces the "(DEBUG)
    // RESULTS:" dump that extractResultsJson parses (ADR 01064 demoted it from
    // info); the API path writes no results file, so the log is the only source.
    const originalEnv = process.env.DOC_DETECTIVE_API;
    const originalConfigEnv = process.env.DOC_DETECTIVE_CONFIG;
    process.env.DOC_DETECTIVE_API = JSON.stringify(apiConfig);
    process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ logLevel: "debug" });

    try {
      const result = await spawnCommand("node ./bin/doc-detective.js");

      assert.equal(
        result.exitCode,
        0,
        `Expected a successful run. exitCode=${result.exitCode}\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
      );
      const testResult = extractResultsJson(result.stderr);
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
      if (originalConfigEnv !== undefined) {
        process.env.DOC_DETECTIVE_CONFIG = originalConfigEnv;
      } else {
        delete process.env.DOC_DETECTIVE_CONFIG;
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
      const testResult = extractResultsJson(result.stderr);

      // Check that tests were run
      assert.ok(testResult.summary);
      assert.ok(testResult.specs);
      // The API-fetched config sets logLevel "info"; only the
      // DOC_DETECTIVE_CONFIG override raises it to "debug", which is the only
      // thing that would make the runner emit "(DEBUG)"-prefixed log lines.
      assert.match(
        result.stderr,
        /\(DEBUG\)/,
        `Expected debug-level log output, indicating the DOC_DETECTIVE_CONFIG logLevel override was applied. Full stdout:\n${result.stdout}`
      );
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

  it("deep-merges DOC_DETECTIVE_CONFIG into the fetched config, end to end", async () => {
    // Its own server, so the payload can carry a nested config. A dry run
    // prints the merged config without running anything.
    const payload = {
      resolvedTestsId: "deep-merge",
      config: { telemetry: { send: true, userId: "api-user" } },
      specs: [
        { specId: "s", tests: [{ testId: "t", contexts: [{ contextId: "c", steps: [{ stepId: "1", wait: 1 }] }] }] },
      ],
    };
    const server = http.createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(payload));
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const saved = { api: process.env.DOC_DETECTIVE_API, config: process.env.DOC_DETECTIVE_CONFIG };
    process.env.DOC_DETECTIVE_API = JSON.stringify({
      accountId: "a",
      url: `http://127.0.0.1:${server.address().port}`,
      token: "t",
      contextIds: "c",
    });
    process.env.DOC_DETECTIVE_CONFIG = JSON.stringify({ telemetry: { send: false }, autoUpdate: false });
    try {
      const result = await spawnCommand("node ./bin/doc-detective.js --dry-run");
      assert.equal(result.exitCode, 0, `stderr:\n${result.stderr}`);
      assert.deepEqual(JSON.parse(result.stdout).config.telemetry, { send: false, userId: "api-user" });
    } finally {
      server.close();
      for (const [key, name] of [["api", "DOC_DETECTIVE_API"], ["config", "DOC_DETECTIVE_CONFIG"]]) {
        if (saved[key] === undefined) delete process.env[name];
        else process.env[name] = saved[key];
      }
    }
  });
});
