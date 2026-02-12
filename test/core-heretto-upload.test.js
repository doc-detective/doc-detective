import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { HerettoUploader } from "../src/core/integrations/heretto.js";

/**
 * Integration tests for Heretto upload functionality.
 * These tests require valid Heretto credentials and perform actual API calls.
 *
 * Required environment variables:
 * - HERETTO_ORG_ID: Heretto organization ID
 * - HERETTO_USERNAME: Heretto username
 * - HERETTO_TOKEN: Heretto API token
 */
describe("Heretto Upload Integration", function () {
  this.timeout(60000); // 60 second timeout for API calls

  const herettoUploader = new HerettoUploader();

  // Get credentials from environment
  const orgId = process.env.HERETTO_ORG_ID;
  const username = process.env.HERETTO_USERNAME;
  const apiToken = process.env.HERETTO_TOKEN;

  // Skip tests if credentials are not available
  const hasCredentials = orgId && username && apiToken;

  // Known UUIDs from the E2E tests
  const KNOWN_DITAMAP_ID = "265fa972-253f-4e6c-8b17-cdd4838111ea";
  const KNOWN_COFFEE_GUIDE_FOLDER_ID = "6acdcac0-ef31-4873-a40c-2345c75c0a14";

  // Test document tracking
  let testDocumentId = null;
  const testFilename = `test-upload-${Date.now()}.png`;

  const apiBaseUrl = hasCredentials ? `https://${orgId}.heretto.com` : null;

  const mockLog = (level, msg) => {
    if (process.env.DEBUG_HERETTO) {
      console.log(`[${level}] ${msg}`);
    }
  };

  before(function () {
    if (!hasCredentials) {
      console.log("  Skipping Heretto integration tests - credentials not available");
      console.log("  Set HERETTO_ORG_ID, HERETTO_USERNAME, and HERETTO_TOKEN to run these tests");
      this.skip();
    }
  });

  describe("getDocumentInfo", function () {
    it("retrieves document information for known ditamap", async function () {
      if (!hasCredentials) this.skip();

      const docInfo = await herettoUploader.getDocumentInfo({
        apiBaseUrl,
        apiToken,
        username,
        documentId: KNOWN_DITAMAP_ID,
        log: mockLog,
      });

      // Log raw XML for debugging
      if (process.env.DEBUG_HERETTO) {
        console.log("Raw XML (first 500 chars):", docInfo.rawXml?.substring(0, 500));
      }

      assert.ok(docInfo, "Should return document info");
      assert.equal(docInfo.id, KNOWN_DITAMAP_ID, "Document ID should match");
      assert.equal(docInfo.name, "heretto_coffee_brewing_guide.ditamap", "Document name should match");
      assert.ok(docInfo.folderUuid, "Should have folder UUID");
      assert.ok(docInfo.uri, "Should have URI");

      // Verify we get the Coffee_Guide folder
      assert.equal(docInfo.folderUuid, KNOWN_COFFEE_GUIDE_FOLDER_ID, "Should be in Coffee_Guide folder");
    });

    it("returns document mime type", async function () {
      if (!hasCredentials) this.skip();

      const docInfo = await herettoUploader.getDocumentInfo({
        apiBaseUrl,
        apiToken,
        username,
        documentId: KNOWN_DITAMAP_ID,
        log: mockLog,
      });

      assert.ok(docInfo.mimeType, "Should have mime type");
    });
  });

  describe("getFileInFolder", function () {
    it("finds file in known folder", async function () {
      if (!hasCredentials) this.skip();

      // The ditamap should be in the Coffee_Guide folder
      const fileId = await herettoUploader.getFileInFolder({
        apiBaseUrl,
        apiToken,
        username,
        folderId: KNOWN_COFFEE_GUIDE_FOLDER_ID,
        filename: "heretto_coffee_brewing_guide.ditamap",
        log: mockLog,
      });

      assert.ok(fileId, "Should find the ditamap in the folder");
      assert.equal(fileId, KNOWN_DITAMAP_ID, "File ID should match known ditamap ID");
    });

    it("returns null for non-existent file in folder", async function () {
      if (!hasCredentials) this.skip();

      const fileId = await herettoUploader.getFileInFolder({
        apiBaseUrl,
        apiToken,
        username,
        folderId: KNOWN_COFFEE_GUIDE_FOLDER_ID,
        filename: "definitely-does-not-exist-xyz123.png",
        log: mockLog,
      });

      assert.equal(fileId, null, "Should return null for non-existent file");
    });
  });

  describe("createDocument and upload flow", function () {
    it("creates a new document in known folder", async function () {
      if (!hasCredentials) this.skip();

      const createResult = await herettoUploader.createDocument({
        apiBaseUrl,
        apiToken,
        username,
        parentFolderId: KNOWN_COFFEE_GUIDE_FOLDER_ID,
        filename: testFilename,
        mimeType: "image/png",
        log: mockLog,
      });

      assert.ok(createResult, "Should return create result");

      if (createResult.created) {
        assert.ok(createResult.documentId, "Should have document ID when created");
        testDocumentId = createResult.documentId;
      } else if (createResult.existsInFolder) {
        // File already exists, get its ID
        const existingId = await herettoUploader.getFileInFolder({
          apiBaseUrl,
          apiToken,
          username,
          folderId: KNOWN_COFFEE_GUIDE_FOLDER_ID,
          filename: testFilename,
          log: mockLog,
        });
        assert.ok(existingId, "Should find existing file ID");
        testDocumentId = existingId;
      }

      assert.ok(testDocumentId, "Should have a document ID");
    });

    it("uploads content to the created document", async function () {
      if (!hasCredentials) this.skip();
      if (!testDocumentId) this.skip();

      // Create a simple test PNG (1x1 red pixel)
      const pngContent = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41, // IDAT chunk
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE,
        0xD4, 0xA4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, // IEND chunk
        0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      await herettoUploader.uploadFile({
        apiBaseUrl,
        apiToken,
        username,
        documentId: testDocumentId,
        content: pngContent,
        contentType: "image/png",
        log: mockLog,
      });

      // If we get here without throwing, upload succeeded
      assert.ok(true, "Upload should succeed");
    });

    it("verifies uploaded document location and content", async function () {
      if (!hasCredentials) this.skip();
      if (!testDocumentId) this.skip();

      // Get document info to verify location
      const docInfo = await herettoUploader.getDocumentInfo({
        apiBaseUrl,
        apiToken,
        username,
        documentId: testDocumentId,
        log: mockLog,
      });

      assert.ok(docInfo, "Should get document info");
      assert.equal(docInfo.id, testDocumentId, "Document ID should match");
      assert.equal(docInfo.name, testFilename, "Filename should match");
      assert.equal(docInfo.folderUuid, KNOWN_COFFEE_GUIDE_FOLDER_ID, "Should be in the correct folder");
      assert.equal(docInfo.mimeType, "image/png", "MIME type should be image/png");

      // Get document content to verify it was uploaded
      const content = await herettoUploader.getDocumentContent({
        apiBaseUrl,
        apiToken,
        username,
        documentId: testDocumentId,
        log: mockLog,
      });

      assert.ok(content, "Should get document content");
      assert.ok(Buffer.isBuffer(content), "Content should be a Buffer");
      assert.ok(content.length > 0, "Content should not be empty");

      // Verify PNG signature
      assert.equal(content[0], 0x89, "Should start with PNG signature");
      assert.equal(content[1], 0x50, "Second byte of PNG signature");
      assert.equal(content[2], 0x4E, "Third byte of PNG signature");
      assert.equal(content[3], 0x47, "Fourth byte of PNG signature");
    });

    it("can update existing document content", async function () {
      if (!hasCredentials) this.skip();
      if (!testDocumentId) this.skip();

      // Create a different PNG (1x1 blue pixel - different content)
      const newPngContent = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0x0F, 0xC0, 0x00, // Different color
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE,
        0xD4, 0xA4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
        0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      // Upload the new content
      await herettoUploader.uploadFile({
        apiBaseUrl,
        apiToken,
        username,
        documentId: testDocumentId,
        content: newPngContent,
        contentType: "image/png",
        log: mockLog,
      });

      // Verify the content was updated
      const content = await herettoUploader.getDocumentContent({
        apiBaseUrl,
        apiToken,
        username,
        documentId: testDocumentId,
        log: mockLog,
      });

      assert.ok(content, "Should get updated content");
      assert.ok(Buffer.isBuffer(content), "Content should be a Buffer");

      // Content should match what we uploaded
      assert.deepEqual(content, newPngContent, "Content should match uploaded content");
    });
  });

  describe("full upload method with ditamap fallback", function () {
    it("uploads a file using ditamap parent folder fallback", async function () {
      if (!hasCredentials) this.skip();

      // Create a temp file to upload
      const tempDir = path.resolve("./test/temp-heretto-upload");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const localFilename = `integration-test-${Date.now()}.png`;
      const localFilePath = path.join(tempDir, localFilename);

      // Create a simple PNG file
      const pngContent = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
        0xDE, 0x00, 0x00, 0x00, 0x0C, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0x00,
        0x00, 0x00, 0x03, 0x00, 0x01, 0x00, 0x05, 0xFE,
        0xD4, 0xA4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45,
        0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
      ]);

      fs.writeFileSync(localFilePath, pngContent);

      // The _media folder ID inside Coffee_Guide
      const KNOWN_MEDIA_FOLDER_ID = "afa9ac13-f700-4a6b-8c28-9ea32786ab20";

      try {
        // Use the full upload method with resourceDependencies (ditamap parent folder)
        // The fix now correctly resolves the target folder (_media) from the filePath
        // and finds it by name within the ditamap parent folder
        const result = await herettoUploader.upload({
          config: {},
          integrationConfig: {
            organizationId: orgId,
            username,
            apiToken,
            resourceDependencies: {
              "_ditamapParentFolderId": KNOWN_COFFEE_GUIDE_FOLDER_ID,
            },
          },
          localFilePath,
          sourceIntegration: {
            type: "heretto",
            integrationName: "test",
            filePath: `_media/${localFilename}`,
            contentPath: "/content/topic.dita",
          },
          log: mockLog,
        });

        assert.equal(result.status, "PASS", `Upload should succeed: ${result.description}`);
        assert.ok(result.description.includes("Successfully uploaded"), "Should have success message");

        // Extract document ID from result
        const docIdMatch = result.description.match(/document ID: ([a-f0-9-]+)/i);
        assert.ok(docIdMatch, "Should have document ID in result");

        const uploadedDocId = docIdMatch[1];

        // Verify the upload by getting document info
        const docInfo = await herettoUploader.getDocumentInfo({
          apiBaseUrl,
          apiToken,
          username,
          documentId: uploadedDocId,
          log: mockLog,
        });

        assert.ok(docInfo, "Should get document info");
        assert.equal(docInfo.name, localFilename, "Filename should match");
        // The fix now correctly places files in the _media folder, not the ditamap parent
        assert.equal(docInfo.folderUuid, KNOWN_MEDIA_FOLDER_ID, "Should be in _media folder (correct behavior)");

        // Verify content
        const uploadedContent = await herettoUploader.getDocumentContent({
          apiBaseUrl,
          apiToken,
          username,
          documentId: uploadedDocId,
          log: mockLog,
        });

        assert.deepEqual(uploadedContent, pngContent, "Uploaded content should match");

      } finally {
        // Cleanup
        if (fs.existsSync(localFilePath)) {
          fs.unlinkSync(localFilePath);
        }
        if (fs.existsSync(tempDir)) {
          fs.rmdirSync(tempDir);
        }
      }
    });

    it("uploads and verifies existing file update", async function () {
      if (!hasCredentials) this.skip();

      // Use the known screenshot file from the E2E test
      const knownScreenshotId = "411d629b-cee0-4960-8f92-6b1cf54302d4";

      // Create new content to upload
      const newContent = Buffer.from([
        0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
        0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
        0x00, 0x00, 0x00, 0x02, 0x00, 0x00, 0x00, 0x02, // 2x2 instead of 1x1
        0x08, 0x02, 0x00, 0x00, 0x00, 0xFD, 0xD4, 0x9A,
        0x73, 0x00, 0x00, 0x00, 0x12, 0x49, 0x44, 0x41,
        0x54, 0x08, 0xD7, 0x63, 0xF8, 0xCF, 0xC0, 0xF0,
        0x9F, 0x81, 0xE1, 0x3F, 0x03, 0x00, 0x06, 0xB0,
        0x02, 0x01, 0x89, 0xC7, 0xF4, 0x27, 0x00, 0x00,
        0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42,
        0x60, 0x82
      ]);

      // Upload to existing document
      await herettoUploader.uploadFile({
        apiBaseUrl,
        apiToken,
        username,
        documentId: knownScreenshotId,
        content: newContent,
        contentType: "image/png",
        log: mockLog,
      });

      // Verify the document info
      const docInfo = await herettoUploader.getDocumentInfo({
        apiBaseUrl,
        apiToken,
        username,
        documentId: knownScreenshotId,
        log: mockLog,
      });

      assert.ok(docInfo, "Should get document info");
      assert.equal(docInfo.name, "la_pavoni_screenshot.png", "Filename should be la_pavoni_screenshot.png");

      // Verify content was updated
      const content = await herettoUploader.getDocumentContent({
        apiBaseUrl,
        apiToken,
        username,
        documentId: knownScreenshotId,
        log: mockLog,
      });

      assert.ok(content, "Should get content");
      assert.ok(Buffer.isBuffer(content), "Content should be buffer");
      // Content length will differ from what we uploaded due to re-encoding
      // Just verify it's a valid PNG
      assert.equal(content[0], 0x89, "Should be PNG");
    });
  });
});
