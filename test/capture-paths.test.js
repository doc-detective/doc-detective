// ADR 01173: a capture the runner names goes under outputDir, a URL reference's
// capture goes under the run folder, and a spec loaded from a URL resolves its
// relative paths against outputDir.
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { saveScreenshot } from "../dist/core/tests/saveScreenshot.js";
import { startRecording } from "../dist/core/tests/startRecording.js";
import { stopRecording } from "../dist/core/tests/stopRecording.js";
import { detectTests } from "../dist/core/detectTests.js";
import { resolvePaths } from "../dist/core/files.js";
import { getRunOutputDir } from "../dist/core/utils.js";
import { useEffectiveStep, placeCapturePaths } from "../dist/core/tests.js";

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

  // The step a handler gets from the runner: effective, with its capture placed.
  // It mirrors what runContext does to each step before runStep dispatches it.
  const runnerStep = (step, config) => {
    useEffectiveStep(step);
    placeCapturePaths(step, config);
    return step;
  };

  for (const [name, screenshot] of [
    ["true", true],
    ["{}", {}],
  ]) {
    it(`writes screenshot: ${name} to <outputDir>/<stepId>.png`, async function () {
      const config = { outputDir: tmp };
      const result = await saveScreenshot({
        config,
        step: runnerStep({ stepId: "shot", screenshot }, config),
        driver: fakeDriver(await png()),
      });
      assert.equal(result.status, "PASS", result.description);
      assert.equal(result.outputs.screenshotPath, path.join(tmp, "shot.png"));
      assert.ok(fs.existsSync(result.outputs.screenshotPath));
    });
  }

  it("resolves a relative directory with no spec file against outputDir", async function () {
    const config = { outputDir: tmp };
    const result = await saveScreenshot({
      config,
      step: runnerStep({ stepId: "shot", screenshot: { directory: "shots" } }, config),
      driver: fakeDriver(await png()),
    });
    assert.equal(result.outputs.screenshotPath, path.join(tmp, "shots", "shot.png"));
  });

  // A fresh process, because this one may have loaded them already. sharp and
  // pngjs are CommonJS, so loading them leaves them in require.cache.
  it("skips screenshot: false without loading the image libraries", function () {
    const script = [
      `const { saveScreenshot } = await import(${JSON.stringify(new URL("../dist/core/tests/saveScreenshot.js", import.meta.url).href)});`,
      `const result = await saveScreenshot({ config: {}, step: { stepId: "s", screenshot: false }, driver: {} });`,
      `const { createRequire } = await import("node:module");`,
      `const loaded = Object.keys(createRequire(process.cwd() + "/").cache).filter((file) => /[\\\\/]node_modules[\\\\/](sharp|pngjs|pixelmatch)[\\\\/]/.test(file));`,
      `console.log(JSON.stringify({ status: result.status, loaded }));`,
    ].join("\n");
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", script], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    assert.deepEqual(JSON.parse(child.stdout.trim().split("\n").pop()), { status: "SKIPPED", loaded: [] });
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

  for (const [name, record] of [
    ["true", true],
    ["{}", {}],
  ]) {
    it(`names record: ${name} <outputDir>/<stepId>.mp4`, async function () {
      // An existing target makes the step skip and name it, without recording.
      const target = path.join(tmp, "demo.mp4");
      fs.writeFileSync(target, "");
      const config = { outputDir: tmp };
      const result = await startRecording({
        config,
        context: {},
        step: runnerStep({ stepId: "demo", record }, config),
        driver: {},
      });
      assert.equal(result.status, "SKIPPED");
      assert.equal(result.description, `File already exists: ${target}`);
    });
  }

  it("places a recording path with folders under outputDir", async function () {
    const target = path.join(tmp, "sub", "demo.mp4");
    fs.mkdirSync(path.dirname(target));
    fs.writeFileSync(target, "");
    const config = { outputDir: tmp };
    const result = await startRecording({
      config,
      context: {},
      step: runnerStep({ stepId: "demo", record: "sub/demo.mp4" }, config),
      driver: {},
    });
    assert.equal(result.description, `File already exists: ${target}`);
  });

  // The normalizer names a capture for its step, so a step with neither a
  // `stepId` nor a `path`, such as a getRunner() step, can't be named.
  it("fails a screenshot with no stepId and no path", async function () {
    const result = await saveScreenshot({
      config: { outputDir: tmp },
      step: { screenshot: true },
      driver: fakeDriver(await png()),
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.description, "Couldn't name the screenshot. Set `path`, or set the step's `stepId`.");
    assert.equal(fs.readdirSync(tmp).length, 0);
  });

  it("fails a recording with no stepId and no path", async function () {
    const result = await startRecording({
      config: { outputDir: tmp },
      context: {},
      step: { record: true },
      driver: {},
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.description, "Couldn't name the recording. Set `path`, or set the step's `stepId`.");
  });

  // After substitution, a `$NAME` left in a capture's path or directory is a
  // variable that isn't set. The step says so instead of writing to `$NAME`.
  for (const [field, screenshot] of [
    ["directory", { directory: "$DD_UNSET_DIR" }],
    ["path", { path: "$DD_UNSET_SHOT" }],
  ]) {
    it(`fails a screenshot whose ${field} is an unset variable`, async function () {
      const config = { outputDir: tmp };
      const result = await saveScreenshot({
        config,
        step: runnerStep({ stepId: "shot", screenshot }, config),
        driver: fakeDriver(await png()),
      });
      assert.equal(result.status, "FAIL");
      assert.equal(
        result.description,
        `Couldn't save the screenshot. \`${field}\` (\`${screenshot[field]}\`) has a variable that isn't set.`
      );
      assert.equal(fs.readdirSync(tmp).length, 0);
    });
  }

  it("fails a recording whose directory is an unset variable", async function () {
    const config = { outputDir: tmp };
    const result = await startRecording({
      config,
      context: {},
      step: runnerStep({ stepId: "demo", record: { directory: "$DD_UNSET_DIR" } }, config),
      driver: {},
    });
    assert.equal(result.status, "FAIL");
    assert.equal(result.description, "Couldn't start the recording. `directory` (`$DD_UNSET_DIR`) has a variable that isn't set.");
    assert.equal(fs.readdirSync(tmp).length, 0);
  });

  it("stops nothing for stopRecord: false", async function () {
    const recording = { type: "ffmpeg", targetPath: path.join(tmp, "x.mp4") };
    const driver = { state: { recordings: [recording] } };
    const result = await stopRecording({
      config: {},
      step: runnerStep({ stopRecord: false }, {}),
      driver,
    });
    assert.equal(result.status, "SKIPPED");
    assert.deepEqual(driver.state.recordings, [recording]);
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

  // A remote spec has no folder of its own. outputDir is always a folder, even
  // one that doesn't exist yet and has a dot in its name.
  for (const name of ["out", "out.v2"]) {
    it(`resolves a relative path in a spec loaded from a URL against outputDir: ${name}`, async function () {
      const outputDir = path.join(tmp, name);
      const spec = {
        tests: [
          {
            steps: [
              { screenshot: "remote.png" },
              { record: { path: "remote.mp4" } },
              { runShell: { command: "echo hi", workingDirectory: "work" } },
            ],
          },
        ],
      };
      const { server, base } = await serve(JSON.stringify(spec), "application/json");
      try {
        const specs = await detectTests({
          config: { logLevel: "silent", relativePathBase: "file", outputDir, input: [`${base}/remote.spec.json`] },
        });
        const [shot, rec, shell] = specs[0].tests[0].steps;
        assert.equal(shot.screenshot, path.join(outputDir, "remote.png"));
        assert.equal(rec.record.path, path.join(outputDir, "remote.mp4"));
        assert.equal(shell.runShell.workingDirectory, path.join(outputDir, "work"));
      } finally {
        server.close();
      }
    });
  }

  it("resolves a path against a directory with a dot in its name that doesn't exist yet", async function () {
    const spec = { tests: [{ steps: [{ screenshot: { path: "a.png", directory: "shots.v2" } }] }] };
    const resolved = await resolvePaths({
      config: { relativePathBase: "file" },
      object: spec,
      filePath: path.join(tmp, "x.spec.json"),
      objectType: "spec",
    });
    assert.equal(resolved.tests[0].steps[0].screenshot.path, path.join(tmp, "shots.v2", "a.png"));
  });
});
