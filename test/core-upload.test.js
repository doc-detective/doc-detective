import assert from "node:assert/strict";
import {
  collectChangedFiles,
  getIntegrationConfig,
  getUploader,
} from "../src/core/integrations/index.js";

describe("Upload module", function () {
  describe("collectChangedFiles", function () {
    it("returns empty array for null report", function () {
      const result = collectChangedFiles(null);
      assert.deepEqual(result, []);
    });

    it("returns empty array for report without specs", function () {
      const result = collectChangedFiles({});
      assert.deepEqual(result, []);
    });

    it("returns empty array for report with empty specs", function () {
      const result = collectChangedFiles({ specs: [] });
      assert.deepEqual(result, []);
    });

    it("extracts file when changed is true and sourceIntegration present", function () {
      const report = {
        specs: [
          {
            specId: "spec-1",
            tests: [
              {
                testId: "test-1",
                contexts: [
                  {
                    steps: [
                      {
                        stepId: "step-1",
                        screenshot: { path: "test.png" },
                        outputs: {
                          changed: true,
                          screenshotPath: "/path/to/test.png",
                          sourceIntegration: {
                            type: "heretto",
                            integrationName: "example",
                            filePath: "test.png",
                            contentPath: "/content/topic.dita",
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = collectChangedFiles(report);

      assert.equal(result.length, 1);
      assert.equal(result[0].localPath, "/path/to/test.png");
      assert.equal(result[0].sourceIntegration.type, "heretto");
      assert.equal(result[0].sourceIntegration.integrationName, "example");
      assert.equal(result[0].stepId, "step-1");
      assert.equal(result[0].testId, "test-1");
      assert.equal(result[0].specId, "spec-1");
    });

    it("ignores step when changed is false", function () {
      const report = {
        specs: [
          {
            specId: "spec-1",
            tests: [
              {
                testId: "test-1",
                contexts: [
                  {
                    steps: [
                      {
                        stepId: "step-1",
                        screenshot: { path: "test.png" },
                        outputs: {
                          changed: false,
                          screenshotPath: "/path/to/test.png",
                          sourceIntegration: {
                            type: "heretto",
                            integrationName: "example",
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = collectChangedFiles(report);
      assert.equal(result.length, 0);
    });

    it("ignores step when sourceIntegration is missing", function () {
      const report = {
        specs: [
          {
            specId: "spec-1",
            tests: [
              {
                testId: "test-1",
                contexts: [
                  {
                    steps: [
                      {
                        stepId: "step-1",
                        screenshot: { path: "test.png" },
                        outputs: {
                          changed: true,
                          screenshotPath: "/path/to/test.png",
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = collectChangedFiles(report);
      assert.equal(result.length, 0);
    });

    it("ignores step without screenshot property", function () {
      const report = {
        specs: [
          {
            specId: "spec-1",
            tests: [
              {
                testId: "test-1",
                contexts: [
                  {
                    steps: [
                      {
                        stepId: "step-1",
                        goTo: "http://example.com",
                        outputs: {
                          changed: true,
                          sourceIntegration: {
                            type: "heretto",
                            integrationName: "example",
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = collectChangedFiles(report);
      assert.equal(result.length, 0);
    });

    it("collects multiple changed files from different tests", function () {
      const report = {
        specs: [
          {
            specId: "spec-1",
            tests: [
              {
                testId: "test-1",
                contexts: [
                  {
                    steps: [
                      {
                        stepId: "step-1",
                        screenshot: { path: "screenshot1.png" },
                        outputs: {
                          changed: true,
                          screenshotPath: "/path/to/screenshot1.png",
                          sourceIntegration: {
                            type: "heretto",
                            integrationName: "example",
                          },
                        },
                      },
                    ],
                  },
                ],
              },
              {
                testId: "test-2",
                contexts: [
                  {
                    steps: [
                      {
                        stepId: "step-2",
                        screenshot: { path: "screenshot2.png" },
                        outputs: {
                          changed: true,
                          screenshotPath: "/path/to/screenshot2.png",
                          sourceIntegration: {
                            type: "heretto",
                            integrationName: "another",
                          },
                        },
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      };

      const result = collectChangedFiles(report);

      assert.equal(result.length, 2);
      assert.equal(result[0].localPath, "/path/to/screenshot1.png");
      assert.equal(result[1].localPath, "/path/to/screenshot2.png");
    });
  });

  describe("getIntegrationConfig", function () {
    it("returns null for missing sourceIntegration type", function () {
      const config = { integrations: { heretto: [{ name: "example" }] } };
      const result = getIntegrationConfig(config, { integrationName: "example" });
      assert.equal(result, null);
    });

    it("returns null for missing integrationName", function () {
      const config = { integrations: { heretto: [{ name: "example" }] } };
      const result = getIntegrationConfig(config, { type: "heretto" });
      assert.equal(result, null);
    });

    it("returns heretto config when found", function () {
      const herettoConfig = {
        name: "example",
        organizationId: "test-org",
        username: "user",
        apiToken: "token",
      };
      const config = { integrations: { heretto: [herettoConfig] } };
      const sourceIntegration = { type: "heretto", integrationName: "example" };

      const result = getIntegrationConfig(config, sourceIntegration);

      assert.deepEqual(result, herettoConfig);
    });

    it("returns null when heretto config not found by name", function () {
      const config = {
        integrations: {
          heretto: [{ name: "other", organizationId: "org" }],
        },
      };
      const sourceIntegration = { type: "heretto", integrationName: "example" };

      const result = getIntegrationConfig(config, sourceIntegration);
      assert.equal(result, null);
    });

    it("returns null for unknown integration type", function () {
      const config = { integrations: { heretto: [{ name: "example" }] } };
      const sourceIntegration = { type: "unknown", integrationName: "example" };

      const result = getIntegrationConfig(config, sourceIntegration);
      assert.equal(result, null);
    });
  });

  describe("getUploader", function () {
    it("returns null for null sourceIntegration", function () {
      const result = getUploader(null);
      assert.equal(result, null);
    });

    it("returns null for sourceIntegration without type", function () {
      const result = getUploader({ integrationName: "example" });
      assert.equal(result, null);
    });

    it("returns HerettoUploader for heretto type", function () {
      const result = getUploader({ type: "heretto" });
      assert.notEqual(result, null);
      assert.equal(typeof result.canHandle, "function");
      assert.equal(typeof result.upload, "function");
      assert.equal(result.canHandle({ type: "heretto" }), true);
    });

    it("returns null for unknown type", function () {
      const result = getUploader({ type: "unknown-cms" });
      assert.equal(result, null);
    });
  });

  describe("HerettoUploader", function () {
    const HerettoUploader = getUploader({ type: "heretto" });

    describe("resolveFromDependencies", function () {
      const mockLog = () => {};

      it("returns null when resourceDependencies is null", function () {
        const result = HerettoUploader.resolveFromDependencies({
          resourceDependencies: null,
          filePath: "test.png",
          filename: "test.png",
          log: mockLog,
        });
        assert.equal(result, null);
      });

      it("returns null when resourceDependencies is undefined", function () {
        const result = HerettoUploader.resolveFromDependencies({
          resourceDependencies: undefined,
          filePath: "test.png",
          filename: "test.png",
          log: mockLog,
        });
        assert.equal(result, null);
      });

      it("finds exact path match in dependencies", function () {
        const resourceDependencies = {
          "content/media/test.png": { uuid: "file-uuid-123", parentFolderId: "folder-uuid-456" },
        };
        const result = HerettoUploader.resolveFromDependencies({
          resourceDependencies,
          filePath: "content/media/test.png",
          filename: "test.png",
          log: mockLog,
        });
        assert.deepEqual(result, { uuid: "file-uuid-123", parentFolderId: "folder-uuid-456" });
      });

      it("finds path match with leading relative path removed", function () {
        const resourceDependencies = {
          "content/_media/screenshot.png": { uuid: "uuid-1", parentFolderId: "parent-1" },
        };
        const result = HerettoUploader.resolveFromDependencies({
          resourceDependencies,
          filePath: "../_media/screenshot.png",
          filename: "screenshot.png",
          log: mockLog,
        });
        // Should match via filename + folder name
        assert.notEqual(result, null);
      });

      it("finds filename+folder match when exact path does not match", function () {
        const resourceDependencies = {
          "master/content/images/logo.png": { uuid: "uuid-logo", parentFolderId: "images-folder" },
        };
        const result = HerettoUploader.resolveFromDependencies({
          resourceDependencies,
          filePath: "images/logo.png",
          filename: "logo.png",
          log: mockLog,
        });
        assert.deepEqual(result, { uuid: "uuid-logo", parentFolderId: "images-folder" });
      });

      it("finds filename-only match as last resort", function () {
        const resourceDependencies = {
          "totally/different/path/unique-file.png": { uuid: "uuid-unique", parentFolderId: "some-folder" },
        };
        const result = HerettoUploader.resolveFromDependencies({
          resourceDependencies,
          filePath: "other/path/unique-file.png",
          filename: "unique-file.png",
          log: mockLog,
        });
        assert.deepEqual(result, { uuid: "uuid-unique", parentFolderId: "some-folder" });
      });

      it("skips internal keys starting with underscore", function () {
        const resourceDependencies = {
          "_ditamapParentFolderId": "internal-folder-id",
          "_ditamapPath": "some/path.ditamap",
          "real/file.png": { uuid: "real-uuid", parentFolderId: "real-folder" },
        };
        const result = HerettoUploader.resolveFromDependencies({
          resourceDependencies,
          filePath: "_ditamapParentFolderId",
          filename: "_ditamapParentFolderId",
          log: mockLog,
        });
        // Should not match the internal key
        assert.equal(result, null);
      });

      it("returns null when no match found", function () {
        const resourceDependencies = {
          "path/to/other-file.png": { uuid: "uuid-other", parentFolderId: "folder-other" },
        };
        const result = HerettoUploader.resolveFromDependencies({
          resourceDependencies,
          filePath: "completely/different/nonexistent.png",
          filename: "nonexistent.png",
          log: mockLog,
        });
        assert.equal(result, null);
      });

      it("normalizes Windows backslashes to forward slashes", function () {
        const resourceDependencies = {
          "content/_media/image.png": { uuid: "uuid-win", parentFolderId: "folder-win" },
        };
        const result = HerettoUploader.resolveFromDependencies({
          resourceDependencies,
          filePath: "content\\_media\\image.png",
          filename: "image.png",
          log: mockLog,
        });
        assert.deepEqual(result, { uuid: "uuid-win", parentFolderId: "folder-win" });
      });
    });

    describe("findParentFolderFromDependencies", function () {
      const mockLog = () => {};

      it("returns empty result when resourceDependencies is null", function () {
        const result = HerettoUploader.findParentFolderFromDependencies({
          resourceDependencies: null,
          filePath: "_media/test.png",
          log: mockLog,
        });
        assert.deepEqual(result, { folderId: null, targetFolderName: null, ditamapParentFolderId: null });
      });

      it("finds parent folder from sibling file", function () {
        const resourceDependencies = {
          "content/_media/existing-image.png": { uuid: "sibling-uuid", parentFolderId: "media-folder-uuid" },
        };
        const result = HerettoUploader.findParentFolderFromDependencies({
          resourceDependencies,
          filePath: "_media/new-image.png",
          log: mockLog,
        });
        assert.equal(result.folderId, "media-folder-uuid");
        assert.equal(result.targetFolderName, "_media");
      });

      it("finds folder by direct path match", function () {
        const resourceDependencies = {
          "content/_media": { uuid: "direct-folder-uuid" },
        };
        const result = HerettoUploader.findParentFolderFromDependencies({
          resourceDependencies,
          filePath: "_media/new-file.png",
          log: mockLog,
        });
        assert.equal(result.folderId, "direct-folder-uuid");
        assert.equal(result.targetFolderName, "_media");
      });

      it("returns ditamap parent folder info when folder not found", function () {
        const resourceDependencies = {
          "_ditamapParentFolderId": "ditamap-parent-folder-uuid",
          "other/path/file.dita": { uuid: "other-uuid", parentFolderId: "other-folder" },
        };
        const result = HerettoUploader.findParentFolderFromDependencies({
          resourceDependencies,
          filePath: "_nonexistent_folder/new-file.png",
          log: mockLog,
        });
        // folderId should be null (not found), but ditamapParentFolderId should be set for API lookup
        assert.equal(result.folderId, null);
        assert.equal(result.ditamapParentFolderId, "ditamap-parent-folder-uuid");
        assert.equal(result.targetFolderName, "_nonexistent_folder");
      });

      it("prefers sibling file match over ditamap fallback", function () {
        const resourceDependencies = {
          "_ditamapParentFolderId": "ditamap-parent-folder-uuid",
          "content/_media/sibling.png": { uuid: "sibling-uuid", parentFolderId: "correct-media-folder" },
        };
        const result = HerettoUploader.findParentFolderFromDependencies({
          resourceDependencies,
          filePath: "_media/new-file.png",
          log: mockLog,
        });
        assert.equal(result.folderId, "correct-media-folder");
        assert.equal(result.targetFolderName, "_media");
      });

      it("returns null folderId when no folder found and no ditamap fallback", function () {
        const resourceDependencies = {
          "completely/different/path/file.png": { uuid: "some-uuid", parentFolderId: "some-folder" },
        };
        const result = HerettoUploader.findParentFolderFromDependencies({
          resourceDependencies,
          filePath: "_unknown_folder/file.png",
          log: mockLog,
        });
        assert.equal(result.folderId, null);
        assert.equal(result.ditamapParentFolderId, null);
        assert.equal(result.targetFolderName, "_unknown_folder");
      });

      it("normalizes relative path prefixes", function () {
        const resourceDependencies = {
          "content/_media/file.png": { uuid: "uuid", parentFolderId: "media-folder" },
        };
        const result = HerettoUploader.findParentFolderFromDependencies({
          resourceDependencies,
          filePath: "../_media/new-file.png",
          log: mockLog,
        });
        assert.equal(result.folderId, "media-folder");
        assert.equal(result.targetFolderName, "_media");
      });
    });

    describe("canHandle", function () {
      it("returns true for heretto type", function () {
        assert.equal(HerettoUploader.canHandle({ type: "heretto" }), true);
      });

      it("returns false for other types", function () {
        assert.equal(HerettoUploader.canHandle({ type: "other" }), false);
        assert.equal(HerettoUploader.canHandle({ type: "github" }), false);
      });

      it("returns false for null", function () {
        assert.equal(HerettoUploader.canHandle(null), false);
      });

      it("returns false for undefined", function () {
        assert.equal(HerettoUploader.canHandle(undefined), false);
      });
    });

    describe("getContentType", function () {
      it("returns image/png for .png files", function () {
        assert.equal(HerettoUploader.getContentType("test.png"), "image/png");
        assert.equal(HerettoUploader.getContentType("/path/to/image.PNG"), "image/png");
      });

      it("returns image/jpeg for .jpg files", function () {
        assert.equal(HerettoUploader.getContentType("photo.jpg"), "image/jpeg");
        assert.equal(HerettoUploader.getContentType("photo.JPG"), "image/jpeg");
      });

      it("returns image/jpeg for .jpeg files", function () {
        assert.equal(HerettoUploader.getContentType("photo.jpeg"), "image/jpeg");
      });

      it("returns image/gif for .gif files", function () {
        assert.equal(HerettoUploader.getContentType("animation.gif"), "image/gif");
      });

      it("returns image/svg+xml for .svg files", function () {
        assert.equal(HerettoUploader.getContentType("icon.svg"), "image/svg+xml");
      });

      it("returns image/webp for .webp files", function () {
        assert.equal(HerettoUploader.getContentType("modern.webp"), "image/webp");
      });

      it("returns application/octet-stream for unknown extensions", function () {
        assert.equal(HerettoUploader.getContentType("file.unknown"), "application/octet-stream");
        assert.equal(HerettoUploader.getContentType("noextension"), "application/octet-stream");
      });
    });

    describe("escapeXml", function () {
      it("escapes ampersand", function () {
        assert.equal(HerettoUploader.escapeXml("a & b"), "a &amp; b");
      });

      it("escapes less than", function () {
        assert.equal(HerettoUploader.escapeXml("a < b"), "a &lt; b");
      });

      it("escapes greater than", function () {
        assert.equal(HerettoUploader.escapeXml("a > b"), "a &gt; b");
      });

      it("escapes double quotes", function () {
        assert.equal(HerettoUploader.escapeXml('name="value"'), "name=&quot;value&quot;");
      });

      it("escapes single quotes", function () {
        assert.equal(HerettoUploader.escapeXml("it's"), "it&apos;s");
      });

      it("handles multiple special characters", function () {
        assert.equal(HerettoUploader.escapeXml('<tag attr="val">a & b</tag>'), "&lt;tag attr=&quot;val&quot;&gt;a &amp; b&lt;/tag&gt;");
      });

      it("returns empty string for empty input", function () {
        assert.equal(HerettoUploader.escapeXml(""), "");
      });

      it("returns string unchanged when no special characters", function () {
        assert.equal(HerettoUploader.escapeXml("normal text 123"), "normal text 123");
      });
    });

    describe("upload validation", function () {
      it("returns error for missing integrationConfig", async function () {
        const result = await HerettoUploader.upload({
          config: {},
          integrationConfig: null,
          localFilePath: "/path/to/file.png",
          sourceIntegration: { type: "heretto", filePath: "file.png" },
          log: () => {},
        });
        assert.equal(result.status, "FAIL");
        assert.equal(result.description, "No Heretto integration configuration found");
      });

      it("returns error for missing organizationId", async function () {
        const result = await HerettoUploader.upload({
          config: {},
          integrationConfig: { apiToken: "token" },
          localFilePath: "/path/to/file.png",
          sourceIntegration: { type: "heretto", filePath: "file.png" },
          log: () => {},
        });
        assert.equal(result.status, "FAIL");
        assert.equal(result.description, "Heretto integration missing organizationId or apiToken");
      });

      it("returns error for missing apiToken", async function () {
        const result = await HerettoUploader.upload({
          config: {},
          integrationConfig: { organizationId: "org" },
          localFilePath: "/path/to/file.png",
          sourceIntegration: { type: "heretto", filePath: "file.png" },
          log: () => {},
        });
        assert.equal(result.status, "FAIL");
        assert.equal(result.description, "Heretto integration missing organizationId or apiToken");
      });
    });
  });
});
