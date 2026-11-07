// ADR 01173: a capture the runner names goes under outputDir, a URL reference's
// capture goes under the run folder, and a spec loaded from a URL resolves its
// relative paths against outputDir.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { saveScreenshot } from "../dist/core/tests/saveScreenshot.js";
import { startRecording } from "../dist/core/tests/startRecording.js";
import { detectTests } from "../dist/core/detectTests.js";
import { getRunOutputDir } from "../dist/core/utils.js";

const sharp = createRequire(import.meta.url)("sharp");

async function png() {
  return sharp({ create: { width: 12, height: 12, channels: 3, background: { r: 255, g: 0, b: 0 } } })
    .png()
    .toBuffer();
}

function fakeDriver(buffer) {
  return { takeScreenshot: async () => buffer.toString("base64") };
}

// Serves `body` at every path on a free port.
async function serve(body, type) {
  const server = http.createServer((req, res) => {
    res.writeHead(200, { "Content-Type": type });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

describe("capture paths", function () {
  this.timeout(30000);
  let tmp;
  beforeEach(function () {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-capture-paths-"));
  });
  afterEach(function () {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  for (const [name, screenshot] of [
    ["true", true],
    ["{}", {}],
  ]) {
    it(`writes screenshot: ${name} to <outputDir>/<stepId>.png`, async function () {
      const result = await saveScreenshot({
        config: { outputDir: tmp },
        step: { stepId: "shot", screenshot },
        driver: fakeDriver(await png()),
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.screenshotPath, path.join(tmp, "shot.png"));
      assert.ok(fs.existsSync(result.outputs.screenshotPath));
    });
  }

  it("resolves a relative directory with no spec file against outputDir", async function () {
    const result = await saveScreenshot({
      config: { outputDir: tmp },
      step: { stepId: "shot", screenshot: { directory: "shots" } },
      driver: fakeDriver(await png()),
    });
    assert.equal(result.outputs.screenshotPath, path.join(tmp, "shots", "shot.png"));
  });

  it("skips screenshot: false", async function () {
    const result = await saveScreenshot({
      config: { outputDir: tmp },
      step: { stepId: "shot", screenshot: false },
      driver: fakeDriver(await png()),
    });
    assert.equal(result.status, "SKIPPED");
    assert.equal(fs.readdirSync(tmp).length, 0);
  });

  it("names record: true <outputDir>/<stepId>.mp4", async function () {
    const target = path.join(tmp, "demo.mp4");
    fs.writeFileSync(target, "");
    const result = await startRecording({
      config: { outputDir: tmp },
      context: {},
      step: { stepId: "demo", record: true },
      driver: {},
    });
    assert.equal(result.status, "SKIPPED");
    assert.equal(result.description, `File already exists: ${target}`);
  });

  describe("a URL reference", function () {
    let server;
    let base;
    const allow = process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
    beforeEach(async function () {
      process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS = "true";
      ({ server, base } = await serve(await png(), "image/png"));
    });
    afterEach(function () {
      server.close();
      if (allow === undefined) delete process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS;
      else process.env.DOC_DETECTIVE_ALLOW_LOCAL_URLS = allow;
    });

    it("writes its capture to the context's screenshots folder", async function () {
      const screenshotsDir = path.join(tmp, "contexts", "c", "screenshots");
      const result = await saveScreenshot({
        config: { outputDir: tmp },
        step: { stepId: "shot", screenshot: `${base}/ref.png` },
        driver: fakeDriver(await png()),
        screenshotsDir: () => screenshotsDir,
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(path.dirname(result.outputs.screenshotPath), screenshotsDir);
      assert.ok(fs.existsSync(result.outputs.screenshotPath));
    });

    it("falls back to the run folder's screenshots folder", async function () {
      const config = { outputDir: tmp };
      const result = await saveScreenshot({
        config,
        step: { stepId: "shot", screenshot: `${base}/ref.png` },
        driver: fakeDriver(await png()),
      });
      assert.equal(path.dirname(result.outputs.screenshotPath), path.join(getRunOutputDir(config), "screenshots"));
    });
  });

  it("resolves a relative path in a spec loaded from a URL against outputDir", async function () {
    const spec = { tests: [{ steps: [{ screenshot: "remote.png" }, { record: { path: "remote.mp4" } }] }] };
    const { server, base } = await serve(JSON.stringify(spec), "application/json");
    try {
      const specs = await detectTests({
        config: { logLevel: "silent", relativePathBase: "file", outputDir: tmp, input: [`${base}/remote.spec.json`] },
      });
      const [shot, rec] = specs[0].tests[0].steps;
      assert.equal(shot.screenshot, path.join(tmp, "remote.png"));
      assert.equal(rec.record.path, path.join(tmp, "remote.mp4"));
    } finally {
      server.close();
    }
  });
});
