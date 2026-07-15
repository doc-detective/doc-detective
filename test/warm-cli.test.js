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
import { warmCommand } from "../dist/warm/command.js";
import { discoverConfigPath } from "../dist/utils.js";

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

  it("handler: `--down` in-process reports a clean cache (direct-call precedent: debug-remaining-coverage)", async function () {
    const prev = process.env.DOC_DETECTIVE_CACHE_DIR;
    process.env.DOC_DETECTIVE_CACHE_DIR = CACHE_DIR;
    try {
      // No manifests in the cache — the handler must return cleanly after
      // warmDown's nothing-to-tear-down path.
      await warmCommand.handler({ down: true, logLevel: "silent" });
    } finally {
      if (prev === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
      else process.env.DOC_DETECTIVE_CACHE_DIR = prev;
    }
  });

  it("handler: returns quietly when nothing resolves (runTests → null)", async function () {
    const prev = process.env.DOC_DETECTIVE_CACHE_DIR;
    process.env.DOC_DETECTIVE_CACHE_DIR = CACHE_DIR;
    try {
      const emptyDir = path.join(CACHE_DIR, "no-tests-here");
      fs.mkdirSync(emptyDir, { recursive: true });
      await warmCommand.handler({
        down: false,
        input: emptyDir,
        logLevel: "silent",
      });
    } finally {
      if (prev === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
      else process.env.DOC_DETECTIVE_CACHE_DIR = prev;
    }
  });

  describe("discoverConfigPath (shared command config discovery)", function () {
    it("treats a non-empty --config as authoritative, trimmed and resolved", function () {
      assert.equal(
        discoverConfigPath({ config: "  ./somewhere/config.json  " }),
        path.resolve("./somewhere/config.json")
      );
    });

    it("returns null when nothing is configured and no .doc-detective file exists in cwd", function () {
      const emptyDir = path.join(CACHE_DIR, "cfg-empty");
      fs.mkdirSync(emptyDir, { recursive: true });
      const prevCwd = process.cwd();
      process.chdir(emptyDir);
      try {
        assert.equal(discoverConfigPath({}), null);
        assert.equal(discoverConfigPath({ config: "   " }), null);
        assert.equal(discoverConfigPath({ config: 42 }), null);
      } finally {
        process.chdir(prevCwd);
      }
    });

    it("auto-discovers a .doc-detective.json in the cwd", function () {
      const dir = path.join(CACHE_DIR, "cfg-discovery");
      fs.mkdirSync(dir, { recursive: true });
      const cfg = path.join(dir, ".doc-detective.json");
      fs.writeFileSync(cfg, "{}");
      const prevCwd = process.cwd();
      process.chdir(dir);
      try {
        assert.equal(discoverConfigPath({}), cfg);
      } finally {
        process.chdir(prevCwd);
      }
    });
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
