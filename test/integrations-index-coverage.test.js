import assert from "node:assert/strict";
import sinon from "sinon";
import {
  collectChangedFiles,
  getUploader,
  registerUploader,
  uploadChangedFiles,
} from "../dist/core/integrations/index.js";

/**
 * Coverage tests for src/core/integrations/index.ts (Phase 10 coverage ratchet).
 * TEST-ONLY, hermetic, offline. No network, no spawns, no filesystem writes.
 *
 * Previously-uncovered surface targeted here:
 *   - uploadChangedFiles() (lines ~90-235): early return, no-uploader skip,
 *     no-config skip, PASS aggregation, non-PASS FAIL aggregation, thrown-error
 *     FAIL aggregation, and mixed aggregation across all four buckets.
 *   - registerUploader() (lines ~262-267): successful registration + the
 *     validation guard that rejects non-conforming uploaders.
 *
 * HERMETIC STRATEGY
 * -----------------
 * The orchestrator resolves an uploader via getUploader() and an integration
 * config via getIntegrationConfig(), then calls uploader.upload(). Two facts
 * about the module shape drive the strategy:
 *   1. getUploader() returns the FIRST registered uploader whose canHandle()
 *      matches; the real HerettoUploader is registered first and matches only
 *      type === "heretto".
 *   2. getIntegrationConfig() only resolves a non-null config for
 *      type === "heretto" (looking up config.integrations.heretto[].name).
 *
 * So the only source integration that reaches the real upload() call is a
 * "heretto"-typed one with a matching heretto config entry. To drive the
 * PASS / non-PASS / throw branches of upload() deterministically and offline,
 * we sinon.stub() the upload() method of the real HerettoUploader singleton
 * (the exact instance getUploader returns) and restore it in afterEach. The
 * stub also lets us assert the exact args the orchestrator passes.
 *
 * For the "no uploader" and "no integration config" skip branches we use a
 * distinct, never-registered integration type, so no stubbing is needed.
 *
 * All path strings use forward slashes as opaque identifiers only; no assertion
 * depends on the host OS, path separators, installed browsers, or timing.
 */

// A log capture that records every (level, message) the orchestrator emits.
function makeLog() {
  const entries = [];
  const log = (_config, level, message) => {
    entries.push({ level, message });
  };
  log.entries = entries;
  return log;
}

// Build a report whose steps each represent one changed file.
function makeReport(files) {
  return {
    specs: [
      {
        specId: "spec-1",
        tests: [
          {
            testId: "test-1",
            contexts: [
              {
                steps: files.map((f, i) => ({
                  stepId: `step-${i}`,
                  screenshot: { path: f.localPath },
                  outputs: {
                    changed: true,
                    screenshotPath: f.localPath,
                    sourceIntegration: f.sourceIntegration,
                  },
                })),
              },
            ],
          },
        ],
      },
    ],
  };
}

// A config that makes getIntegrationConfig resolve for the named heretto
// integration. Credentials are irrelevant because we stub upload().
function herettoConfig(integrationName) {
  return {
    integrations: {
      heretto: [{ name: integrationName, organizationId: "org", apiToken: "tok" }],
    },
  };
}

describe("integrations/index — collectChangedFiles defensive fallbacks", function () {
  // Exercise the `|| []` fallback branches for missing tests/contexts/steps.
  it("handles a spec with no tests array", function () {
    const report = { specs: [{ specId: "spec-1" /* tests missing */ }] };
    assert.deepEqual(collectChangedFiles(report), []);
  });

  it("handles a test with no contexts array", function () {
    const report = {
      specs: [{ specId: "spec-1", tests: [{ testId: "t1" /* contexts missing */ }] }],
    };
    assert.deepEqual(collectChangedFiles(report), []);
  });

  it("handles a context with no steps array", function () {
    const report = {
      specs: [
        {
          specId: "spec-1",
          tests: [{ testId: "t1", contexts: [{ /* steps missing */ }] }],
        },
      ],
    };
    assert.deepEqual(collectChangedFiles(report), []);
  });
});

