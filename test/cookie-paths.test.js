// The path rule for cookie files (ADR 01174): a saveCookie or loadCookie `path`
// without `directory` resolves under `outputDir`, a `directory` resolves
// against the spec file, and the `.txt` string form uses `outputDir`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { resolvePaths } from "../dist/core/files.js";
import { saveCookie } from "../dist/core/tests/saveCookie.js";
import { loadCookie } from "../dist/core/tests/loadCookie.js";

const specFile = path.resolve("/specs/sub/cookies.spec.json");
const resolveSpec = (steps) =>
  resolvePaths({
    config: { relativePathBase: "file" },
    object: { tests: [{ steps }] },
    filePath: specFile,
    objectType: "spec",
  });

describe("cookie paths", function () {
  describe("resolvePaths", function () {
    it("leaves a cookie path without a directory for the handler to join to outputDir", async function () {
      const spec = await resolveSpec([
        { saveCookie: { name: "s", path: "c.txt" } },
        { loadCookie: { name: "s", path: "c.txt" } },
      ]);
      assert.equal(spec.tests[0].steps[0].saveCookie.path, "c.txt");
      assert.equal(spec.tests[0].steps[1].loadCookie.path, "c.txt");
    });

    it("resolves a cookie directory, and its path, against the spec file", async function () {
      const spec = await resolveSpec([{ saveCookie: { name: "s", path: "c.txt", directory: "../shared" } }]);
      const { saveCookie: cookie } = spec.tests[0].steps[0];
      assert.equal(cookie.directory, path.resolve("/specs/shared"));
      assert.equal(cookie.path, path.resolve("/specs/shared/c.txt"));
    });

    it("still resolves other paths against the spec file", async function () {
      const spec = await resolveSpec([{ screenshot: { path: "a.png" } }]);
      assert.equal(spec.tests[0].steps[0].screenshot.path, path.resolve("/specs/sub/a.png"));
    });
  });

  describe("handlers", function () {
    let outputDir;
    beforeEach(function () {
      outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cookie-paths-"));
    });
    afterEach(function () {
      fs.rmSync(outputDir, { recursive: true, force: true });
    });

    const cookie = { name: "sid", value: "v", domain: "localhost", path: "/" };
    const loadDriver = { getUrl: async () => "http://localhost:8092/", setCookies: async () => {} };

    for (const [form, step, name] of [
      ["object", { name: "sid", path: "c.txt" }, "sid"],
      ["string", "c.txt", "c"],
    ]) {
      it(`saves and loads the ${form} form under outputDir`, async function () {
        const driver = { getCookies: async () => [{ ...cookie, name }] };
        const saved = await saveCookie({ config: { outputDir }, step: { saveCookie: step }, driver });
        assert.equal(saved.status, "PASS", saved.description);
        assert.equal(saved.outputs.path, path.join(outputDir, "c.txt"));
        const loaded = await loadCookie({ config: { outputDir }, step: { loadCookie: step }, driver: loadDriver });
        assert.equal(loaded.status, "PASS", loaded.description);
        assert.equal(loaded.outputs.cookieName, name);
      });
    }

    it("saves to and loads from the environment variable a name shorthand names", async function () {
      const name = "__Secure-dd.session-token";
      const driver = { getCookies: async () => [{ ...cookie, name }] };
      try {
        const saved = await saveCookie({ config: { outputDir }, step: { saveCookie: name }, driver });
        assert.equal(saved.status, "PASS", saved.description);
        assert.equal(JSON.parse(process.env[name]).name, name);
        const loaded = await loadCookie({ config: { outputDir }, step: { loadCookie: name }, driver: loadDriver });
        assert.equal(loaded.status, "PASS", loaded.description);
      } finally {
        delete process.env[name];
      }
    });
  });
});
