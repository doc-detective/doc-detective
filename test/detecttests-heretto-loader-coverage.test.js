import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import sinon from "sinon";
import { detectTests, parseTests } from "../dist/core/detectTests.js";
import { setConfig } from "../dist/core/config.js";
import {
  getResourceDependencies,
  loadHerettoContent,
  pollJobStatus,
  downloadAndExtractOutput,
  findScenario,
} from "../dist/core/integrations/heretto.js";

// Extends (does not duplicate) detecttests-coverage.test.js and
// core-heretto-loader.test.js. Targets residually-uncovered branches:
//
//   detectTests.ts
//     - qualifyFiles: heretto:<name> not-found skip and the outputPath-reuse
//       splice (config-driven, no network).
//     - parseTests: the v2-shaped test testId-skip `continue`, and the
//       per-step step_v3 filter that drops an invalid step injected by a
//       before-file merge.
//
//   heretto.ts (axios loader functions, driven by a fake restClient)
//     - getResourceDependencies: ditamap+dependency XML parsing across org-
//       relative paths, plain paths, nested dependency recursion, ditamap
//       without a uri, and the ditamap-fetch / dependencies-fetch error paths.
//     - loadHerettoContent: the outer catch (client construction throws).
//     - pollJobStatus: the getJobAssetDetails-throws branch.
//
// Hermetic: tmpdir fixtures + sinon stubs only. No network, no `dita`, no
// browser, no timing assertions. Every stub restored in afterEach.