describe("integrations/index — uploadChangedFiles orchestration", function () {
  let herettoUploader;
  let uploadStub;

  beforeEach(function () {
    // The singleton instance the orchestrator will resolve for "heretto".
    herettoUploader = getUploader({ type: "heretto" });
  });

  afterEach(function () {
    // Restore any stub so the real uploader is untouched for other test files.
    if (uploadStub) {
      uploadStub.restore();
      uploadStub = undefined;
    }
    sinon.restore();
  });

  describe("early return / skip branches", function () {
    it("returns an all-zero summary and logs debug when there are no changed files", async function () {
      const log = makeLog();
      const results = await uploadChangedFiles({ config: {}, report: { specs: [] }, log });

      assert.deepEqual(results, {
        total: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        details: [],
      });
      assert.ok(
        log.entries.some(
          (e) => e.level === "debug" && e.message === "No changed files to upload."
        )
      );
    });

    it("treats a null report as an early return (no changed files)", async function () {
      const log = makeLog();
      const results = await uploadChangedFiles({ config: {}, report: null, log });
      assert.equal(results.total, 0);
      assert.deepEqual(results.details, []);
    });

    it("skips a file when no uploader handles its integration type", async function () {
      const log = makeLog();
      const report = makeReport([
        {
          localPath: "/tmp/no-uploader.png",
          sourceIntegration: { type: "unregistered-cms", integrationName: "acme" },
        },
      ]);

      const results = await uploadChangedFiles({ config: {}, report, log });

      assert.equal(results.total, 1);
      assert.equal(results.skipped, 1);
      assert.equal(results.successful, 0);
      assert.equal(results.failed, 0);
      assert.equal(results.details.length, 1);
      assert.equal(results.details[0].status, "SKIPPED");
      assert.equal(results.details[0].localPath, "/tmp/no-uploader.png");
      assert.ok(results.details[0].reason.includes("unregistered-cms"));
      assert.ok(
        log.entries.some(
          (e) => e.level === "warning" && e.message.includes("No uploader found")
        )
      );
    });

    it("skips a file when an uploader exists but no integration config is found", async function () {
      const log = makeLog();
      // Stub upload so that if the orchestrator wrongly reached it, we'd notice.
      uploadStub = sinon.stub(herettoUploader, "upload").resolves({ status: "PASS" });

      // "heretto" type resolves an uploader, but the config has no matching
      // integration entry -> getIntegrationConfig returns null -> SKIPPED.
      const report = makeReport([
        {
          localPath: "/tmp/no-config.png",
          sourceIntegration: { type: "heretto", integrationName: "missing-name" },
        },
      ]);

      const results = await uploadChangedFiles({
        config: herettoConfig("some-other-name"),
        report,
        log,
      });

      assert.equal(uploadStub.called, false);
      assert.equal(results.total, 1);
      assert.equal(results.skipped, 1);
      assert.equal(results.details[0].status, "SKIPPED");
      assert.ok(results.details[0].reason.includes("No integration config found"));
      assert.ok(
        log.entries.some(
          (e) =>
            e.level === "warning" &&
            e.message.includes("No integration config found")
        )
      );
    });
  });

  describe("upload result aggregation", function () {
    it("aggregates a PASS result and passes the expected args to upload()", async function () {
      const log = makeLog();
      uploadStub = sinon
        .stub(herettoUploader, "upload")
        .resolves({ status: "PASS", description: "uploaded ok" });

      const sourceIntegration = {
        type: "heretto",
        integrationName: "acme",
        filePath: "topic/img.png",
      };
      const report = makeReport([
        { localPath: "/tmp/pass.png", sourceIntegration },
      ]);
      const config = herettoConfig("acme");

      const results = await uploadChangedFiles({ config, report, log });

      assert.equal(results.total, 1);
      assert.equal(results.successful, 1);
      assert.equal(results.failed, 0);
      assert.equal(results.skipped, 0);
      assert.equal(results.details.length, 1);
      assert.deepEqual(results.details[0], {
        localPath: "/tmp/pass.png",
        status: "PASS",
        description: "uploaded ok",
      });

      // Verify the orchestrator invoked upload() with the resolved config,
      // integrationConfig, file path, source integration, and log.
      assert.equal(uploadStub.callCount, 1);
      const callArg = uploadStub.firstCall.args[0];
      assert.equal(callArg.config, config);
      assert.equal(callArg.localFilePath, "/tmp/pass.png");
      assert.equal(callArg.sourceIntegration, sourceIntegration);
      assert.equal(callArg.integrationConfig.name, "acme");
      assert.equal(typeof callArg.log, "function");

      assert.ok(
        log.entries.some(
          (e) =>
            e.level === "info" &&
            e.message === "Successfully uploaded: /tmp/pass.png"
        )
      );
    });

    it("aggregates a non-PASS upload result as a failure", async function () {
      const log = makeLog();
      uploadStub = sinon
        .stub(herettoUploader, "upload")
        .resolves({ status: "FAIL", description: "server rejected" });

      const report = makeReport([
        {
          localPath: "/tmp/fail.png",
          sourceIntegration: {
            type: "heretto",
            integrationName: "acme",
            filePath: "topic/img.png",
          },
        },
      ]);

      const results = await uploadChangedFiles({
        config: herettoConfig("acme"),
        report,
        log,
      });

      assert.equal(results.total, 1);
      assert.equal(results.failed, 1);
      assert.equal(results.successful, 0);
      assert.equal(results.skipped, 0);
      assert.deepEqual(results.details[0], {
        localPath: "/tmp/fail.png",
        status: "FAIL",
        description: "server rejected",
      });
      assert.ok(
        log.entries.some(
          (e) =>
            e.level === "warning" &&
            e.message.includes("Failed to upload /tmp/fail.png")
        )
      );
    });

    it("aggregates a thrown error from upload() as a failure with the error message", async function () {
      const log = makeLog();
      uploadStub = sinon
        .stub(herettoUploader, "upload")
        .rejects(new Error("boom during upload"));

      const report = makeReport([
        {
          localPath: "/tmp/throw.png",
          sourceIntegration: {
            type: "heretto",
            integrationName: "acme",
            filePath: "topic/img.png",
          },
        },
      ]);

      const results = await uploadChangedFiles({
        config: herettoConfig("acme"),
        report,
        log,
      });

      assert.equal(results.total, 1);
      assert.equal(results.failed, 1);
      assert.equal(results.successful, 0);
      assert.equal(results.skipped, 0);
      assert.deepEqual(results.details[0], {
        localPath: "/tmp/throw.png",
        status: "FAIL",
        description: "boom during upload",
      });
      assert.ok(
        log.entries.some(
          (e) =>
            e.level === "warning" &&
            e.message.includes("Error uploading /tmp/throw.png") &&
            e.message.includes("boom during upload")
        )
      );
    });

    it("aggregates a mixed batch across success, failure, throw, and skip buckets", async function () {
      const log = makeLog();
      // Drive upload() differently per call: PASS, non-PASS FAIL, then throw.
      uploadStub = sinon.stub(herettoUploader, "upload");
      uploadStub.onCall(0).resolves({ status: "PASS", description: "ok-1" });
      uploadStub.onCall(1).resolves({ status: "FAIL", description: "bad-2" });
      uploadStub.onCall(2).rejects(new Error("err-3"));

      const report = makeReport([
        {
          localPath: "/tmp/mix-pass.png",
          sourceIntegration: { type: "heretto", integrationName: "acme", filePath: "a.png" },
        },
        {
          localPath: "/tmp/mix-fail.png",
          sourceIntegration: { type: "heretto", integrationName: "acme", filePath: "b.png" },
        },
        {
          localPath: "/tmp/mix-throw.png",
          sourceIntegration: { type: "heretto", integrationName: "acme", filePath: "c.png" },
        },
        {
          // Skipped: no uploader for this type.
          localPath: "/tmp/mix-skip.png",
          sourceIntegration: { type: "unregistered-cms", integrationName: "acme" },
        },
      ]);

      const results = await uploadChangedFiles({
        config: herettoConfig("acme"),
        report,
        log,
      });

      assert.equal(results.total, 4);
      assert.equal(results.successful, 1);
      assert.equal(results.failed, 2);
      assert.equal(results.skipped, 1);
      assert.equal(results.details.length, 4);

      // The uploaded (non-skipped) files were dispatched to upload().
      assert.equal(uploadStub.callCount, 3);

      // Assert the aggregate buckets by status counts (order across the parallel
      // + skip paths is not guaranteed, so assert on structure, not position).
      const statuses = results.details.map((d) => d.status).sort();
      assert.deepEqual(statuses, ["FAIL", "FAIL", "PASS", "SKIPPED"]);

      // Final summary log line is always emitted.
      assert.ok(
        log.entries.some(
          (e) =>
            e.level === "info" &&
            e.message ===
              "Upload complete: 1 successful, 2 failed, 1 skipped"
        )
      );
    });
  });
});

describe("integrations/index — registerUploader", function () {
  it("registers a conforming uploader so getUploader can select it by type", function () {
    const type = `fake-register-${process.pid}-${Date.now()}`;
    const fake = {
      canHandle: (si) => si?.type === type,
      upload: async () => ({ status: "PASS", description: "noop" }),
    };

    registerUploader(fake);

    const selected = getUploader({ type });
    assert.equal(selected, fake);
  });

  it("throws when the uploader is missing canHandle", function () {
    assert.throws(
      () => registerUploader({ upload: async () => ({ status: "PASS" }) }),
      /Uploader must implement canHandle and upload methods/
    );
  });

  it("throws when the uploader is missing upload", function () {
    assert.throws(
      () => registerUploader({ canHandle: () => false }),
      /Uploader must implement canHandle and upload methods/
    );
  });

  it("throws when canHandle/upload are not functions", function () {
    assert.throws(
      () => registerUploader({ canHandle: "nope", upload: 42 }),
      /Uploader must implement canHandle and upload methods/
    );
  });
});
