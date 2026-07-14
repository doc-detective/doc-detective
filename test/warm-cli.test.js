// End-to-end coverage for `doc-detective warm` (design phase B3), hermetic
// on every OS: a shell-only spec provisions nothing, so the command runs the
// full resolve → warm → handoff path without booting devices, and --down
// exercises manifest cleanup against a synthetic manifest. Device-bearing
// warms are CI/dev-box territory (the mobile fixture legs).
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";
import { runTests } from "../dist/core/index.js";
import { WARM_MANIFEST_NAME } from "../dist/core/warmManifest.js";

const CACHE_DIR = path.resolve("./.tmp/warm-cli-cache");
const SPEC_PATH = path.resolve("./.tmp/warm-cli-spec.json");

function runCli(args, env = {}) {
  return spawnSync(
    process.execPath,
    [path.resolve("bin/doc-detective.js"), ...args],
    {
      env: {
        ...process.env,
        DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
        DOC_DETECTIVE_CACHE_DIR: CACHE_DIR,
        ...env,
      },
      encoding: "utf8",
    }
  );
}

describe("CLI: doc-detective warm", function () {
  this.timeout(120000);

  before(function () {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    fs.writeFileSync(
      SPEC_PATH,
      JSON.stringify({
        tests: [{ testId: "warm-cli", steps: [{ runShell: "echo warm" }] }],
      })
    );
  });

  after(function () {
    try {
      fs.unlinkSync(SPEC_PATH);
    } catch {}
    fs.rmSync(CACHE_DIR, { recursive: true, force: true });
  });

  it("`--help` lists the warm command", function () {
    const r = runCli(["--help"]);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /warm/);
    assert.match(r.stdout, /devices left up|handed off/i);
  });

  it("warms a shell-only input, hands nothing off, and exits 0", function () {
    const r = runCli(["warm", "--input", SPEC_PATH, "--logLevel", "info"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /Warm complete: nothing to hand off/);
    assert.match(r.stdout, /Warm finished in \d+ms/);
    assert.equal(
      fs.existsSync(path.join(CACHE_DIR, WARM_MANIFEST_NAME)),
      false,
      "a device-less warm must not write a manifest"
    );
  });

  it("`warm --down` reports cleanly when there is nothing to tear down", function () {
    const r = runCli(["warm", "--down", "--logLevel", "info"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /nothing to tear down/i);
  });

  it("`warm --down` sweeps a leftover manifest and deletes it", function () {
    const manifestPath = path.join(CACHE_DIR, WARM_MANIFEST_NAME);
    fs.writeFileSync(
      manifestPath,
      JSON.stringify({
        version: 1,
        createdAt: new Date().toISOString(),
        devices: [
          {
            platform: "android",
            name: "long-gone",
            udid: "emulator-9998",
            // A pid that can't be alive (max pid is far below this on
            // every supported OS) — the sweep is best-effort either way.
            pid: 2147483646,
            sdkRoot: CACHE_DIR,
          },
        ],
      })
    );
    const r = runCli(["warm", "--down", "--logLevel", "info"]);
    assert.equal(r.status, 0, r.stderr + r.stdout);
    assert.match(r.stdout, /Warm teardown complete: 1 device\(s\) swept, 1 manifest file\(s\) removed/);
    assert.equal(fs.existsSync(manifestPath), false);
  });

  it("runTests({warmOnly: true}) returns the warm report without running tests", async function () {
    const results = await runTests({
      input: SPEC_PATH,
      cacheDir: CACHE_DIR,
      logLevel: "silent",
    }, { warmOnly: true });
    assert.ok(results);
    assert.deepEqual(results.specs, []);
    assert.equal(results.summary.steps.pass, 0, "no step may execute during warm");
    assert.deepEqual(results.warm, { durationMs: 0, tasks: [] });
    assert.equal(results.warmManifest, undefined);
  });
});
