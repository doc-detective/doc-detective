import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { runSpecs } from "../dist/core/tests.js";
import { getEnvironment } from "../dist/core/config.js";

/**
 * runSpecs only hands the report to the Heretto uploader when an integration
 * opts in with `uploadOnChange: true` (schema default `false`). The uploader
 * sets `report.uploadResults` whenever it runs, even with nothing to upload,
 * so its absence proves the upload never started. Offline: no changed files,
 * so an opted-in run returns an empty summary without calling Heretto.
 */
describe("runSpecs Heretto upload gate (uploadOnChange)", function () {
  this.timeout(120000);
  let tempBase;

  beforeEach(function () {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "dd-heretto-gate-"));
  });

  afterEach(function () {
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  const integration = {
    name: "docs",
    organizationId: "acme",
    username: "user",
    apiToken: "token",
  };

  // Unvalidated resolvedTests on purpose: AJV fills `uploadOnChange: false`
  // on validated configs, so this is the path the runtime default governs.
  function resolvedTests(heretto) {
    return {
      config: {
        logLevel: "silent",
        telemetry: { send: false },
        environment: getEnvironment(),
        concurrentRunners: 1,
        output: tempBase,
        reporters: ["terminal", "json"],
        integrations: { heretto },
      },
      specs: [
        {
          specId: "spec-1",
          tests: [
            {
              testId: "spec-1-test-1",
              contexts: [
                {
                  contextId: "spec-1-test-1-context-1",
                  steps: [{ stepId: "s1", runShell: "echo hi" }],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it("doesn't upload when the integration omits uploadOnChange", async function () {
    const report = await runSpecs({ resolvedTests: resolvedTests([integration]) });
    assert.equal(report.uploadResults, undefined);
  });

  it("doesn't upload when uploadOnChange is false", async function () {
    const report = await runSpecs({
      resolvedTests: resolvedTests([{ ...integration, uploadOnChange: false }]),
    });
    assert.equal(report.uploadResults, undefined);
  });

  it("ignores a top-level config.uploadOnChange", async function () {
    const resolved = resolvedTests([integration]);
    resolved.config.uploadOnChange = true;
    const report = await runSpecs({ resolvedTests: resolved });
    assert.equal(report.uploadResults, undefined);
  });

  it("uploads when an integration sets uploadOnChange: true", async function () {
    const report = await runSpecs({
      resolvedTests: resolvedTests([
        { ...integration, name: "other" },
        { ...integration, uploadOnChange: true },
      ]),
    });
    assert.deepEqual(report.uploadResults, {
      total: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      details: [],
    });
  });
});
