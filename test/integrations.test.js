import assert from "node:assert/strict";
import { registerUploader, getIntegrationConfig, uploadChangedFiles } from "../dist/core/integrations/index.js";

describe("Integrations", function () {
  this.timeout(30000);

  describe("registerUploader()", function () {
    it("registers valid uploader without error", function () {
      assert.doesNotThrow(() => {
        registerUploader({
          canHandle: (type) => type === "test",
          upload: async () => ({ status: "PASS", description: "test" })
        });
      });
    });

    it("throws for null uploader", function () {
      assert.throws(() => registerUploader(null), /canHandle|upload/i);
    });

    it("throws for uploader missing canHandle", function () {
      assert.throws(() => registerUploader({ upload: async () => {} }), /canHandle|upload/i);
    });

    it("throws for uploader missing upload", function () {
      assert.throws(() => registerUploader({ canHandle: () => true }), /canHandle|upload/i);
    });

    it("throws for non-function canHandle", function () {
      assert.throws(() => registerUploader({ canHandle: "not a function", upload: async () => {} }), /canHandle|upload/i);
    });
  });

  describe("getIntegrationConfig()", function () {
    it("returns matching integration config", function () {
      const config = {
        integrations: {
          heretto: [{ name: "test-instance", orgId: "abc" }]
        }
      };
      const source = { type: "heretto", integrationName: "test-instance" };
      const result = getIntegrationConfig(config, source);
      assert.deepEqual(result, { name: "test-instance", orgId: "abc" });
    });

    it("returns null for non-matching integration name", function () {
      const config = {
        integrations: {
          heretto: [{ name: "test" }]
        }
      };
      const source = { type: "heretto", integrationName: "nonexistent" };
      const result = getIntegrationConfig(config, source);
      assert.equal(result, null);
    });

    it("returns null for unknown integration type", function () {
      const config = {
        integrations: {
          heretto: [{ name: "test" }]
        }
      };
      const source = { type: "unknown", integrationName: "test" };
      const result = getIntegrationConfig(config, source);
      assert.equal(result, null);
    });

    it("returns null when integrations is empty", function () {
      const config = { integrations: {} };
      const source = { type: "heretto", integrationName: "test" };
      const result = getIntegrationConfig(config, source);
      assert.equal(result, null);
    });

    it("returns null when source has no type", function () {
      const config = { integrations: { heretto: [{ name: "test" }] } };
      const source = { integrationName: "test" };
      const result = getIntegrationConfig(config, source);
      assert.equal(result, null);
    });
  });

  describe("uploadChangedFiles()", function () {
    it("returns early with no changed files", async function () {
      const report = {
        specs: [{
          tests: [{
            contexts: [{
              steps: [
                { screenshot: true, outputs: { changed: false } }
              ]
            }]
          }]
        }]
      };
      const config = { integrations: {} };
      const result = await uploadChangedFiles({
        config,
        report,
        log: () => {}
      });
      // When no changed files, total should be 0
      assert.equal(result.total, 0);
    });

    it("handles report with no specs", async function () {
      const report = { specs: [] };
      const config = { integrations: {} };
      const result = await uploadChangedFiles({
        config,
        report,
        log: () => {}
      });
      assert.equal(result.total, 0);
    });

    it("skips upload when no matching uploader found", async function () {
      // Register a mock uploader that only handles "mock" type
      registerUploader({
        canHandle: (type) => type === "mock-skip-test",
        upload: async () => ({ status: "PASS", description: "uploaded" })
      });

      const report = {
        specs: [{
          tests: [{
            contexts: [{
              steps: [{
                screenshot: true,
                outputs: {
                  changed: true,
                  sourceIntegration: { type: "unknown-type", integrationName: "test" }
                }
              }]
            }]
          }]
        }]
      };
      const config = { integrations: {} };
      const result = await uploadChangedFiles({
        config,
        report,
        log: () => {}
      });
      assert.ok(result.total > 0);
      assert.ok(result.skipped > 0);
    });
  });
});
