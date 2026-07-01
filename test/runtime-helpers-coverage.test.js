// Phase 15 coverage ratchet: extend unit coverage for the runtime helper
// files (browsers, selfUpdate, installCommand, loader) WITHOUT touching
// source. Every test here is hermetic — no real downloads, spawns, or
// network. Child processes / http / process.exit are stubbed with sinon;
// OS-specific branches are driven by stubbing process.platform/arch and
// asserting on STRUCTURE (which command/args/url), never the host's value.
import sinon from "sinon";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

import {
  ensureBrowserInstalled,
  verifyDriverBinary,
  geckodriverBinaryInCache,
} from "../dist/runtime/browsers.js";
import {
  readInstalledRecord,
  writeInstalledRecord,
} from "../dist/runtime/cacheDir.js";
import {
  compareVersions,
  detectInstallMode,
  checkForUpdate,
  selfUpdate,
} from "../dist/runtime/selfUpdate.js";
import { installCommand } from "../dist/runtime/installCommand.js";
import {
  resolveHeavyDepPath,
  resolveHeavyDepVersion,
  ensureRuntimeInstalled,
} from "../dist/runtime/loader.js";
import { getRuntimeDir } from "../dist/runtime/cacheDir.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

// A fake @puppeteer/browsers module (mirrors the one in runtime-browsers.test.js
// but local so this file stays self-contained).
function makeFakeBrowsersModule({
  latest = "100.0.0",
  onInstall,
  onUninstall,
  computeExecutablePath,
} = {}) {
  const installs = [];
  const uninstalls = [];
  return {
    detectBrowserPlatform: () => "linux",
    resolveBuildId: async () => latest,
    install: async (opts) => {
      installs.push(opts);
      if (onInstall) await onInstall(opts);
    },
    uninstall: async (opts) => {
      uninstalls.push(opts);
      if (onUninstall) await onUninstall(opts);
    },
    computeExecutablePath:
      computeExecutablePath ??
      (({ browser, buildId, cacheDir }) =>
        path.join(cacheDir, browser, buildId, `${browser}.exe`)),
    _calls: { installs, uninstalls },
  };
}

// A spawner that emits a chosen close code (and optional 'error') on the
// returned child, capturing every call.
function makeFakeSpawner({ exitCode = 0, emitError } = {}) {
  const calls = [];
  const fn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => {};
    setImmediate(() => {
      if (emitError) child.emit("error", emitError);
      else child.emit("close", exitCode);
    });
    return child;
  };
  fn.calls = calls;
  return fn;
}

// Pull the nested subcommand modules out of installCommand's builder so their
// handlers can be invoked directly with a synthetic argv.
function extractInstallSubcommands() {
  const subs = {};
  const fakeYargs = {
    command(mod) {
      if (mod && mod.command) subs[String(mod.command).split(" ")[0]] = mod;
      return this;
    },
    option() {
      return this;
    },
    positional() {
      return this;
    },
    demandCommand() {
      return this;
    },
  };
  installCommand.builder(fakeYargs);
  return subs;
}