describe("detectTests + heretto loader coverage", function () {
  // AJV compiles the large config_v3 / spec_v3 schemas on first use.
  this.timeout(30000);

  afterEach(function () {
    sinon.restore();
  });

  describe("detectTests: qualifyFiles heretto branches", function () {
    let tmpDir;

    beforeEach(function () {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-dh-heretto-"));
    });

    afterEach(function () {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it("skips a heretto:<name> reference not present in config.integrations", async function () {
      const config = await setConfig({
        config: {
          logLevel: "silent",
          input: ["heretto:missing"],
          integrations: {
            heretto: [
              {
                name: "other",
                organizationId: "o",
                username: "u@e.com",
                apiToken: "t",
              },
            ],
          },
        },
      });
      const specs = await detectTests({ config });
      assert.deepEqual(specs, []);
    });

    it("reuses a pre-set outputPath directory (no network) and maps it back to the integration name", async function () {
      // A heretto config that already carries an outputPath skips loading and
      // splices that directory into the sequence, recording the reverse
      // mapping on config._herettoPathMapping.
      const outDir = path.join(tmpDir, "hout");
      fs.mkdirSync(outDir);
      fs.writeFileSync(
        path.join(outDir, "spec.json"),
        JSON.stringify({ tests: [{ steps: [{ goTo: "https://a.com" }] }] })
      );

      const config = await setConfig({
        config: {
          logLevel: "silent",
          input: ["heretto:mine"],
          integrations: {
            heretto: [
              {
                name: "mine",
                organizationId: "o",
                username: "u@e.com",
                apiToken: "t",
                outputPath: outDir,
              },
            ],
          },
        },
      });
      const specs = await detectTests({ config });
      assert.equal(specs.length, 1);
      // Reverse mapping is keyed by the outputPath and points at the name.
      assert.equal(config._herettoPathMapping[outDir], "mine");
    });
  });

  describe("detectTests: parseTests residual branches", function () {
    let tmpDir;

    beforeEach(function () {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-dh-parse-"));
    });

    afterEach(function () {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    function write(name, content) {
      const filePath = path.join(tmpDir, name);
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      fs.writeFileSync(filePath, content, "utf8");
      return filePath;
    }

    it("does not inject a testId into a v2-shaped test (id + action-keyed steps)", async function () {
      // A test carrying an `id` and v2 action-keyed steps must skip the
      // testId-injection block (the `continue`) so it can be validated against
      // test_v2 and transformed by resolveTest's fallback instead.
      const f = write(
        "v2.json",
        JSON.stringify({
          tests: [{ id: "myV2Test", steps: [{ action: "goTo", url: "https://a.com" }] }],
        })
      );
      const config = await setConfig({ config: { logLevel: "silent", input: [f] } });
      const specs = await parseTests({ config, files: [f] });
      assert.equal(specs.length, 1);
      // The authored `id` survives; no `<specId>~<hash>` testId was injected.
      assert.equal(specs[0].tests[0].testId, "myV2Test");
    });

    it("filters out an invalid step contributed by a before-file merge", async function () {
      // The main spec is valid on its own (passes the first resolvePaths). The
      // before-file is read verbatim (not schema-validated) and its steps are
      // prepended, so an invalid step reaches the per-step step_v3 filter and
      // is dropped there — exercising the invalid-step skip branch.
      const before = write(
        "before.json",
        JSON.stringify({
          tests: [
            {
              steps: [{ goTo: "https://before.com" }, { notAKnownAction: true }],
            },
          ],
        })
      );
      const main = write(
        "main.json",
        JSON.stringify({
          tests: [{ before, steps: [{ goTo: "https://main.com" }] }],
        })
      );
      const config = await setConfig({ config: { logLevel: "silent", input: [main] } });
      const specs = await parseTests({ config, files: [main] });
      assert.equal(specs.length, 1);
      // before's valid goTo + main's goTo survive; the invalid before-step is gone.
      const steps = specs[0].tests[0].steps;
      assert.equal(steps.length, 2);
      assert.ok(steps.every((s) => "goTo" in s));
    });
  });

  describe("heretto: getResourceDependencies", function () {
    const log = sinon.stub();
    const config = {};

    beforeEach(function () {
      log.resetHistory();
    });

    it("parses ditamap metadata and org-relative dependency paths into a map", async function () {
      const ditamapXml =
        '<resource id="dm1" folder-uuid="pf1"><name>main.ditamap</name>' +
        "<xmldb-uri>/db/organizations/org1/docs/main.ditamap</xmldb-uri></resource>";
      const depsXml =
        "<dependencies>" +
        '<dependency id="u1" uri="/db/organizations/org1/docs/images/a.png" name="a.png" folder-uuid="pf2"/>' +
        '<dependency id="u2" uri="/db/organizations/org1/docs/b.dita" name="b.dita"/>' +
        "</dependencies>";

      const rest = { get: sinon.stub() };
      rest.get.withArgs("/rest/all-files/dm1").resolves({ data: ditamapXml });
      rest.get.withArgs("/rest/all-files/dm1/dependencies").resolves({ data: depsXml });

      const map = await getResourceDependencies(rest, "dm1", log, config);

      // The org path prefix is stripped down to the repo-relative path.
      assert.deepEqual(map["docs/main.ditamap"], {
        uuid: "dm1",
        fullPath: "/db/organizations/org1/docs/main.ditamap",
        name: "main.ditamap",
        parentFolderId: "pf1",
        isDitamap: true,
      });
      // Internal ditamap markers are recorded.
      assert.equal(map._ditamapPath, "docs/main.ditamap");
      assert.equal(map._ditamapId, "dm1");
      assert.equal(map._ditamapParentFolderId, "pf1");
      // Dependencies are keyed by their org-relative path.
      assert.equal(map["docs/images/a.png"].uuid, "u1");
      assert.equal(map["docs/images/a.png"].parentFolderId, "pf2");
      assert.equal(map["docs/b.dita"].uuid, "u2");
    });

    it("recurses nested dependencies and preserves non-org relative paths", async function () {
      const ditamapXml =
        '<resource id="dm1"><name>m.ditamap</name>' +
        "<xmldb-uri>plainpath/m.ditamap</xmldb-uri></resource>";
      // parent.dita has a child.dita nested one level deeper.
      const depsXml =
        "<dependencies>" +
        '<dependency id="p1" uri="topics/parent.dita" name="parent.dita">' +
        '<dependencies><dependency id="c1" name="child.dita"/></dependencies>' +
        "</dependency>" +
        "</dependencies>";

      const rest = { get: sinon.stub() };
      rest.get.withArgs("/rest/all-files/dm1").resolves({ data: ditamapXml });
      rest.get.withArgs("/rest/all-files/dm1/dependencies").resolves({ data: depsXml });

      const map = await getResourceDependencies(rest, "dm1", log, config);

      // Non-org path kept verbatim.
      assert.ok(map["plainpath/m.ditamap"]);
      assert.equal(map["topics/parent.dita"].uuid, "p1");
      // Nested dependency reached via recursion; name-only dep keyed by name.
      assert.equal(map["child.dita"].uuid, "c1");
      assert.equal(map["child.dita"].name, "child.dita");
    });

    it("skips the ditamap uri block when the ditamap has no xmldb-uri", async function () {
      // ditamap resource lacks a uri → the pathToUuidMap ditamap entry and the
      // `_ditamap*` markers are not written; only dependencies populate the map.
      const ditamapXml = '<resource name="nouri.ditamap"></resource>';
      const depsXml =
        '<dependencies><dependency id="only1" uri="a/one.png" name="one.png"/></dependencies>';

      const rest = { get: sinon.stub() };
      rest.get.withArgs("/rest/all-files/dmx").resolves({ data: ditamapXml });
      rest.get.withArgs("/rest/all-files/dmx/dependencies").resolves({ data: depsXml });

      const map = await getResourceDependencies(rest, "dmx", log, config);

      assert.equal(map._ditamapPath, undefined);
      assert.deepEqual(Object.keys(map), ["a/one.png"]);
    });

    it("continues past a failed ditamap-info fetch and still returns dependencies", async function () {
      const depsXml =
        '<dependencies><dependency id="d1" uri="x/y.dita" name="y.dita"/></dependencies>';
      const rest = { get: sinon.stub() };
      rest.get.withArgs("/rest/all-files/dmerr").rejects(new Error("ditamap boom"));
      rest.get
        .withArgs("/rest/all-files/dmerr/dependencies")
        .resolves({ data: depsXml });

      const map = await getResourceDependencies(rest, "dmerr", log, config);

      // No ditamap markers (fetch failed), but dependencies still resolved.
      assert.equal(map._ditamapPath, undefined);
      assert.equal(map["x/y.dita"].uuid, "d1");
    });

    it("returns an empty map when both the ditamap and dependencies fetches fail", async function () {
      const rest = { get: sinon.stub() };
      rest.get.withArgs("/rest/all-files/dm2").rejects(new Error("boom"));
      const depsErr = new Error("Not Found");
      depsErr.response = { status: 404 };
      rest.get.withArgs("/rest/all-files/dm2/dependencies").rejects(depsErr);

      const map = await getResourceDependencies(rest, "dm2", log, config);
      assert.deepEqual(map, {});
    });
  });

  describe("heretto: loadHerettoContent outer catch", function () {
    it("returns null when client construction throws inside the try", async function () {
      const log = sinon.stub();
      const config = {};
      // The injected client factory throws, so the whole load is caught and
      // resolves to null rather than propagating.
      const deps = {
        createApiClientFn: () => {
          throw new Error("client init fail");
        },
      };
      const result = await loadHerettoContent({ name: "x" }, log, config, deps);
      assert.equal(result, null);
    });
  });

  describe("heretto: pollJobStatus asset-details failure", function () {
    it("returns null when getJobAssetDetails throws after the job completes", async function () {
      const log = sinon.stub();
      const config = {};
      const rest = { get: sinon.stub() };
      // Job reports a completed result.
      rest.get.withArgs("/files/f/publishes/j").resolves({
        data: { status: { status: "done", result: "success" }, jobId: "j" },
      });
      // ...but fetching its assets fails, hitting the asset-validation catch.
      rest.get
        .withArgs("/files/f/publishes/j/assets", sinon.match.any)
        .rejects(new Error("asset boom"));

      const result = await pollJobStatus(rest, "f", "j", log, config);
      assert.equal(result, null);
    });
  });

  describe("heretto: findScenario missing parameter payload", function () {
    it("returns null when the scenario parameters response has no data", async function () {
      const log = sinon.stub();
      const config = {};
      const client = { get: sinon.stub() };
      client.get.withArgs("/publishes/scenarios").resolves({
        data: { content: [{ id: "s1", name: "Doc Detective" }] },
      });
      // parameters endpoint returns a falsy payload → the guard returns null.
      client.get
        .withArgs("/publishes/scenarios/s1/parameters")
        .resolves({ data: null });

      const result = await findScenario(client, log, config, "Doc Detective");
      assert.equal(result, null);
    });
  });

  describe("heretto: downloadAndExtractOutput entry handling", function () {
    const log = sinon.stub();
    const config = {};

    beforeEach(function () {
      log.resetHistory();
    });

    it("creates directory entries and cleans up when a file entry fails to extract", async function () {
      const mockFs = {
        mkdirSync: sinon.stub(),
        writeFileSync: sinon.stub(),
        unlinkSync: sinon.stub(),
        existsSync: sinon.stub().returns(true),
        rmSync: sinon.stub(),
      };
      // A directory entry (isDirectory branch) followed by a file entry whose
      // getData() throws, forcing the extraction into the catch → cleanup path.
      const entries = [
        { entryName: "ot-output/dita/", isDirectory: true, getData: sinon.stub() },
        {
          entryName: "ot-output/dita/topic.dita",
          isDirectory: false,
          getData: sinon.stub().throws(new Error("read fail")),
        },
      ];
      const zipInstance = { getEntries: sinon.stub().returns(entries) };
      const ZipClass = sinon.stub().returns(zipInstance);
      const client = {
        get: sinon.stub().resolves({ data: Buffer.from("zip-bytes") }),
      };

      const result = await downloadAndExtractOutput(
        client,
        "f",
        "j",
        "name",
        log,
        config,
        { fsModule: mockFs, ZipClass }
      );

      assert.equal(result, null);
      // The directory entry was created via mkdirSync.
      assert.ok(mockFs.mkdirSync.called);
      // The error cleanup removed the partial output directory.
      assert.ok(mockFs.rmSync.calledOnce);
    });

    it("skips a zip entry that resolves outside the output directory but keeps safe entries", async function () {
      const mockFs = {
        mkdirSync: sinon.stub(),
        writeFileSync: sinon.stub(),
        unlinkSync: sinon.stub(),
        existsSync: sinon.stub().returns(false),
        rmSync: sinon.stub(),
      };
      // A leading-slash entry name survives the "../" traversal guard but
      // path.resolve places it outside the output directory, so the
      // outside-directory guard skips it. The safe entry is still extracted.
      const escapeEntry = {
        entryName: "/abs/escape.dita",
        isDirectory: false,
        getData: sinon.stub().returns(Buffer.from("evil")),
      };
      const safeEntry = {
        entryName: "ot-output/dita/ok.dita",
        isDirectory: false,
        getData: sinon.stub().returns(Buffer.from("safe")),
      };
      const zipInstance = {
        getEntries: sinon.stub().returns([escapeEntry, safeEntry]),
      };
      const ZipClass = sinon.stub().returns(zipInstance);
      const client = {
        get: sinon.stub().resolves({ data: Buffer.from("zip-bytes") }),
      };

      const result = await downloadAndExtractOutput(
        client,
        "f",
        "j",
        "n",
        log,
        config,
        { fsModule: mockFs, ZipClass }
      );

      assert.ok(result);
      // The escaping entry was never read; the safe entry was.
      assert.ok(!escapeEntry.getData.called);
      assert.ok(safeEntry.getData.called);
    });
  });
});
