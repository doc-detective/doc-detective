import assert from "node:assert/strict";
import sinon from "sinon";
import {
  createAuthHeader,
  getBaseUrl,
  validateDitamapInAssets,
  createApiClient,
  createRestApiClient,
  findScenario,
  triggerPublishingJob,
  getJobStatus,
  getJobAssetDetails,
  pollJobStatus,
  downloadAndExtractOutput,
  loadHerettoContent,
} from "../dist/core/integrations/heretto.js";

describe("Heretto Content Loader", function () {
  afterEach(function () {
    sinon.restore();
  });

  describe("createAuthHeader", function () {
    it("should return Base64-encoded 'username:apiToken' string", function () {
      const result = createAuthHeader("user@example.com", "mytoken123");
      const expected = Buffer.from("user@example.com:mytoken123").toString("base64");
      assert.equal(result, expected);
    });

    it("should handle special characters in credentials", function () {
      const result = createAuthHeader("user@example.com", "6FE4PB2/UB+jd9f/UY0+y8CO5Z+yOXrPXxY7k2vqjiAT17Ptg/V6nzpPCxoRKafL");
      const expected = Buffer.from("user@example.com:6FE4PB2/UB+jd9f/UY0+y8CO5Z+yOXrPXxY7k2vqjiAT17Ptg/V6nzpPCxoRKafL").toString("base64");
      assert.equal(result, expected);
    });
  });

  describe("getBaseUrl", function () {
    it("should return the Heretto publishing API URL for the given org", function () {
      const result = getBaseUrl("thunderbird");
      assert.equal(result, "https://thunderbird.heretto.com/ezdnxtgen/api/v2");
    });
  });

  describe("validateDitamapInAssets", function () {
    it("should return true when a .ditamap exists in ot-output/dita/", function () {
      const assets = [
        "ot-output/dita/my-map.ditamap",
        "ot-output/dita/topic.dita",
      ];
      assert.equal(validateDitamapInAssets(assets), true);
    });

    it("should return false when no .ditamap exists", function () {
      const assets = [
        "ot-output/dita/topic.dita",
        "ot-output/dita/image.png",
      ];
      assert.equal(validateDitamapInAssets(assets), false);
    });

    it("should return false when .ditamap is in wrong directory", function () {
      const assets = [
        "other-dir/my-map.ditamap",
      ];
      assert.equal(validateDitamapInAssets(assets), false);
    });

    it("should return false for empty array", function () {
      assert.equal(validateDitamapInAssets([]), false);
    });
  });

  describe("createApiClient", function () {
    const herettoConfig = {
      organizationId: "testorg",
      username: "user@test.com",
      apiToken: "token123",
    };

    it("should return an axios instance with correct baseURL", function () {
      const client = createApiClient(herettoConfig);
      assert.equal(client.defaults.baseURL, "https://testorg.heretto.com/ezdnxtgen/api/v2");
    });

    it("should set Basic auth header", function () {
      const client = createApiClient(herettoConfig);
      const expectedAuth = Buffer.from("user@test.com:token123").toString("base64");
      assert.equal(client.defaults.headers.Authorization, `Basic ${expectedAuth}`);
    });

    it("should set Content-Type to application/json", function () {
      const client = createApiClient(herettoConfig);
      assert.equal(client.defaults.headers["Content-Type"], "application/json");
    });
  });

  describe("createRestApiClient", function () {
    const herettoConfig = {
      organizationId: "testorg",
      username: "user@test.com",
      apiToken: "token123",
    };

    it("should return an axios instance with correct baseURL (no API path)", function () {
      const client = createRestApiClient(herettoConfig);
      assert.equal(client.defaults.baseURL, "https://testorg.heretto.com");
    });

    it("should set Basic auth header", function () {
      const client = createRestApiClient(herettoConfig);
      const expectedAuth = Buffer.from("user@test.com:token123").toString("base64");
      assert.equal(client.defaults.headers.Authorization, `Basic ${expectedAuth}`);
    });

    it("should set Accept header for XML", function () {
      const client = createRestApiClient(herettoConfig);
      assert.equal(client.defaults.headers.Accept, "application/xml, text/xml, */*");
    });
  });

  describe("findScenario", function () {
    let mockClient;
    const mockLog = sinon.stub();
    const mockConfig = {};

    beforeEach(function () {
      mockClient = { get: sinon.stub() };
      mockLog.resetHistory();
    });

    it("should return scenarioId and fileId for a valid scenario", async function () {
      mockClient.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [{ id: "scenario-1", name: "Doc Detective" }] },
      });
      mockClient.get.withArgs("/publishes/scenarios/scenario-1/parameters").resolves({
        data: {
          content: [
            { name: "transtype", value: "dita" },
            { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
            { type: "file_uuid_picker", value: "file-uuid-123" },
          ],
        },
      });

      const result = await findScenario(mockClient, mockLog, mockConfig, "Doc Detective");
      assert.deepEqual(result, { scenarioId: "scenario-1", fileId: "file-uuid-123" });
    });

    it("should return null when scenario is not found", async function () {
      mockClient.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [{ id: "other", name: "Other Scenario" }] },
      });

      const result = await findScenario(mockClient, mockLog, mockConfig, "Doc Detective");
      assert.equal(result, null);
    });

    it("should return null when transtype is not dita", async function () {
      mockClient.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [{ id: "scenario-1", name: "Doc Detective" }] },
      });
      mockClient.get.withArgs("/publishes/scenarios/scenario-1/parameters").resolves({
        data: {
          content: [
            { name: "transtype", value: "html5" },
            { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
            { type: "file_uuid_picker", value: "file-uuid-123" },
          ],
        },
      });

      const result = await findScenario(mockClient, mockLog, mockConfig, "Doc Detective");
      assert.equal(result, null);
    });

    it("should return null when tool-kit-name is missing", async function () {
      mockClient.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [{ id: "scenario-1", name: "Doc Detective" }] },
      });
      mockClient.get.withArgs("/publishes/scenarios/scenario-1/parameters").resolves({
        data: {
          content: [
            { name: "transtype", value: "dita" },
            { type: "file_uuid_picker", value: "file-uuid-123" },
          ],
        },
      });

      const result = await findScenario(mockClient, mockLog, mockConfig, "Doc Detective");
      assert.equal(result, null);
    });

    it("should return null when file_uuid_picker has no value", async function () {
      mockClient.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [{ id: "scenario-1", name: "Doc Detective" }] },
      });
      mockClient.get.withArgs("/publishes/scenarios/scenario-1/parameters").resolves({
        data: {
          content: [
            { name: "transtype", value: "dita" },
            { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
            { type: "file_uuid_picker", value: "" },
          ],
        },
      });

      const result = await findScenario(mockClient, mockLog, mockConfig, "Doc Detective");
      assert.equal(result, null);
    });

    it("should return null on network error", async function () {
      mockClient.get.rejects(new Error("Network error"));

      const result = await findScenario(mockClient, mockLog, mockConfig, "Doc Detective");
      assert.equal(result, null);
    });
  });

  describe("triggerPublishingJob", function () {
    it("should POST to the correct endpoint and return job data", async function () {
      const mockClient = {
        post: sinon.stub().resolves({ data: { jobId: "job-1" } }),
      };

      const result = await triggerPublishingJob(mockClient, "file-uuid", "scenario-1");
      assert.deepEqual(result, { jobId: "job-1" });
      assert.ok(mockClient.post.calledOnceWith("/files/file-uuid/publishes", {
        scenario: "scenario-1",
        parameters: [],
      }));
    });

    it("should propagate errors", async function () {
      const mockClient = {
        post: sinon.stub().rejects(new Error("Server error")),
      };

      await assert.rejects(
        () => triggerPublishingJob(mockClient, "file-uuid", "scenario-1"),
        { message: "Server error" }
      );
    });
  });

  describe("getJobStatus", function () {
    it("should GET the correct endpoint and return status", async function () {
      const mockClient = {
        get: sinon.stub().resolves({ data: { status: { status: "running" } } }),
      };

      const result = await getJobStatus(mockClient, "file-uuid", "job-1");
      assert.deepEqual(result, { status: { status: "running" } });
      assert.ok(mockClient.get.calledOnceWith("/files/file-uuid/publishes/job-1"));
    });
  });

  describe("getJobAssetDetails", function () {
    it("should return all asset file paths from a single page", async function () {
      const mockClient = {
        get: sinon.stub().resolves({
          data: {
            content: [
              { filePath: "ot-output/dita/topic.dita" },
              { filePath: "ot-output/dita/map.ditamap" },
            ],
            totalPages: 1,
          },
        }),
      };

      const result = await getJobAssetDetails(mockClient, "file-uuid", "job-1");
      assert.deepEqual(result, [
        "ot-output/dita/topic.dita",
        "ot-output/dita/map.ditamap",
      ]);
    });

    it("should handle pagination across multiple pages", async function () {
      const mockClient = {
        get: sinon.stub(),
      };
      mockClient.get.onFirstCall().resolves({
        data: {
          content: [{ filePath: "file1.dita" }],
          totalPages: 2,
        },
      });
      mockClient.get.onSecondCall().resolves({
        data: {
          content: [{ filePath: "file2.dita" }],
          totalPages: 2,
        },
      });

      const result = await getJobAssetDetails(mockClient, "file-uuid", "job-1");
      assert.deepEqual(result, ["file1.dita", "file2.dita"]);
      assert.equal(mockClient.get.callCount, 2);
    });

    it("should skip assets without filePath", async function () {
      const mockClient = {
        get: sinon.stub().resolves({
          data: {
            content: [
              { filePath: "file1.dita" },
              { otherProp: "no-path" },
            ],
            totalPages: 1,
          },
        }),
      };

      const result = await getJobAssetDetails(mockClient, "file-uuid", "job-1");
      assert.deepEqual(result, ["file1.dita"]);
    });

    it("should return empty array when no content", async function () {
      const mockClient = {
        get: sinon.stub().resolves({
          data: { content: [], totalPages: 1 },
        }),
      };

      const result = await getJobAssetDetails(mockClient, "file-uuid", "job-1");
      assert.deepEqual(result, []);
    });
  });

  describe("pollJobStatus", function () {
    let mockClient;
    const mockLog = sinon.stub();
    const mockConfig = {};

    beforeEach(function () {
      mockClient = { get: sinon.stub() };
      mockLog.resetHistory();
    });

    it("should return job when it completes immediately with valid ditamap", async function () {
      // getJobStatus returns completed
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1").resolves({
        data: { status: { status: "completed", result: "success" }, jobId: "job-1" },
      });
      // getJobAssetDetails returns assets with ditamap
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1/assets", sinon.match.any).resolves({
        data: {
          content: [{ filePath: "ot-output/dita/map.ditamap" }],
          totalPages: 1,
        },
      });

      const result = await pollJobStatus(mockClient, "file-uuid", "job-1", mockLog, mockConfig);
      assert.ok(result);
      assert.equal(result.jobId, "job-1");
    });

    it("should return null when job completes but no ditamap found", async function () {
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1").resolves({
        data: { status: { status: "completed", result: "success" }, jobId: "job-1" },
      });
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1/assets", sinon.match.any).resolves({
        data: {
          content: [{ filePath: "ot-output/dita/topic.dita" }],
          totalPages: 1,
        },
      });

      const result = await pollJobStatus(mockClient, "file-uuid", "job-1", mockLog, mockConfig);
      assert.equal(result, null);
    });

    it("should return null on network error during polling", async function () {
      mockClient.get.rejects(new Error("Connection refused"));

      const result = await pollJobStatus(mockClient, "file-uuid", "job-1", mockLog, mockConfig);
      assert.equal(result, null);
    });

    it("should poll multiple times before completion", async function () {
      this.timeout(15000);
      // First call: still running
      mockClient.get.onFirstCall().resolves({
        data: { status: { status: "running" }, jobId: "job-1" },
      });
      // Second call: completed
      mockClient.get.onSecondCall().resolves({
        data: { status: { status: "completed", result: "success" }, jobId: "job-1" },
      });
      // Third call: asset details
      mockClient.get.onThirdCall().resolves({
        data: {
          content: [{ filePath: "ot-output/dita/map.ditamap" }],
          totalPages: 1,
        },
      });

      const result = await pollJobStatus(mockClient, "file-uuid", "job-1", mockLog, mockConfig);
      assert.ok(result);
      assert.equal(result.jobId, "job-1");
    });
  });

  describe("downloadAndExtractOutput", function () {
    let mockClient;
    const mockLog = sinon.stub();
    const mockConfig = {};

    beforeEach(function () {
      mockClient = { get: sinon.stub() };
      mockLog.resetHistory();
    });

    it("should download ZIP, extract, and return output directory path", async function () {
      const zipContent = Buffer.from("fake-zip-data");
      mockClient.get.resolves({ data: zipContent });

      // Mock fs
      const mockFs = {
        mkdirSync: sinon.stub(),
        writeFileSync: sinon.stub(),
        unlinkSync: sinon.stub(),
      };

      // Mock AdmZip
      const mockEntries = [
        {
          entryName: "ot-output/dita/topic.dita",
          isDirectory: false,
          getData: sinon.stub().returns(Buffer.from("<topic/>")),
        },
      ];
      const mockZipInstance = { getEntries: sinon.stub().returns(mockEntries) };
      const MockZipClass = sinon.stub().returns(mockZipInstance);

      const result = await downloadAndExtractOutput(
        mockClient,
        "file-uuid",
        "job-1",
        "test-integration",
        mockLog,
        mockConfig,
        { fsModule: mockFs, ZipClass: MockZipClass }
      );

      assert.ok(result);
      assert.ok(result.includes("heretto_"));
      assert.ok(mockClient.get.calledOnce);
      assert.ok(mockFs.writeFileSync.called);
      assert.ok(mockFs.unlinkSync.calledOnce); // cleanup zip
    });

    it("should return null on download failure", async function () {
      mockClient.get.rejects(new Error("Download failed"));

      const mockFs = {
        mkdirSync: sinon.stub(),
        writeFileSync: sinon.stub(),
        unlinkSync: sinon.stub(),
      };

      const result = await downloadAndExtractOutput(
        mockClient,
        "file-uuid",
        "job-1",
        "test-integration",
        mockLog,
        mockConfig,
        { fsModule: mockFs, ZipClass: sinon.stub() }
      );

      assert.equal(result, null);
    });

    it("should skip zip entries with path traversal attempts", async function () {
      const zipContent = Buffer.from("fake-zip-data");
      mockClient.get.resolves({ data: zipContent });

      const mockFs = {
        mkdirSync: sinon.stub(),
        writeFileSync: sinon.stub(),
        unlinkSync: sinon.stub(),
      };

      const mockEntries = [
        {
          entryName: "../../etc/passwd",
          isDirectory: false,
          getData: sinon.stub().returns(Buffer.from("malicious")),
        },
        {
          entryName: "ot-output/dita/safe.dita",
          isDirectory: false,
          getData: sinon.stub().returns(Buffer.from("<topic/>")),
        },
      ];
      const mockZipInstance = { getEntries: sinon.stub().returns(mockEntries) };
      const MockZipClass = sinon.stub().returns(mockZipInstance);

      const result = await downloadAndExtractOutput(
        mockClient,
        "file-uuid",
        "job-1",
        "test-integration",
        mockLog,
        mockConfig,
        { fsModule: mockFs, ZipClass: MockZipClass }
      );

      assert.ok(result);
      // The malicious entry's getData should not have been called
      assert.ok(!mockEntries[0].getData.called);
      // The safe entry's getData should have been called
      assert.ok(mockEntries[1].getData.called);
    });
  });

  describe("loadHerettoContent", function () {
    const mockLog = sinon.stub();
    const mockConfig = {};
    const herettoConfig = {
      name: "test",
      organizationId: "testorg",
      username: "user@test.com",
      apiToken: "token",
    };

    beforeEach(function () {
      mockLog.resetHistory();
    });

    it("should return output path on successful end-to-end flow", async function () {
      const mockClient = {
        get: sinon.stub(),
        post: sinon.stub(),
      };

      // findScenario
      mockClient.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [{ id: "s1", name: "Doc Detective" }] },
      });
      mockClient.get.withArgs("/publishes/scenarios/s1/parameters").resolves({
        data: {
          content: [
            { name: "transtype", value: "dita" },
            { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
            { type: "file_uuid_picker", value: "file-uuid" },
          ],
        },
      });

      // triggerPublishingJob
      mockClient.post.resolves({ data: { jobId: "job-1" } });

      // pollJobStatus - getJobStatus
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1").resolves({
        data: { status: { status: "completed", result: "success" }, jobId: "job-1" },
      });
      // pollJobStatus - getJobAssetDetails
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1/assets", sinon.match.any).resolves({
        data: {
          content: [{ filePath: "ot-output/dita/map.ditamap" }],
          totalPages: 1,
        },
      });

      const deps = {
        createApiClientFn: sinon.stub().returns(mockClient),
        createRestApiClientFn: sinon.stub().returns(mockClient),
        downloadFn: sinon.stub().resolves("/tmp/doc-detective/heretto_abc123"),
      };

      const result = await loadHerettoContent(
        { ...herettoConfig },
        mockLog,
        mockConfig,
        deps
      );
      assert.equal(result, "/tmp/doc-detective/heretto_abc123");
    });

    it("should return null when scenario is not found", async function () {
      const mockClient = { get: sinon.stub(), post: sinon.stub() };
      mockClient.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [] },
      });

      const deps = {
        createApiClientFn: sinon.stub().returns(mockClient),
        createRestApiClientFn: sinon.stub().returns(mockClient),
        downloadFn: sinon.stub(),
      };

      const result = await loadHerettoContent(
        { ...herettoConfig },
        mockLog,
        mockConfig,
        deps
      );
      assert.equal(result, null);
    });

    it("should return null when polling encounters a connection error", async function () {
      const mockClient = { get: sinon.stub(), post: sinon.stub() };

      // findScenario succeeds
      mockClient.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [{ id: "s1", name: "Doc Detective" }] },
      });
      mockClient.get.withArgs("/publishes/scenarios/s1/parameters").resolves({
        data: {
          content: [
            { name: "transtype", value: "dita" },
            { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
            { type: "file_uuid_picker", value: "file-uuid" },
          ],
        },
      });

      // triggerPublishingJob succeeds
      mockClient.post.resolves({ data: { jobId: "job-1" } });

      // pollJobStatus - always running, will eventually error to stop the loop
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1").rejects(
        new Error("Connection timeout")
      );

      const deps = {
        createApiClientFn: sinon.stub().returns(mockClient),
        createRestApiClientFn: sinon.stub().returns(mockClient),
        downloadFn: sinon.stub(),
      };

      const result = await loadHerettoContent(
        { ...herettoConfig },
        mockLog,
        mockConfig,
        deps
      );
      assert.equal(result, null);
    });

    it("should return null when download fails", async function () {
      const mockClient = { get: sinon.stub(), post: sinon.stub() };

      // findScenario
      mockClient.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [{ id: "s1", name: "Doc Detective" }] },
      });
      mockClient.get.withArgs("/publishes/scenarios/s1/parameters").resolves({
        data: {
          content: [
            { name: "transtype", value: "dita" },
            { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
            { type: "file_uuid_picker", value: "file-uuid" },
          ],
        },
      });

      // triggerPublishingJob
      mockClient.post.resolves({ data: { jobId: "job-1" } });

      // pollJobStatus completes
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1").resolves({
        data: { status: { status: "completed", result: "success" }, jobId: "job-1" },
      });
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1/assets", sinon.match.any).resolves({
        data: {
          content: [{ filePath: "ot-output/dita/map.ditamap" }],
          totalPages: 1,
        },
      });

      const deps = {
        createApiClientFn: sinon.stub().returns(mockClient),
        createRestApiClientFn: sinon.stub().returns(mockClient),
        downloadFn: sinon.stub().resolves(null),
      };

      const result = await loadHerettoContent(
        { ...herettoConfig },
        mockLog,
        mockConfig,
        deps
      );
      assert.equal(result, null);
    });

    it("should fetch resource dependencies when uploadOnChange is true", async function () {
      const mockClient = { get: sinon.stub(), post: sinon.stub() };

      // findScenario
      mockClient.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [{ id: "s1", name: "Doc Detective" }] },
      });
      mockClient.get.withArgs("/publishes/scenarios/s1/parameters").resolves({
        data: {
          content: [
            { name: "transtype", value: "dita" },
            { name: "tool-kit-name", value: "default/dita-ot-3.6.1" },
            { type: "file_uuid_picker", value: "file-uuid" },
          ],
        },
      });

      // triggerPublishingJob
      mockClient.post.resolves({ data: { jobId: "job-1" } });

      // pollJobStatus
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1").resolves({
        data: { status: { status: "completed", result: "success" }, jobId: "job-1" },
      });
      mockClient.get.withArgs("/files/file-uuid/publishes/job-1/assets", sinon.match.any).resolves({
        data: {
          content: [{ filePath: "ot-output/dita/map.ditamap" }],
          totalPages: 1,
        },
      });

      const mockDeps = { "path/topic.dita": { uuid: "uuid-1" } };
      const deps = {
        createApiClientFn: sinon.stub().returns(mockClient),
        createRestApiClientFn: sinon.stub().returns(mockClient),
        downloadFn: sinon.stub().resolves("/tmp/doc-detective/heretto_abc"),
        getResourceDependenciesFn: sinon.stub().resolves(mockDeps),
      };

      const configWithUpload = { ...herettoConfig, uploadOnChange: true };
      const result = await loadHerettoContent(
        configWithUpload,
        mockLog,
        mockConfig,
        deps
      );
      assert.equal(result, "/tmp/doc-detective/heretto_abc");
      assert.ok(deps.getResourceDependenciesFn.calledOnce);
      assert.deepEqual(configWithUpload.resourceDependencies, mockDeps);
    });
  });
});