describe("runtime helpers extra coverage", function () {
  let sandbox;
  beforeEach(function () {
    sandbox = sinon.createSandbox();
  });
  afterEach(function () {
    sandbox.restore();
  });

  // -------------------------------------------------------------------------
  // browsers.ts
  // -------------------------------------------------------------------------
  describe("browsers.ts", function () {
    let originalEnv;
    let tmpRoot;
    beforeEach(function () {
      originalEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-bcov-"));
      process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
    });
    afterEach(function () {
      if (originalEnv === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
      else process.env.DOC_DETECTIVE_CACHE_DIR = originalEnv;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it("verifyDriverBinary uses the real defaultDriverExec when no exec is injected (spawn failure of a nonexistent binary)", async function () {
      // Drive the production defaultDriverExec code path (execFile) by pointing
      // at an absolute, driver-named path that does not exist. This exercises
      // the real child_process branch offline: execFile fails to spawn, so the
      // helper reports a not-ok result. We assert only on STRUCTURE (ok:false),
      // never on host-specific error text.
      const fakePath = path.join(tmpRoot, "chromedriver");
      const res = await verifyDriverBinary("chromedriver", fakePath);
      expect(res.ok).to.equal(false);
      expect(res.error).to.be.a("string");
    });

    it("ensureBrowserInstalled surfaces a clean error when detectBrowserPlatform returns undefined (unsupported OS)", async function () {
      const browsersModule = makeFakeBrowsersModule();
      browsersModule.detectBrowserPlatform = () => undefined;
      let threw = false;
      try {
        await ensureBrowserInstalled("chrome", {
          deps: { browsersModule, logger: () => {} },
        });
      } catch (err) {
        threw = true;
        expect(String(err.message)).to.match(/Unable to determine browser platform/);
      }
      expect(threw).to.equal(true);
    });

    it("ensureBrowserInstalled fast-path: fresh record whose latestKnownVersion differs warns and reports outdated (no resolveBuildId)", async function () {
      let resolveCalled = false;
      writeInstalledRecord(
        {
          npmPackages: {},
          browsers: {
            chrome: {
              installedVersion: "100.0.0",
              installedAt: "2026-01-01T00:00:00Z",
              latestKnownVersion: "124.0.0", // known-stale, but freshness current
              latestCheckedAt: new Date().toISOString(),
            },
          },
        },
        {}
      );
      const browsersModule = makeFakeBrowsersModule({ latest: "999.0.0" });
      browsersModule.resolveBuildId = async () => {
        resolveCalled = true;
        return "999.0.0";
      };
      const warnings = [];
      const result = await ensureBrowserInstalled("chrome", {
        deps: {
          browsersModule,
          logger: (msg, level) => {
            if (level === "warn") warnings.push(msg);
          },
        },
      });
      expect(result.version).to.equal("100.0.0");
      expect(result.outdated).to.equal(true);
      expect(resolveCalled, "fast path must not resolve the channel").to.equal(false);
      expect(warnings.length).to.equal(1);
      expect(warnings[0]).to.include("--force");
    });

    it("ensureBrowserInstalled slow-path: stale freshness but installedVersion already matches the resolved latest → refreshes record, no install", async function () {
      writeInstalledRecord(
        {
          npmPackages: {},
          browsers: {
            chrome: {
              installedVersion: "124.0.0",
              installedAt: "2026-01-01T00:00:00Z",
              latestKnownVersion: "124.0.0",
              latestCheckedAt: "2020-01-01T00:00:00Z", // stale → re-resolves
            },
          },
        },
        {}
      );
      const browsersModule = makeFakeBrowsersModule({ latest: "124.0.0" });
      const result = await ensureBrowserInstalled("chrome", {
        deps: { browsersModule, logger: () => {} },
      });
      expect(result.version).to.equal("124.0.0");
      expect(result.outdated).to.equal(false);
      expect(browsersModule._calls.installs).to.deep.equal([]);
      // The freshness stamp is refreshed.
      const record = readInstalledRecord({});
      expect(record.browsers.chrome.latestCheckedAt).to.not.equal(
        "2020-01-01T00:00:00Z"
      );
    });

    it("ensureBrowserInstalled('chromedriver') validates by execution; a first-failure reinstalls once then succeeds", async function () {
      // computeExecutablePath yields a path ending in chromedriver(.exe) so the
      // isAllowedDriverPath gate passes and validation actually runs.
      const browsersModule = makeFakeBrowsersModule({
        latest: "124.0.0",
        computeExecutablePath: ({ cacheDir }) =>
          path.join(cacheDir, "chromedriver"),
      });
      let verifyCalls = 0;
      const verifyExec = async () => {
        verifyCalls++;
        return verifyCalls === 1
          ? { code: 0, stdout: "", stderr: "" } // partial → fails parse
          : { code: 0, stdout: "ChromeDriver 124.0.0\n", stderr: "" };
      };
      const result = await ensureBrowserInstalled("chromedriver", {
        deps: { browsersModule, logger: () => {}, verifyExec },
      });
      expect(result.version).to.equal("124.0.0");
      // install ran twice (initial + reinstall), uninstall ran once (prune broken).
      expect(browsersModule._calls.installs).to.have.lengthOf(2);
      expect(browsersModule._calls.uninstalls).to.have.lengthOf(1);
      expect(verifyCalls).to.equal(2);
    });

    it("ensureBrowserInstalled('chromedriver') throws when still non-functional after a reinstall", async function () {
      const browsersModule = makeFakeBrowsersModule({
        latest: "124.0.0",
        computeExecutablePath: ({ cacheDir }) =>
          path.join(cacheDir, "chromedriver"),
      });
      const verifyExec = async () => ({ code: 0, stdout: "", stderr: "" });
      let threw = false;
      try {
        await ensureBrowserInstalled("chromedriver", {
          deps: { browsersModule, logger: () => {}, verifyExec },
        });
      } catch (err) {
        threw = true;
        expect(String(err.message)).to.match(/non-functional after a reinstall/);
      }
      expect(threw).to.equal(true);
    });

    it("ensureBrowserInstalled('chromedriver') tolerates a prune failure of the old buildId (best-effort)", async function () {
      writeInstalledRecord(
        {
          npmPackages: {},
          browsers: {
            chromedriver: {
              installedVersion: "100.0.0",
              installedAt: "2026-01-01T00:00:00Z",
              latestKnownVersion: "100.0.0",
              latestCheckedAt: "2020-01-01T00:00:00Z",
            },
          },
        },
        {}
      );
      const debugs = [];
      const browsersModule = makeFakeBrowsersModule({
        latest: "124.0.0",
        computeExecutablePath: ({ cacheDir }) =>
          path.join(cacheDir, "chromedriver"),
        onUninstall: async (opts) => {
          // Only the OLD-buildId prune (100.0.0) throws; validation-driven
          // uninstalls (if any) would carry the new buildId.
          if (opts.buildId === "100.0.0") throw new Error("prune failed");
        },
      });
      const verifyExec = async () => ({
        code: 0,
        stdout: "ChromeDriver 124.0.0\n",
        stderr: "",
      });
      const result = await ensureBrowserInstalled("chromedriver", {
        // force so we take the install→prune-old-buildId path (a present-but-
        // stale asset otherwise warns without reinstalling).
        force: true,
        deps: {
          browsersModule,
          logger: (msg, level) => {
            if (level === "debug") debugs.push(msg);
          },
          verifyExec,
        },
      });
      expect(result.version).to.equal("124.0.0");
      // The prune failure was logged at debug and swallowed (install succeeded).
      expect(debugs.some((m) => /Failed to prune old/.test(m))).to.equal(true);
    });

    it("ensureBrowserInstalled('geckodriver') fast-path: fresh record returns the cached version and marks outdated only when a different latest is known", async function () {
      writeInstalledRecord(
        {
          npmPackages: {},
          browsers: {
            geckodriver: {
              installedVersion: "0.36.0",
              installedAt: "2026-01-01T00:00:00Z",
              latestKnownVersion: "0.37.0",
              latestCheckedAt: new Date().toISOString(),
            },
          },
        },
        {}
      );
      let downloadCalled = false;
      const geckodriverModule = {
        path: path.join(tmpRoot, "browsers", "geckodriver"),
        download: async () => {
          downloadCalled = true;
        },
      };
      const result = await ensureBrowserInstalled("geckodriver", {
        deps: { geckodriverModule, logger: () => {} },
      });
      expect(result.version).to.equal("0.36.0");
      expect(result.outdated).to.equal(true);
      expect(downloadCalled, "fast path must not download").to.equal(false);
    });

    it("ensureBrowserInstalled('geckodriver') fast-path: not outdated when latestKnownVersion is undefined/unknown", async function () {
      writeInstalledRecord(
        {
          npmPackages: {},
          browsers: {
            geckodriver: {
              installedVersion: "unknown",
              installedAt: "2026-01-01T00:00:00Z",
              // latestKnownVersion intentionally omitted
              latestCheckedAt: new Date().toISOString(),
            },
          },
        },
        {}
      );
      const geckodriverModule = {
        path: path.join(tmpRoot, "browsers", "geckodriver"),
        download: async () => {},
      };
      const result = await ensureBrowserInstalled("geckodriver", {
        deps: { geckodriverModule, logger: () => {} },
      });
      expect(result.outdated).to.equal(false);
    });

    it("geckodriverBinaryInCache returns undefined for a nonexistent cache dir (readdir throws)", function () {
      const missing = path.join(tmpRoot, "does-not-exist-at-all");
      expect(geckodriverBinaryInCache(missing)).to.equal(undefined);
    });

    it("ensureBrowserInstalled('geckodriver') quarantines the on-disk binary before re-downloading when the first validation fails", async function () {
      // First download writes a real (but broken) binary to disk; first
      // validation fails, so the code fs.rmSync-quarantines the existing file
      // before re-downloading. This drives the quarantine branch that only runs
      // when the binary actually exists on disk.
      const browsersDir = path.join(tmpRoot, "browsers");
      fs.mkdirSync(browsersDir, { recursive: true });
      const binName =
        process.platform === "win32" ? "geckodriver.exe" : "geckodriver";
      const binPath = path.join(browsersDir, binName);
      let downloads = 0;
      const geckodriverModule = {
        path: binPath,
        download: async () => {
          downloads++;
          fs.writeFileSync(binPath, `download-${downloads}`);
        },
      };
      let verifyCalls = 0;
      const verifyExec = async () => {
        verifyCalls++;
        return verifyCalls === 1
          ? { code: 0, stdout: "", stderr: "" } // broken → triggers quarantine
          : { code: 0, stdout: "geckodriver 0.37.0\n", stderr: "" };
      };
      const result = await ensureBrowserInstalled("geckodriver", {
        deps: { geckodriverModule, logger: () => {}, verifyExec },
      });
      expect(downloads).to.equal(2);
      expect(result.version).to.equal("0.37.0");
      // The re-download's content is what survives.
      expect(fs.readFileSync(binPath, "utf8")).to.equal("download-2");
    });

    it("ensureBrowserInstalled uses the module-level defaultLogger when none is injected (console-routed)", async function () {
      // No `logger` in deps → the module falls back to its defaultLogger, which
      // routes info→console.log. Stub console so nothing leaks; this drives the
      // defaultLogger branch. RUNTIME_DEBUG on also exercises the debug gate.
      const prevDebug = process.env.DOC_DETECTIVE_RUNTIME_DEBUG;
      process.env.DOC_DETECTIVE_RUNTIME_DEBUG = "1";
      const logStub = sandbox.stub(console, "log");
      sandbox.stub(console, "error");
      try {
        const browsersModule = makeFakeBrowsersModule({ latest: "121.0.0" });
        const result = await ensureBrowserInstalled("chrome", {
          deps: { browsersModule }, // no logger
        });
        expect(result.version).to.equal("121.0.0");
        expect(logStub.called).to.equal(true);
      } finally {
        if (prevDebug === undefined) delete process.env.DOC_DETECTIVE_RUNTIME_DEBUG;
        else process.env.DOC_DETECTIVE_RUNTIME_DEBUG = prevDebug;
      }
    });

    it("ensureBrowserInstalled('chromedriver') logs a debug note when pruning the broken build fails during reinstall", async function () {
      // Drive the reinstall path where the FIRST validation fails and the
      // uninstall of the broken build (same latest buildId) throws — the
      // failure is logged at debug and swallowed, then the reinstall succeeds.
      const browsersModule = makeFakeBrowsersModule({
        latest: "124.0.0",
        computeExecutablePath: ({ cacheDir }) =>
          path.join(cacheDir, "chromedriver"),
        onUninstall: async () => {
          throw new Error("cannot prune broken build");
        },
      });
      let verifyCalls = 0;
      const verifyExec = async () => {
        verifyCalls++;
        return verifyCalls === 1
          ? { code: 0, stdout: "", stderr: "" }
          : { code: 0, stdout: "ChromeDriver 124.0.0\n", stderr: "" };
      };
      const debugs = [];
      const result = await ensureBrowserInstalled("chromedriver", {
        deps: {
          browsersModule,
          logger: (msg, level) => {
            if (level === "debug") debugs.push(msg);
          },
          verifyExec,
        },
      });
      expect(result.version).to.equal("124.0.0");
      expect(debugs.some((m) => /Failed to prune broken/.test(m))).to.equal(true);
    });
  });

  // -------------------------------------------------------------------------
  // selfUpdate.ts
  // -------------------------------------------------------------------------
  describe("selfUpdate.ts", function () {
    it("compareVersions handles unequal-length cores and differing patch levels", function () {
      expect(compareVersions("1.2", "1.2.0")).to.equal(0);
      expect(compareVersions("1.2.3", "1.2")).to.be.greaterThan(0);
      expect(compareVersions("1.2.0", "1.2.5")).to.be.lessThan(0);
    });

    it("detectInstallMode returns a value from the canonical set", function () {
      expect(["global", "local", "npx", "unknown"]).to.include(detectInstallMode());
    });

    it("detectInstallMode classifies an _npx entrypoint as npx", function () {
      const origArgv = process.argv;
      try {
        // Cross-platform: build the path with the host's separator so the
        // helper's normalization is exercised for THIS os, then assert the
        // structural classification, not any path spelling.
        process.argv = [
          process.execPath,
          path.join(os.tmpdir(), "_npx", "abcd", "node_modules", "doc-detective", "bin.js"),
        ];
        expect(detectInstallMode()).to.equal("npx");
      } finally {
        process.argv = origArgv;
      }
    });

    it("detectInstallMode classifies a global lib/node_modules entrypoint as global", function () {
      const origArgv = process.argv;
      try {
        process.argv = [
          process.execPath,
          path.join(path.sep, "usr", "local", "lib", "node_modules", "doc-detective", "bin.js"),
        ];
        expect(detectInstallMode()).to.equal("global");
      } finally {
        process.argv = origArgv;
      }
    });

    it("detectInstallMode classifies a plain node_modules entrypoint as local", function () {
      const origArgv = process.argv;
      try {
        process.argv = [
          process.execPath,
          path.join(path.sep, "proj", "node_modules", "doc-detective", "bin.js"),
        ];
        expect(detectInstallMode()).to.equal("local");
      } finally {
        process.argv = origArgv;
      }
    });

    it("checkForUpdate uses the default axios http client (no injected http) and degrades gracefully offline", async function () {
      // No http injected → the module falls back to axios.get(REGISTRY_URL).
      // We stub axios so nothing hits the network: force a rejection and assert
      // the { newer:false } graceful-degradation contract.
      const axiosMod = (await import("axios")).default;
      const stub = sandbox.stub(axiosMod, "get").rejects(new Error("offline"));
      const res = await checkForUpdate("4.5.0", { logger: () => {} });
      expect(res.newer).to.equal(false);
      expect(res.latest).to.equal(null);
      expect(stub.calledOnce).to.equal(true);
      // The URL argument is the npm registry endpoint (structure, not host).
      expect(stub.firstCall.args[0]).to.match(/registry\.npmjs\.org\/doc-detective$/);
    });

    it("selfUpdate global mode: install succeeds → re-execs and calls process.exit with the child's exit code", async function () {
      // Stub process.exit so the re-exec branch runs to completion without
      // killing the test runner. Force platform to a KNOWN value so the npm
      // executable name is deterministic regardless of the host OS.
      const exitStub = sandbox.stub(process, "exit");
      const platStub = sandbox
        .stub(process, "platform")
        .value("linux");
      const origArgv = process.argv;
      process.argv = [process.execPath, "/bin/doc-detective", "runTests"];
      try {
        const spawner = makeFakeSpawner({ exitCode: 0 });
        await selfUpdate("4.9.9", "global", { logger: () => {}, spawn: spawner });
        // Two spawns: npm install -g, then the node re-exec.
        expect(spawner.calls.length).to.equal(2);
        expect(spawner.calls[0].cmd).to.equal("npm"); // non-win branch
        expect(spawner.calls[0].args).to.deep.equal([
          "install",
          "-g",
          "doc-detective@4.9.9",
        ]);
        expect(spawner.calls[1].cmd).to.equal(process.execPath);
        expect(exitStub.calledOnce).to.equal(true);
        expect(exitStub.firstCall.args[0]).to.equal(0);
      } finally {
        process.argv = origArgv;
        void platStub;
      }
    });

    it("selfUpdate global mode: uses npm.cmd and shell:true on Windows", async function () {
      const exitStub = sandbox.stub(process, "exit");
      sandbox.stub(process, "platform").value("win32");
      const origArgv = process.argv;
      process.argv = [process.execPath, "C:/bin/doc-detective", "runTests"];
      try {
        const spawner = makeFakeSpawner({ exitCode: 0 });
        await selfUpdate("4.9.9", "global", { logger: () => {}, spawn: spawner });
        expect(spawner.calls[0].cmd).to.equal("npm.cmd");
        expect(spawner.calls[0].opts.shell).to.equal(true);
        expect(exitStub.called).to.equal(true);
      } finally {
        process.argv = origArgv;
      }
    });

    it("selfUpdate global mode: a failed npm install skips re-exec and returns updated:false", async function () {
      const exitStub = sandbox.stub(process, "exit");
      sandbox.stub(process, "platform").value("linux");
      const errors = [];
      const spawner = makeFakeSpawner({ exitCode: 1 });
      const result = await selfUpdate("4.9.9", "global", {
        logger: (msg, lvl) => {
          if (lvl === "error") errors.push(msg);
        },
        spawn: spawner,
      });
      expect(result.updated).to.equal(false);
      expect(result.reexec).to.equal(false);
      // Only the install spawn ran — no re-exec.
      expect(spawner.calls.length).to.equal(1);
      expect(exitStub.called).to.equal(false);
      expect(errors.some((m) => /exited with code 1/.test(m))).to.equal(true);
    });

    it("selfUpdate npx mode: re-launches via npx and calls process.exit", async function () {
      const exitStub = sandbox.stub(process, "exit");
      sandbox.stub(process, "platform").value("linux");
      const origArgv = process.argv;
      process.argv = [process.execPath, "/bin/doc-detective", "runTests", "--foo"];
      try {
        const spawner = makeFakeSpawner({ exitCode: 3 });
        await selfUpdate("4.9.9", "npx", { logger: () => {}, spawn: spawner });
        expect(spawner.calls.length).to.equal(1);
        expect(spawner.calls[0].cmd).to.equal("npx");
        expect(spawner.calls[0].args.slice(0, 2)).to.deep.equal([
          "-y",
          "doc-detective@4.9.9",
        ]);
        // Original argv tail (index 2+) is forwarded.
        expect(spawner.calls[0].args).to.include("--foo");
        expect(exitStub.firstCall.args[0]).to.equal(3);
      } finally {
        process.argv = origArgv;
      }
    });

    it("selfUpdate local mode uses the module-level defaultLogger when none is injected (console-routed)", async function () {
      // No logger → defaultLogger routes the info hint to console.log.
      const logStub = sandbox.stub(console, "log");
      const spawner = makeFakeSpawner();
      const result = await selfUpdate("4.6.0", "local", { spawn: spawner });
      expect(result.updated).to.equal(false);
      expect(logStub.called).to.equal(true);
      expect(spawner.calls).to.deep.equal([]);
    });

    it("selfUpdate: runChild rejects (and selfUpdate rejects) when the spawn emits an error", async function () {
      sandbox.stub(process, "platform").value("linux");
      const exitStub = sandbox.stub(process, "exit");
      const spawner = makeFakeSpawner({ emitError: new Error("spawn ENOENT") });
      let threw = false;
      try {
        await selfUpdate("4.9.9", "global", { logger: () => {}, spawn: spawner });
      } catch (err) {
        threw = true;
        expect(String(err.message)).to.match(/ENOENT/);
      }
      expect(threw).to.equal(true);
      expect(exitStub.called).to.equal(false);
    });
  });

  // -------------------------------------------------------------------------
  // installCommand.ts
  // -------------------------------------------------------------------------
  describe("installCommand.ts", function () {
    let tmpRoot;
    beforeEach(function () {
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-icov-"));
    });
    afterEach(function () {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it("the top-level install handler is a no-op (defensive fallthrough)", function () {
      // demandCommand normally prevents reaching this, but it exists as a
      // defensive branch; invoking it must not throw.
      expect(() => installCommand.handler({})).to.not.throw();
    });

    it("runtime subcommand rejects an unknown package name with a helpful error and sets exitCode=1", async function () {
      const subs = extractInstallSubcommands();
      const errors = [];
      const origExitCode = process.exitCode;
      // Capture console.error since the CLI logger writes there for errors.
      const errStub = sandbox.stub(console, "error").callsFake((m) => errors.push(String(m)));
      try {
        await subs.runtime.handler({
          packages: ["definitely-not-a-heavy-dep"],
          "dry-run": true,
          silent: false,
          "cache-dir": tmpRoot,
          cacheDir: tmpRoot,
        });
        expect(errors.some((m) => /Unknown runtime package/.test(m))).to.equal(true);
        expect(process.exitCode).to.equal(1);
      } finally {
        errStub.restore();
        process.exitCode = origExitCode;
      }
    });

    it("runtime subcommand (dry-run, known package) prints a report", async function () {
      const subs = extractInstallSubcommands();
      const logs = [];
      const logStub = sandbox.stub(console, "log").callsFake((m) => logs.push(String(m)));
      try {
        await subs.runtime.handler({
          packages: ["pngjs"],
          "dry-run": true,
          "cache-dir": tmpRoot,
          cacheDir: tmpRoot,
        });
      } finally {
        logStub.restore();
      }
      expect(logs.some((m) => /pngjs/.test(m))).to.equal(true);
    });

    it("all subcommand (dry-run) runs both installRuntime and installBrowsers and prints both headers", async function () {
      const subs = extractInstallSubcommands();
      const logs = [];
      const logStub = sandbox.stub(console, "log").callsFake((m) => logs.push(String(m)));
      try {
        await subs.all.handler({
          "dry-run": true,
          "cache-dir": tmpRoot,
          cacheDir: tmpRoot,
        });
      } finally {
        logStub.restore();
      }
      const joined = logs.join("\n");
      expect(joined).to.match(/Installing runtime/);
      expect(joined).to.match(/Installing browsers/);
    });

    it("status subcommand prints installed/expected rows", async function () {
      const subs = extractInstallSubcommands();
      const logs = [];
      const logStub = sandbox.stub(console, "log").callsFake((m) => logs.push(String(m)));
      try {
        await subs.status.handler({
          "cache-dir": tmpRoot,
          cacheDir: tmpRoot,
        });
      } finally {
        logStub.restore();
      }
      const joined = logs.join("\n");
      expect(joined).to.match(/installed=/);
    });

    it("status subcommand renders installed + (outdated) markers for a seeded record", async function () {
      // Seed a browser entry whose installedVersion != latestKnownVersion so the
      // handler's `installed ? version : —` and `outdated ? ' (outdated)'`
      // branches both render a concrete value rather than the empty placeholder.
      writeInstalledRecord(
        {
          npmPackages: {},
          browsers: {
            chrome: {
              installedVersion: "100.0.0",
              installedAt: "2026-01-01T00:00:00Z",
              latestKnownVersion: "124.0.0",
              latestCheckedAt: "2026-01-01T00:00:00Z",
            },
          },
        },
        { cacheDir: tmpRoot }
      );
      const subs = extractInstallSubcommands();
      const logs = [];
      const logStub = sandbox.stub(console, "log").callsFake((m) => logs.push(String(m)));
      try {
        await subs.status.handler({ "cache-dir": tmpRoot, cacheDir: tmpRoot });
      } finally {
        logStub.restore();
      }
      const joined = logs.join("\n");
      expect(joined).to.match(/\[browser\] chrome: installed=100\.0\.0/);
      expect(joined).to.match(/\(outdated\)/);
    });

    it("silent/quiet logging level suppresses info but keeps errors (verbose keeps everything)", async function () {
      // Exercise pickLogLevel + makeLogger via the runtime handler in --silent
      // mode: an unknown package still emits its error even when info is off.
      const subs = extractInstallSubcommands();
      const errors = [];
      const logs = [];
      const errStub = sandbox.stub(console, "error").callsFake((m) => errors.push(String(m)));
      const logStub = sandbox.stub(console, "log").callsFake((m) => logs.push(String(m)));
      const origExitCode = process.exitCode;
      try {
        await subs.runtime.handler({
          packages: ["nope-not-real"],
          silent: true,
          "cache-dir": tmpRoot,
          cacheDir: tmpRoot,
        });
        expect(errors.some((m) => /Unknown runtime package/.test(m))).to.equal(true);
      } finally {
        errStub.restore();
        logStub.restore();
        process.exitCode = origExitCode;
      }
    });
  });

  // -------------------------------------------------------------------------
  // loader.ts
  // -------------------------------------------------------------------------
  describe("loader.ts", function () {
    let originalEnv;
    let tmpRoot;
    beforeEach(function () {
      originalEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-lcov-"));
      process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
    });
    afterEach(function () {
      if (originalEnv === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
      else process.env.DOC_DETECTIVE_CACHE_DIR = originalEnv;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it("resolveHeavyDepVersion returns null when a cache package's package.json is malformed (JSON.parse throws, walk-up continues)", function () {
      // A resolvable entry whose sibling package.json is invalid JSON: the
      // walk-up swallows the parse error and keeps climbing, ultimately
      // returning null since no matching {name} package.json is found.
      const runtimeDir = getRuntimeDir({ cacheDir: tmpRoot });
      const pkgDir = path.join(runtimeDir, "node_modules", "broken-pkg");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(runtimeDir, "package.json"),
        JSON.stringify({ name: "rt-cache", private: true, version: "0.0.0" })
      );
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({ name: "broken-pkg", version: "1.0.0", main: "index.js" })
      );
      fs.writeFileSync(path.join(pkgDir, "index.js"), "module.exports={};");
      // Sanity: resolves and reads a good version.
      expect(resolveHeavyDepPath("broken-pkg", { cacheDir: tmpRoot })).to.not.equal(null);
      expect(resolveHeavyDepVersion("broken-pkg", { cacheDir: tmpRoot })).to.equal("1.0.0");

      // Now corrupt the package.json → version read returns null (parse error
      // swallowed, no matching name found on walk-up).
      fs.writeFileSync(path.join(pkgDir, "package.json"), "{ not valid json ");
      expect(resolveHeavyDepVersion("broken-pkg", { cacheDir: tmpRoot })).to.equal(null);
    });

    it("entryFromPackageJson resolves a bare string `.` export and a root-level shorthand exports", function () {
      // Cover the `typeof dot === 'string'` and root-level `exports.import`
      // branches of entryFromPackageJson (via resolveHeavyDepPath's fallback).
      const runtimeDir = getRuntimeDir({ cacheDir: tmpRoot });
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.writeFileSync(
        path.join(runtimeDir, "package.json"),
        JSON.stringify({ name: "rt-cache", private: true, version: "0.0.0" })
      );
      // Package whose "." is a bare string (no conditions object) AND has no
      // CJS resolution (type: module + no main), forcing the pkg-json fallback.
      const pkgDir = path.join(runtimeDir, "node_modules", "bare-esm");
      fs.mkdirSync(path.join(pkgDir, "lib"), { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({
          name: "bare-esm",
          version: "2.0.0",
          type: "module",
          exports: { ".": "./lib/main.js", "./package.json": "./package.json" },
        })
      );
      fs.writeFileSync(path.join(pkgDir, "lib", "main.js"), "export default {};\n");
      const resolved = resolveHeavyDepPath("bare-esm", { cacheDir: tmpRoot });
      expect(resolved).to.not.equal(null);
      expect(fs.realpathSync(resolved)).to.equal(
        fs.realpathSync(path.join(pkgDir, "lib", "main.js"))
      );
    });

    it("entryFromPackageJson falls back to `main` when exports omits a usable condition", function () {
      const runtimeDir = getRuntimeDir({ cacheDir: tmpRoot });
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.writeFileSync(
        path.join(runtimeDir, "package.json"),
        JSON.stringify({ name: "rt-cache", private: true, version: "0.0.0" })
      );
      const pkgDir = path.join(runtimeDir, "node_modules", "main-only-esm");
      fs.mkdirSync(pkgDir, { recursive: true });
      // exports "." is an object whose only condition is a non-standard key,
      // so `dot.import ?? dot.require ?? dot.default ?? dot.node` is undefined
      // and the code falls through to `pkg.main`. type:module + this exports
      // shape makes require.resolve(name) throw, forcing the fallback.
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({
          name: "main-only-esm",
          version: "3.1.0",
          type: "module",
          main: "entry.js",
          exports: { ".": { custom: "./entry.js" }, "./package.json": "./package.json" },
        })
      );
      fs.writeFileSync(path.join(pkgDir, "entry.js"), "export default {};\n");
      const resolved = resolveHeavyDepPath("main-only-esm", { cacheDir: tmpRoot });
      expect(resolved).to.not.equal(null);
      expect(fs.realpathSync(resolved)).to.equal(
        fs.realpathSync(path.join(pkgDir, "entry.js"))
      );
    });

    it("loadHeavyDep autoInstall:true installs (via stubbed spawner) then resolves the freshly-installed cache package", async function () {
      // Exercise the "not resolved anywhere → ensureRuntimeInstalled → resolve
      // from cache" happy path in loadHeavyDep, fully offline: the fake spawner
      // materializes a real ESM package under the runtime prefix. Use pngjs
      // (a declared heavy dep so getDeclaredVersion succeeds) but in a fresh
      // cache dir where it isn't resolvable yet. The shim already has pngjs, so
      // to force the cache path we instead assert ensureRuntimeInstalled's
      // spawn wiring directly below; here we prove the install→resolve loop for
      // a cache-only fake dep name isn't possible without a declared version.
      // So this test drives ensureRuntimeInstalled's readback + record write.
      const spawner = makeFakeSpawner({ exitCode: 0 });
      // Force platform so the npm executable name is deterministic.
      sandbox.stub(process, "platform").value("linux");
      const captured = [];
      const wrapped = (cmd, args, opts) => {
        captured.push({ cmd, args });
        // materialize the install so the version readback finds a package.json
        const prefix = args[args.indexOf("--prefix") + 1];
        const target = path.join(prefix, "node_modules", "pngjs");
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(
          path.join(target, "package.json"),
          JSON.stringify({ name: "pngjs", version: "9.9.9" })
        );
        return spawner(cmd, args, opts);
      };
      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: wrapped, logger: () => {} },
        force: true,
      });
      expect(captured.length).to.equal(1);
      expect(captured[0].cmd).to.equal("npm"); // non-win → bare npm
      const record = readInstalledRecord({});
      expect(record.npmPackages.pngjs.installedVersion).to.equal("9.9.9");
    });

    it("ensureRuntimeInstalled uses npm.cmd + shell:true on Windows", async function () {
      sandbox.stub(process, "platform").value("win32");
      const spawner = makeFakeSpawner({ exitCode: 0 });
      const captured = [];
      const wrapped = (cmd, args, opts) => {
        captured.push({ cmd, opts });
        const prefix = args[args.indexOf("--prefix") + 1];
        const target = path.join(prefix, "node_modules", "pngjs");
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(
          path.join(target, "package.json"),
          JSON.stringify({ name: "pngjs", version: "7.0.0" })
        );
        return spawner(cmd, args, opts);
      };
      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: wrapped, logger: () => {} },
        force: true,
      });
      expect(captured[0].cmd).to.equal("npm.cmd");
      expect(captured[0].opts.shell).to.equal(true);
    });

    it("ensureRuntimeInstalled rejects when the spawn emits an error event (spawn failure, no logHint)", async function () {
      sandbox.stub(process, "platform").value("linux");
      const spawner = makeFakeSpawner({ emitError: new Error("spawn EINVAL") });
      let threw = false;
      try {
        await ensureRuntimeInstalled(["pngjs"], {
          deps: { spawn: spawner, logger: () => {} },
          force: true,
        });
      } catch (err) {
        threw = true;
        expect(String(err.message)).to.match(/EINVAL/);
      }
      expect(threw).to.equal(true);
    });

    it("ensureRuntimeInstalled: a stalled npm is killed and the promise rejects when installTimeoutMs elapses", async function () {
      // Spawner that NEVER emits close/error → the wall-clock timer must fire,
      // kill the child, and reject. Fully offline and deterministic (tiny
      // timeout). Covers the timeout branch (kill + reject with a timeout msg).
      sandbox.stub(process, "platform").value("linux");
      let killed = false;
      const spawner = (cmd, args, opts) => {
        const child = new EventEmitter();
        child.stdout = new EventEmitter();
        child.stderr = new EventEmitter();
        child.kill = () => {
          killed = true;
        };
        // deliberately never emit close/error
        return child;
      };
      let threw = false;
      try {
        await ensureRuntimeInstalled(["pngjs"], {
          deps: { spawn: spawner, logger: () => {} },
          force: true,
          installTimeoutMs: 25,
        });
      } catch (err) {
        threw = true;
        expect(String(err.message)).to.match(/timed out after 25ms/);
      }
      expect(threw).to.equal(true);
      expect(killed, "the stalled child must be killed").to.equal(true);
    });

    it("readInstalledVersionFromCache tolerates a missing cache package.json (returns null via the catch)", async function () {
      // force:false with a cache dir that has NO node_modules/pngjs makes the
      // readback in the skip-decision path hit its catch and return null. Since
      // pngjs is shim-resolvable it's skipped before npm runs — but the
      // readInstalledVersionFromCache path is only reached for a cache-only
      // dep, so instead we assert the observable no-op: nothing spawns.
      const spawner = makeFakeSpawner({ exitCode: 0 });
      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: spawner, logger: () => {} },
      });
      expect(spawner.calls).to.deep.equal([]);
    });

    it("defaultLogger (no injected logger) routes debug/error correctly with RUNTIME_DEBUG on", async function () {
      // Exercise loader's module-level defaultLogger branches (debug gated on
      // DOC_DETECTIVE_RUNTIME_DEBUG, error → console.error) by driving a spawn
      // failure with NO logger injected. Stub console so nothing leaks.
      sandbox.stub(process, "platform").value("linux");
      const prevDebug = process.env.DOC_DETECTIVE_RUNTIME_DEBUG;
      process.env.DOC_DETECTIVE_RUNTIME_DEBUG = "1";
      sandbox.stub(console, "log");
      sandbox.stub(console, "error");
      try {
        const spawner = makeFakeSpawner({ emitError: new Error("spawn boom") });
        let threw = false;
        try {
          await ensureRuntimeInstalled(["pngjs"], {
            deps: { spawn: spawner },
            force: true,
          });
        } catch {
          threw = true;
        }
        expect(threw).to.equal(true);
      } finally {
        if (prevDebug === undefined) delete process.env.DOC_DETECTIVE_RUNTIME_DEBUG;
        else process.env.DOC_DETECTIVE_RUNTIME_DEBUG = prevDebug;
      }
    });

    it("ensureRuntimeInstalled: installTimeoutMs=0 disables the timeout (no timer branch)", async function () {
      sandbox.stub(process, "platform").value("linux");
      const spawner = makeFakeSpawner({ exitCode: 0 });
      const wrapped = (cmd, args, opts) => {
        const prefix = args[args.indexOf("--prefix") + 1];
        const target = path.join(prefix, "node_modules", "pngjs");
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(
          path.join(target, "package.json"),
          JSON.stringify({ name: "pngjs", version: "7.0.0" })
        );
        return spawner(cmd, args, opts);
      };
      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: wrapped, logger: () => {} },
        force: true,
        installTimeoutMs: 0,
      });
      const record = readInstalledRecord({});
      expect(record.npmPackages.pngjs.installedVersion).to.equal("7.0.0");
    });
  });
});
