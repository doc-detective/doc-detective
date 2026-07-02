// Coverage-closing tests for the remaining uncovered lines/branches in
// `src/debug/*.ts` (measured against the compiled `dist/debug/*.js`).
//
// Every test here is HERMETIC and OFFLINE: no real network, no real
// long-lived spawn beyond a couple of quick, self-terminating `node`
// child processes already used elsewhere in the debug test suite. The
// injection seams used throughout:
//
//   - `fs`, `os`, `child_process`'s `ChildProcess.prototype.kill` are
//     stubbed via sinon where the *consuming* module uses a DEFAULT ESM
//     import (`import fs from "node:fs"`) and calls it as `fs.xxx(...)`
//     at call time — sinon CAN replace a property on that shared default-
//     export object. Modules that use NAMED imports (`import { spawn }
//     from "node:child_process"`, `import { existsSync } from "node:fs"`
//     in src/core/appium.ts, `resolveHeavyDepPath` in src/runtime/loader.ts,
//     etc.) bind a live reference at compile time that sinon cannot patch
//     ("ES Modules cannot be stubbed") — those throw/branch paths are
//     documented with `c8 ignore` comments in the source instead.
//   - `config.cacheDir` containing a shell metacharacter (e.g. `;`) makes
//     `assertSafeRuntimePath` (src/runtime/cacheDir.ts) throw synchronously
//     from `getCacheDir`/`getRuntimeDir`/`getInstalledRecordPath` — a real,
//     legitimate way to drive the "cache/appium collector blew up" catch
//     paths without any mocking.
//   - Throwing property getters on plain `args`/`data`/`config` objects
//     passed into pure functions (`collectCliOverrides`, `computeFindings`,
//     `safeRedactConfig` via `printDebug`) exercise their defensive
//     try/catch wrappers without any module mocking at all.
//
// Every stub is restored in a `finally` AND (belt-and-suspenders) in
// `afterEach`, and every mutated env var is restored the same way, so
// nothing leaks into the rest of the combined suite.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { ChildProcess } from "node:child_process";
import sinon from "sinon";

import { printDebug } from "../dist/debug/index.js";
import { debugCommand } from "../dist/debug/command.js";
import { collectAppiumDiagnostics } from "../dist/debug/appium.js";
import { collectCacheStatus } from "../dist/debug/cache.js";
import { collectInstallStatus } from "../dist/debug/install.js";
import { collectCliOverrides } from "../dist/debug/provenance.js";
import { computeFindings } from "../dist/debug/findings.js";
import {
  detectContainer,
  enumerateInputFiles,
  findReferencedEnvVars,
  resolveDocExtensions,
} from "../dist/debug/envvars.js";
import { collectSystemInfo } from "../dist/debug/system.js";
import { probeTool, probeAllTools } from "../dist/debug/tools.js";

// A cacheDir value containing a shell metacharacter. `assertSafeRuntimePath`
// (src/runtime/cacheDir.ts) throws synchronously on it from every
// getCacheDir()-derived helper (getRuntimeDir, getBrowsersDir,
// getInstalledRecordPath) — the shared "make a cache-dir-consuming
// collector blow up" fixture used throughout this file.
const BAD_CACHE_DIR = "bad;chars";

describe("debug/* remaining coverage", function () {
  // Belt-and-suspenders leak guard: every test restores its own stubs in a
  // `finally`, but if one is ever missed, this net catches it before the
  // next test (or the rest of the combined suite) sees a stale stub/env.
  afterEach(function () {
    sinon.restore();
  });

  // -------------------------------------------------------------------
  // appium.ts
  // -------------------------------------------------------------------
  describe("appium.ts", function () {
    it("setAppiumHome's swallowed throw leaves appiumHome null (lines 79-81)", function () {
      const prevHome = process.env.APPIUM_HOME;
      delete process.env.APPIUM_HOME;
      try {
        // BAD_CACHE_DIR makes setAppiumHome's own getRuntimeDir() call throw;
        // the try/catch inside collectAppiumDiagnostics swallows it, so
        // process.env.APPIUM_HOME is never assigned and stays unset.
        const diag = collectAppiumDiagnostics({ cacheDir: BAD_CACHE_DIR });
        assert.equal(diag.appiumHome, null);
        assert.equal(diag.extensionsManifestPath, null);
        assert.equal(diag.extensionsManifestPresent, false);
        for (const d of diag.drivers) assert.equal(d.registered, null);
      } finally {
        if (prevHome === undefined) delete process.env.APPIUM_HOME;
        else process.env.APPIUM_HOME = prevHome;
      }
    });

    it("existsSync throwing on the manifest path degrades to absent (lines 97-98)", function () {
      const prevHome = process.env.APPIUM_HOME;
      process.env.APPIUM_HOME = path.join(os.tmpdir(), "dd-appium-existssync-throws");
      const stub = sinon.stub(fs, "existsSync").throws(new Error("existsSync boom"));
      try {
        const diag = collectAppiumDiagnostics({});
        assert.equal(diag.extensionsManifestPresent, false);
        assert.equal(diag.manifestError, undefined);
      } finally {
        stub.restore();
        if (prevHome === undefined) delete process.env.APPIUM_HOME;
        else process.env.APPIUM_HOME = prevHome;
      }
    });

    it("an unparsable extensions.yaml sets manifestError (lines 105-106)", function () {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-appium-badyaml-"));
      const manifestDir = path.join(tmp, "node_modules", ".cache", "appium");
      fs.mkdirSync(manifestDir, { recursive: true });
      fs.writeFileSync(
        path.join(manifestDir, "extensions.yaml"),
        "drivers:\n  bad: [unterminated"
      );
      const prevHome = process.env.APPIUM_HOME;
      process.env.APPIUM_HOME = tmp;
      try {
        // BAD_CACHE_DIR makes the collector's own setAppiumHome() call throw
        // (swallowed), so our pre-set APPIUM_HOME above survives untouched
        // and the manifest read runs against the broken YAML fixture.
        const diag = collectAppiumDiagnostics({ cacheDir: BAD_CACHE_DIR });
        assert.equal(diag.extensionsManifestPresent, true);
        assert.match(diag.manifestError, /Flow sequence|sufficiently indented/);
        for (const d of diag.drivers) assert.equal(d.registered, null);
      } finally {
        if (prevHome === undefined) delete process.env.APPIUM_HOME;
        else process.env.APPIUM_HOME = prevHome;
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("a non-Error manifest-read throw falls back to String(err) (line 105 branch)", function () {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-appium-nonerror-"));
      const manifestDir = path.join(tmp, "node_modules", ".cache", "appium");
      fs.mkdirSync(manifestDir, { recursive: true });
      fs.writeFileSync(path.join(manifestDir, "extensions.yaml"), "drivers: {}");
      const prevHome = process.env.APPIUM_HOME;
      process.env.APPIUM_HOME = tmp;
      const original = fs.readFileSync;
      const stub = sinon.stub(fs, "readFileSync").callsFake((p, ...rest) => {
        if (typeof p === "string" && p.includes("extensions.yaml")) {
          // eslint-disable-next-line no-throw-literal
          throw "plain string throw"; // non-Error: exercises `err?.message || String(err)`'s fallback.
        }
        return original(p, ...rest);
      });
      try {
        const diag = collectAppiumDiagnostics({ cacheDir: BAD_CACHE_DIR });
        assert.equal(diag.manifestError, "plain string throw");
      } finally {
        stub.restore();
        if (prevHome === undefined) delete process.env.APPIUM_HOME;
        else process.env.APPIUM_HOME = prevHome;
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  // -------------------------------------------------------------------
  // cache.ts
  // -------------------------------------------------------------------
  describe("cache.ts", function () {
    let prevCacheEnv;
    beforeEach(function () {
      prevCacheEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
      delete process.env.DOC_DETECTIVE_CACHE_DIR;
    });
    afterEach(function () {
      if (prevCacheEnv === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
      else process.env.DOC_DETECTIVE_CACHE_DIR = prevCacheEnv;
    });

    it("safeExists catches a throwing existsSync (lines 48-49)", function () {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-existsthrow-"));
      const stub = sinon.stub(fs, "existsSync").throws(new Error("existsSync boom"));
      try {
        const status = collectCacheStatus({ cacheDir: tmp });
        for (const e of status.entries) assert.equal(e.exists, false);
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("nearestExistingPath exhausts its 64-hop bound on a very deep, entirely nonexistent path (lines 66-67)", function () {
      // Force safeExists() to always report false so the ancestor-walk in
      // nearestExistingPath never finds an existing directory and never hits
      // a fixed point (path.dirname(root) === root) within 64 iterations.
      let deep = path.join(os.tmpdir(), "dd-cache-deep-walk");
      for (let i = 0; i < 70; i++) deep = path.join(deep, `seg${i}`);
      const stub = sinon.stub(fs, "existsSync").returns(false);
      try {
        const status = collectCacheStatus({ cacheDir: deep });
        // Must return without hanging/throwing; every entry reports exists:false
        // (existsSync stubbed) and a defined writable (isWritable still ran
        // to completion against the bound's fallback path).
        assert.ok(status.entries.length > 0);
        for (const e of status.entries) {
          assert.equal(e.exists, false);
          assert.ok(typeof e.writable === "boolean" || e.writable === null);
        }
      } finally {
        stub.restore();
      }
    });

    it("isWritable catches a throwing accessSync (lines 75-76)", function () {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-accessthrow-"));
      const stub = sinon.stub(fs, "accessSync").throws(new Error("accessSync boom"));
      try {
        const status = collectCacheStatus({ cacheDir: tmp });
        for (const e of status.entries) {
          if (e.writable !== null) assert.equal(e.writable, false);
        }
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("freeSpaceBytes: throwing statfsSync -> null (lines 93-95)", function () {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-statfsthrow-"));
      const stub = sinon.stub(fs, "statfsSync").throws(new Error("statfsSync boom"));
      try {
        const status = collectCacheStatus({ cacheDir: tmp });
        const cacheDir = status.entries.find((e) => e.label === "cacheDir");
        assert.equal(cacheDir.freeBytes, null);
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("freeSpaceBytes: malformed statfsSync shape -> null (lines 89-91)", function () {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-statfsshape-"));
      const stub = sinon.stub(fs, "statfsSync").returns({});
      try {
        const status = collectCacheStatus({ cacheDir: tmp });
        const cacheDir = status.entries.find((e) => e.label === "cacheDir");
        assert.equal(cacheDir.freeBytes, null);
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("freeSpaceBytes: statfsSync not a function -> null (line 84 branch)", function () {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-statfsmissing-"));
      const stub = sinon.stub(fs, "statfsSync").value(undefined);
      try {
        const status = collectCacheStatus({ cacheDir: tmp });
        const cacheDir = status.entries.find((e) => e.label === "cacheDir");
        assert.equal(cacheDir.freeBytes, null);
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("a bad cacheDir makes the whole probe fail with an error (outer catch)", function () {
      const status = collectCacheStatus({ cacheDir: BAD_CACHE_DIR });
      assert.match(status.error, /shell-metacharacter/);
      assert.deepEqual(status.entries, []);
    });
  });

  // -------------------------------------------------------------------
  // install.ts
  // -------------------------------------------------------------------
  describe("install.ts", function () {
    it("a bad cacheDir degrades to an error marker instead of throwing (lines 25-27)", function () {
      const data = collectInstallStatus({ cacheDir: BAD_CACHE_DIR });
      assert.match(data.error, /shell-metacharacter/);
      assert.equal(data.rows, undefined);
    });

    it("a non-Error throw falls back to String(err) (line 26 branch)", function () {
      const evilConfig = {};
      Object.defineProperty(evilConfig, "cacheDir", {
        enumerable: true,
        get() {
          // eslint-disable-next-line no-throw-literal
          throw "plain string throw from cacheDir getter"; // non-Error
        },
      });
      const data = collectInstallStatus(evilConfig);
      assert.equal(data.error, "plain string throw from cacheDir getter");
    });
  });

  // -------------------------------------------------------------------
  // provenance.ts
  // -------------------------------------------------------------------
  describe("provenance.ts", function () {
    it("a throwing `present` check for one spec doesn't abort the others (lines 141-143)", function () {
      const evilArgs = { dryRun: true };
      Object.defineProperty(evilArgs, "input", {
        enumerable: true,
        get() {
          throw new Error("boom from input getter");
        },
      });
      const out = collectCliOverrides(evilArgs);
      // `input`'s own spec silently drops out (present=false via the catch),
      // but `dryRun`'s spec still evaluates and is reported.
      assert.ok(!out.some((o) => o.flag === "input"));
      assert.ok(out.some((o) => o.flag === "dry-run"));
    });

    it("reportersPresent handles a scalar (non-array) reporters value (line 36 branch)", function () {
      // setConfig accepts a bare string too (not just an array); the
      // `Array.isArray(reporters) ? reporters : [reporters]` branch normalizes
      // a scalar into a single-element list before the length check.
      const out = collectCliOverrides({ reporters: "html" });
      assert.ok(out.some((o) => o.flag === "reporters"));
    });
  });

  // -------------------------------------------------------------------
  // findings.ts
  // -------------------------------------------------------------------
  describe("findings.ts", function () {
    it("a rule that throws is skipped without aborting the others (lines 149-151)", function () {
      const evilData = {
        appium: { drivers: [] },
        install: { rows: [] },
        cache: { entries: [] },
        network: { variables: [] },
        docDetective: {},
      };
      Object.defineProperty(evilData, "browsers", {
        enumerable: true,
        get() {
          throw new Error("boom from browsers getter");
        },
      });
      // Every RULE reads data.browsers first (directly or via findBrowser),
      // so all five throw and are all skipped — the call must still return
      // cleanly with an empty array rather than propagating.
      const findings = computeFindings(evilData);
      assert.deepEqual(findings, []);
    });

    it("every rule's optional-chaining fallback handles a data section being entirely absent (lines 25, 29, 81, 98, 104, 121 branches)", function () {
      // Omit appium/browsers/cache/network/install one at a time so each
      // rule's `data.section?.field || []` optional-chaining fallback (not
      // just the "field present but empty array" case already covered
      // elsewhere) fires. None of these should throw or find anything to
      // report given otherwise-clean data.
      const full = () => ({
        appium: { drivers: [] },
        browsers: { browsers: [] },
        install: { rows: [] },
        cache: { entries: [] },
        network: { variables: [] },
        docDetective: {},
      });

      let data = full();
      delete data.appium;
      assert.deepEqual(computeFindings(data), []);

      data = full();
      delete data.browsers;
      assert.deepEqual(computeFindings(data), []);

      data = full();
      delete data.cache;
      assert.deepEqual(computeFindings(data), []);

      data = full();
      delete data.network;
      assert.deepEqual(computeFindings(data), []);

      // proxyMaybeBlocking's own `data.install?.rows || []` fallback: a
      // proxy IS configured (so the rule proceeds past its own guard) but
      // `install` is entirely absent.
      data = full();
      data.network = { variables: [{ name: "npm_config_proxy", value: "http://p:8080" }] };
      delete data.install;
      assert.deepEqual(computeFindings(data), []);

      // findDriver's `data.appium?.drivers || []`: `appium` present but its
      // `.drivers` key itself absent (the RIGHT side of `?.`, distinct from
      // `data.appium` being entirely undefined above).
      data = full();
      data.appium = {};
      assert.deepEqual(computeFindings(data), []);
    });

    it("findDriver's `data.appium?.` optional-chaining short-circuit fires when chromeUnavailable actually reaches it (line 25 branch)", function () {
      // findDriver() is only called once chromeUnavailable has already
      // established chrome is supported and NOT available — the earlier
      // "no appium key" case in the previous test never reaches this call
      // at all (chrome isn't even in the browsers list there), so this
      // needs its own chrome-unavailable fixture with `appium` entirely
      // absent to hit `data.appium?.drivers` short-circuiting on `appium`
      // itself being undefined.
      const findings = computeFindings({
        browsers: {
          browsers: [{ name: "chrome", supported: true, available: false }],
        },
        install: { rows: [] },
        cache: { entries: [] },
        network: { variables: [] },
        docDetective: {},
        // appium entirely absent
      });
      const chrome = findings.find((f) => /Chrome is not available/.test(f.title));
      assert.ok(chrome);
      assert.match(chrome.detail, /is missing/);
    });

    it("staleInstall fires via the lockstep-only path (no outdated rows) (line 70 branch)", function () {
      const findings = computeFindings({
        appium: { drivers: [] },
        browsers: { browsers: [] },
        install: { rows: [] },
        cache: { entries: [] },
        network: { variables: [] },
        docDetective: {
          lockstepWarning: "doc-detective and doc-detective-common differ",
        },
      });
      const stale = findings.find((f) => /stale/i.test(f.title));
      assert.ok(stale);
      assert.match(stale.detail, /version mismatch/);
    });

    it("proxyMaybeBlocking returns null when nothing is missing despite a proxy being set (line 107 branch)", function () {
      const findings = computeFindings({
        appium: { drivers: [] },
        browsers: { browsers: [] },
        install: {
          rows: [{ assetId: "webdriverio", kind: "npm", installed: true, outdated: false }],
        },
        cache: { entries: [] },
        network: { variables: [{ name: "npm_config_proxy", value: "http://p:8080" }] },
        docDetective: {},
      });
      assert.equal(findings.find((f) => /proxy/i.test(f.title)), undefined);
    });
  });

  // -------------------------------------------------------------------
  // system.ts
  // -------------------------------------------------------------------
  describe("system.ts", function () {
    it("os.cpus() throwing falls back to an empty cpu list (lines 33-38)", function () {
      const stub = sinon.stub(os, "cpus").throws(new Error("cpus boom"));
      try {
        const info = collectSystemInfo();
        assert.equal(info.cpuCount, 0);
        assert.equal(info.cpuModel, "<unknown>");
        assert.equal(info.cpuSpeedMhz, 0);
      } finally {
        stub.restore();
      }
    });

    it("Intl.DateTimeFormat throwing falls back to '<unknown>' timezone (lines 43-47)", function () {
      const origIntl = global.Intl;
      try {
        global.Intl = {
          DateTimeFormat() {
            throw new Error("Intl boom");
          },
        };
        const info = collectSystemInfo();
        assert.equal(info.timezone, "<unknown>");
      } finally {
        global.Intl = origIntl;
      }
    });

    it("os.cpus() returning a falsy (non-throwing) value hits the `|| []` fallback (line 35 branch)", function () {
      const stub = sinon.stub(os, "cpus").returns(null);
      try {
        const info = collectSystemInfo();
        assert.equal(info.cpuCount, 0);
      } finally {
        stub.restore();
      }
    });

    it('a resolved but empty-string timeZone hits the `|| "<unknown>"` fallback without throwing (line 44 branch)', function () {
      const origIntl = global.Intl;
      try {
        global.Intl = {
          DateTimeFormat() {
            return { resolvedOptions: () => ({ timeZone: "" }) };
          },
        };
        const info = collectSystemInfo();
        assert.equal(info.timezone, "<unknown>");
      } finally {
        global.Intl = origIntl;
      }
    });

    it("safe() helper: a throwing os.hostname() falls back to '<unknown>' (lines 78-82)", function () {
      const stub = sinon.stub(os, "hostname").throws(new Error("hostname boom"));
      try {
        const info = collectSystemInfo();
        assert.equal(info.hostname, "<unknown>");
      } finally {
        stub.restore();
      }
    });

    it("safe() helper: a throwing os.version() falls back to '<unknown>'", function () {
      const stub = sinon.stub(os, "version").throws(new Error("version boom"));
      try {
        const info = collectSystemInfo();
        assert.equal(info.osVersion, "<unknown>");
      } finally {
        stub.restore();
      }
    });

    it("safe() helper: a throwing process.cwd() falls back to '<unknown>'", function () {
      const origCwd = process.cwd;
      process.cwd = () => {
        throw new Error("cwd boom");
      };
      try {
        const info = collectSystemInfo();
        assert.equal(info.cwd, "<unknown>");
      } finally {
        process.cwd = origCwd;
      }
    });
  });

  // -------------------------------------------------------------------
  // envvars.ts
  // -------------------------------------------------------------------
  describe("envvars.ts", function () {
    it("a throwing /.dockerenv existsSync check is swallowed (lines 76-77)", function () {
      const stub = sinon.stub(fs, "existsSync").throws(new Error("existsSync boom"));
      try {
        const info = detectContainer();
        assert.deepEqual(info.signals, []);
      } finally {
        stub.restore();
      }
    });

    it("linux: a matching /proc/1/cgroup adds a signal (lines 82-86)", function () {
      const platformStub = sinon.stub(process, "platform").value("linux");
      const readStub = sinon
        .stub(fs, "readFileSync")
        .returns("1:name=systemd:/docker/abcabc123");
      try {
        const info = detectContainer();
        assert.ok(info.signals.includes("/proc/1/cgroup matches container runtime"));
      } finally {
        readStub.restore();
        platformStub.restore();
      }
    });

    it("linux: an unreadable /proc/1/cgroup is swallowed (lines 87-90)", function () {
      const platformStub = sinon.stub(process, "platform").value("linux");
      const readStub = sinon
        .stub(fs, "readFileSync")
        .throws(new Error("cgroup unreadable"));
      try {
        const info = detectContainer();
        assert.deepEqual(info.signals, []);
      } finally {
        readStub.restore();
        platformStub.restore();
      }
    });

    it("a truthy /.dockerenv existsSync check adds the signal (line 74 branch)", function () {
      const stub = sinon.stub(fs, "existsSync").callsFake((p) => p === "/.dockerenv");
      try {
        const info = detectContainer();
        assert.ok(info.signals.includes("/.dockerenv exists"));
      } finally {
        stub.restore();
      }
    });

    it("findReferencedEnvVars detects a circular object without hanging (line 47 branch)", function () {
      const circular = { a: "$FOO" };
      circular.self = circular;
      const refs = findReferencedEnvVars(circular);
      assert.deepEqual(Array.from(refs), ["FOO"]);
    });

    it("resolveDocExtensions reads the `extends` key, not just `name` (line 135 branch)", function () {
      const exts = resolveDocExtensions([{ extends: "html" }]);
      assert.deepEqual(Array.from(exts).sort(), ["htm", "html"]);
    });

    it("resolveDocExtensions: an unrecognized `name`/`extends` value contributes no extensions (line 135 `|| []` branch)", function () {
      // Pair a recognized entry (so the result isn't the "nothing matched at
      // all -> fall back to every known extension" empty-input case) with an
      // unrecognized `name` string, exercising the `DOC_EXTENSIONS_BY_TYPE[named]
      // || []` fallback specifically.
      const exts = resolveDocExtensions([
        { name: "html" },
        { name: "totally-unrecognized-type" },
      ]);
      assert.deepEqual(Array.from(exts).sort(), ["htm", "html"]);
    });

    it("enumerateInputFiles: a throwing realpathSync falls back to the raw path (lines 213-216)", function () {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-envvars-realpath-"));
      fs.writeFileSync(path.join(tmp, "a.txt"), "alpha");
      const stub = sinon.stub(fs, "realpathSync").throws(new Error("realpath boom"));
      try {
        const files = enumerateInputFiles([tmp], 100);
        assert.ok(files.some((f) => f.endsWith("a.txt")));
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("enumerateInputFiles: a throwing readdirSync skips the directory (lines 221-224)", function () {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-envvars-readdir-"));
      fs.writeFileSync(path.join(tmp, "a.txt"), "alpha");
      const stub = sinon.stub(fs, "readdirSync").throws(new Error("readdir boom"));
      try {
        const files = enumerateInputFiles([tmp], 100);
        assert.deepEqual(files, []);
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("enumerateInputFiles: a directory already visited (aliased by realpathSync) is skipped (line 217 branch)", function () {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-envvars-visited-"));
      const dirA = path.join(tmp, "dirA");
      const dirB = path.join(tmp, "dirB");
      fs.mkdirSync(dirA);
      fs.mkdirSync(dirB);
      fs.writeFileSync(path.join(dirA, "a.txt"), "alpha");
      fs.writeFileSync(path.join(dirB, "b.txt"), "beta");
      const original = fs.realpathSync;
      // Both dirA and dirB "resolve" (via a stubbed realpathSync) to the same
      // canonical directory, so the second is short-circuited by the
      // visitedDirs guard and its file is never seen.
      const stub = sinon.stub(fs, "realpathSync").callsFake((p) => {
        if (p === dirA || p === dirB) return dirA;
        return original(p);
      });
      try {
        const files = enumerateInputFiles([dirA, dirB], 100);
        // Exactly one of the two aliased directories is walked (the stack
        // processes them LIFO, so which one is implementation detail); the
        // key assertion is that the SECOND one visited is short-circuited
        // by the visitedDirs guard, so only one file total is found.
        assert.equal(files.length, 1);
        assert.ok(["a.txt", "b.txt"].includes(path.basename(files[0])));
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });

  // -------------------------------------------------------------------
  // tools.ts
  // -------------------------------------------------------------------
  describe("tools.ts", function () {
    it("runWithTimeout's settle() swallows a throwing child.kill() (lines 109-113)", async function () {
      this.timeout(10000);
      const stub = sinon
        .stub(ChildProcess.prototype, "kill")
        .throws(new Error("kill boom"));
      try {
        const result = await probeTool("node-quick", "node --version", {
          timeoutMs: 5000,
        });
        // kill() throwing must not prevent the result from resolving.
        assert.match(result.version, /^v\d+\./);
      } finally {
        stub.restore();
      }
    });

    it("probePython finds python3 and returns early (lines 151-155)", async function () {
      this.timeout(10000);
      // Real probeAllTools() call — on any dev/CI box with python3 (or a
      // python3 shim) installed this exercises the "python3 found" early
      // return. If neither python3 nor python resolves in this environment
      // the assertion is skipped rather than failing on an environmental gap.
      const results = await probeAllTools();
      const python = results.find((r) => r.name === "python");
      assert.ok(python, "probeAllTools always includes a python entry");
      if (python.version === "<not found>") {
        this.skip();
      }
      assert.doesNotMatch(python.version, /^<not found>$/);
    });

    it("a nonzero exit with an informative (non-noise) stderr message keeps the note (line 67/80 branches)", async function () {
      this.timeout(10000);
      const result = await probeTool(
        "custom-fail",
        `node -e "console.error('custom failure message'); process.exit(2);"`,
        { timeoutMs: 3000 }
      );
      assert.equal(result.version, "<not found>");
      assert.equal(result.notes, "custom failure message");
    });

    it("a nonzero exit with nothing on stdout or stderr falls back to an empty first line (line 67 branch)", async function () {
      this.timeout(10000);
      const result = await probeTool(
        "silent-fail",
        `node -e "process.exit(3);"`,
        { timeoutMs: 3000 }
      );
      assert.equal(result.version, "<not found>");
      assert.equal(result.notes, undefined);
    });

    it("a successful exit with whitespace-only stdout falls back to stderr (line 86 branch)", async function () {
      this.timeout(10000);
      const result = await probeTool(
        "stderr-version",
        `node -e "process.stdout.write(' \\n'); console.error('v9.9.9'); process.exit(0);"`,
        { timeoutMs: 3000 }
      );
      assert.equal(result.version, "v9.9.9");
    });

    it("a successful exit with no output on either stream falls back to '<unknown>' (line 87 branch)", async function () {
      this.timeout(10000);
      const result = await probeTool(
        "empty-success",
        `node -e "process.exit(0);"`,
        { timeoutMs: 3000 }
      );
      assert.equal(result.version, "<unknown>");
    });
  });

  // -------------------------------------------------------------------
  // index.ts
  // -------------------------------------------------------------------
  describe("index.ts", function () {
    it("resolveLoadedFrom's package.json walk throwing falls back to '<unknown>' (lines 288-290)", async function () {
      this.timeout(60000);
      // Scope the throw to the bare `package.json` existsSync probe that
      // resolveLoadedFrom performs, so other collectors' existsSync calls
      // (cache dirs, node_modules dirs, etc.) are unaffected.
      const original = fs.existsSync;
      const stub = sinon.stub(fs, "existsSync").callsFake((p) => {
        if (typeof p === "string" && p.endsWith(path.join("package.json"))) {
          throw new Error("existsSync boom (package.json probe)");
        }
        return original(p);
      });
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" } },
          configPath: null,
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        assert.match(text, /loadedFrom\s+<unknown>/);
        // getVersionData() (src/utils.ts) is unaffected — it never calls
        // existsSync on a bare "package.json" path (it uses `require`).
        assert.doesNotMatch(text, /doc-detective\s+<unknown>/);
      } finally {
        stub.restore();
      }
    });

    it("dependencies loop assigns String(dep) when dep has no .version (lines 243-245) and the lockstep condition never fires for the real getVersionData() shape", async function () {
      this.timeout(60000);
      // getVersionData() (src/utils.ts) only ever populates dependency
      // entries with {installed, expected, status[, error]} — never
      // `.version`. Point cwd at a scratch dir with a synthetic
      // doc-detective-* package so the node_modules scan finds something
      // real and exercises the assignment loop through the genuine
      // collector (no stubbing of getVersionData's named-import binding).
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-getversiondata-"));
      const depDir = path.join(tmp, "node_modules", "doc-detective-fixture-dep");
      fs.mkdirSync(depDir, { recursive: true });
      fs.writeFileSync(
        path.join(depDir, "package.json"),
        JSON.stringify({ name: "doc-detective-fixture-dep", version: "9.9.9" })
      );
      const prevCwd = process.cwd();
      process.chdir(tmp);
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" } },
          configPath: null,
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        // dep?.version is always undefined for the real shape, so the code
        // falls back to `dep` itself -> String(dep) -> "[object Object]".
        assert.match(text, /doc-detective-fixture-dep\s+\[object Object\]/);
        // And the lockstep-warning line never renders, confirming the
        // condition is structurally unreachable through the real collector.
        assert.doesNotMatch(text, /ship in lockstep/);
      } finally {
        process.chdir(prevCwd);
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("getVersionData()'s own internal error degrades to the <unknown>/{} fallbacks, not index.ts's outer catch (lines 235-238 branches)", async function () {
      this.timeout(60000);
      // getVersionData() (src/utils.ts) wraps its entire body in a try/catch
      // that returns `{error}` instead of throwing — so `versionData?.main`,
      // `.context`, `.dependencies` are all undefined on failure, and
      // collectDocDetective's `|| {}` / `|| "<unknown>"` fallbacks fire
      // (this is NOT the same as index.ts's own unreachable outer catch at
      // lines 227-234, which requires getVersionData to throw — it never
      // does). Force the internal failure by making the node_modules
      // existsSync probe report true, then readdirSync throw.
      const nodeModulesPath = path.resolve(process.cwd(), "node_modules");
      const originalExists = fs.existsSync;
      const originalReaddir = fs.readdirSync;
      const existsStub = sinon.stub(fs, "existsSync").callsFake((p) => {
        if (p === nodeModulesPath) return true;
        return originalExists(p);
      });
      const readdirStub = sinon.stub(fs, "readdirSync").callsFake((p, ...rest) => {
        if (p === nodeModulesPath) throw new Error("readdirSync boom (node_modules)");
        return originalReaddir(p, ...rest);
      });
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" } },
          configPath: null,
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        assert.match(text, /doc-detective\s+<unknown>/);
        assert.match(text, /executionMethod\s+<unset>/);
      } finally {
        existsStub.restore();
        readdirStub.restore();
      }
    });

    it("entryPoint falls back to '<unknown>' when process.argv[1] is empty (line 275 branch)", async function () {
      this.timeout(60000);
      const originalArgv1 = process.argv[1];
      process.argv[1] = "";
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" } },
          configPath: null,
          print: (line) => out.push(line),
        });
        assert.match(out.join("\n"), /entryPoint\s+<unknown>/);
      } finally {
        process.argv[1] = originalArgv1;
      }
    });

    it("resolveLoadedFrom's ancestor walk exhausts without ever finding a package.json (line 285 branch)", async function () {
      this.timeout(60000);
      // existsSync always false (no throw) -> the walk runs to its bound
      // (filesystem root or the 8-iteration cap) without ever taking the
      // "found it" break, landing loadedFrom on its "<unknown>" default —
      // a different code path than the existsSync-throws test above.
      const stub = sinon.stub(fs, "existsSync").returns(false);
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" } },
          configPath: null,
          print: (line) => out.push(line),
        });
        assert.match(out.join("\n"), /loadedFrom\s+<unknown>/);
      } finally {
        stub.restore();
      }
    });

    it("a nullish config falls back to {} in safeRedactConfig (line 399 branch)", async function () {
      this.timeout(60000);
      const out = [];
      await printDebug({
        config: undefined,
        configPath: null,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      const configSectionStart = text.indexOf("Effective config (post-validation):");
      assert.match(text.slice(configSectionStart), /\{\s*\}/);
    });

    it("safeRedactConfig's catch falls back to String(err) for a non-Error throw (line 401 branch)", async function () {
      this.timeout(60000);
      const evilConfig = { input: "." };
      Object.defineProperty(evilConfig, "poison", {
        enumerable: true,
        get() {
          // eslint-disable-next-line no-throw-literal
          throw "plain string from config getter"; // non-Error
        },
      });
      const out = [];
      await printDebug({
        config: evilConfig,
        configPath: null,
        print: (line) => out.push(line),
      });
      assert.match(out.join("\n"), /could not process config: plain string from config getter/);
    });

    it("the saved-JSON stringify catch falls back to String(err) for a non-Error throw (line 429 branch)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-nonerror-stringify-"));
      try {
        const evilConfig = {
          input: ".",
          environment: { platform: "linux" },
          get poisonToJSON() {
            return {
              toJSON() {
                // eslint-disable-next-line no-throw-literal
                throw "plain string from toJSON"; // non-Error
              },
            };
          },
        };
        const out = [];
        await printDebug({
          config: evilConfig,
          configPath: null,
          outDir: tmp,
          print: (line) => out.push(line),
        });
        const jsonFiles = fs.readdirSync(tmp).filter((f) => f.endsWith(".json"));
        assert.equal(jsonFiles.length, 1);
        const saved = fs.readFileSync(path.join(tmp, jsonFiles[0]), "utf8");
        const parsed = JSON.parse(saved);
        assert.equal(parsed.error, "failed to serialize debug data: plain string from toJSON");
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("writeFileSafe's catch falls back to String(err) for a non-Error throw (line 462 branch)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-nonerror-writefail-"));
      const stub = sinon.stub(fs, "mkdirSync").callsFake(() => {
        // eslint-disable-next-line no-throw-literal
        throw "plain string from mkdirSync"; // non-Error
      });
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" } },
          configPath: null,
          outDir: path.join(tmp, "sub"),
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        assert.match(text, /failed to save .*: plain string from mkdirSync/);
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("renderProvenanceSection reports DOC_DETECTIVE_API as applied when set (line 621 branch)", async function () {
      this.timeout(60000);
      const prev = process.env.DOC_DETECTIVE_API;
      process.env.DOC_DETECTIVE_API = "https://example.test/api";
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" } },
          configPath: null,
          print: (line) => out.push(line),
        });
        assert.match(out.join("\n"), /DOC_DETECTIVE_API:\s+applied/);
      } finally {
        if (prev === undefined) delete process.env.DOC_DETECTIVE_API;
        else process.env.DOC_DETECTIVE_API = prev;
      }
    });

    it("renderConfigSection's stringify catch falls back to String(err) for a non-Error throw (line 806 branch)", async function () {
      this.timeout(60000);
      const evilConfig = {
        input: ".",
        environment: { platform: "linux" },
        weird: {
          toJSON() {
            // eslint-disable-next-line no-throw-literal
            throw "plain string from toJSON"; // non-Error
          },
        },
      };
      const out = [];
      await printDebug({
        config: evilConfig,
        configPath: null,
        print: (line) => out.push(line),
      });
      assert.match(out.join("\n"), /could not stringify config: plain string from toJSON/);
    });

    it("a bad cacheDir surfaces the Install status error banner (lines 531-535)", async function () {
      this.timeout(60000);
      const out = [];
      await printDebug({
        config: { input: ".", environment: { platform: "linux" }, cacheDir: BAD_CACHE_DIR },
        configPath: null,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      assert.match(text, /<install status failed: .*shell-metacharacter/);
    });

    it("a bad cacheDir produces a real Chrome-unavailable finding, rendered with its fix line (lines 495-504)", async function () {
      this.timeout(60000);
      // Pin APPIUM_HOME to an empty scratch dir (no extensions.yaml) so the
      // chromeUnavailable finding's suppression condition
      // (driver.registered === true) can't accidentally be satisfied by
      // whatever this host's real Appium install happens to have
      // registered — the finding must fire purely because Chrome's browser
      // binary/driver aren't in installed.json (real, unmodified
      // collectBrowsers/collectInstallStatus output), independent of the
      // Appium registration state.
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-chrome-finding-"));
      const prevHome = process.env.APPIUM_HOME;
      process.env.APPIUM_HOME = tmp;
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" }, cacheDir: BAD_CACHE_DIR },
          configPath: null,
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        assert.match(text, /\[ERROR\] Chrome is not available/);
        assert.match(text, /fix: doc-detective install runtime/);
      } finally {
        if (prevHome === undefined) delete process.env.APPIUM_HOME;
        else process.env.APPIUM_HOME = prevHome;
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("an unreadable extensions.yaml renders the Appium manifestError line and 'manifest unreadable' driver classification (lines 561-563, 570-578)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-manifest-err-"));
      const manifestDir = path.join(tmp, "node_modules", ".cache", "appium");
      fs.mkdirSync(manifestDir, { recursive: true });
      fs.writeFileSync(
        path.join(manifestDir, "extensions.yaml"),
        "drivers:\n  bad: [unterminated"
      );
      const prevHome = process.env.APPIUM_HOME;
      process.env.APPIUM_HOME = tmp;
      try {
        const out = [];
        await printDebug({
          config: {
            input: ".",
            environment: { platform: "linux" },
            cacheDir: BAD_CACHE_DIR,
          },
          configPath: null,
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        assert.match(text, /! could not read extensions\.yaml:/);
        assert.match(text, /resolvable \(registration unknown — manifest unreadable\)/);
      } finally {
        if (prevHome === undefined) delete process.env.APPIUM_HOME;
        else process.env.APPIUM_HOME = prevHome;
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("an unset APPIUM_HOME renders '<unset>' and no manifest path (lines 554, 559 branches)", async function () {
      this.timeout(60000);
      const prevHome = process.env.APPIUM_HOME;
      delete process.env.APPIUM_HOME;
      try {
        const out = [];
        await printDebug({
          // BAD_CACHE_DIR makes the appium collector's own setAppiumHome()
          // call throw internally (swallowed), so APPIUM_HOME stays unset
          // rather than being resolved to this repo's real Appium install.
          config: { input: ".", environment: { platform: "linux" }, cacheDir: BAD_CACHE_DIR },
          configPath: null,
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        assert.match(text, /APPIUM_HOME:\s+<unset>/);
        assert.match(text, /extensions\.yaml:\s+absent\s*\n/);
      } finally {
        if (prevHome === undefined) delete process.env.APPIUM_HOME;
        else process.env.APPIUM_HOME = prevHome;
      }
    });

    it("a valid manifest missing a driver entry renders 'resolvable but not registered' (line 578 branch)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-appium-partial-"));
      const manifestDir = path.join(tmp, "node_modules", ".cache", "appium");
      fs.mkdirSync(manifestDir, { recursive: true });
      fs.writeFileSync(
        path.join(manifestDir, "extensions.yaml"),
        "drivers:\n  someOtherDriver:\n    pkgName: some-other-driver\n"
      );
      const prevHome = process.env.APPIUM_HOME;
      process.env.APPIUM_HOME = tmp;
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" }, cacheDir: BAD_CACHE_DIR },
          configPath: null,
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        assert.match(text, /appium-chromium-driver\s+resolvable but not registered/);
        assert.match(text, /appium-geckodriver\s+resolvable but not registered/);
      } finally {
        if (prevHome === undefined) delete process.env.APPIUM_HOME;
        else process.env.APPIUM_HOME = prevHome;
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("an unreadable/binary input file is skipped without aborting the env scan (lines 377-379)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-unreadable-doc-"));
      const docFile = path.join(tmp, "doc.md");
      fs.writeFileSync(docFile, "See $SOME_VAR here.");
      const original = fs.readFileSync;
      const stub = sinon.stub(fs, "readFileSync").callsFake((p, ...rest) => {
        if (p === docFile) throw new Error("simulated unreadable/binary file");
        return original(p, ...rest);
      });
      try {
        const out = [];
        await printDebug({
          config: { input: [tmp], environment: { platform: "linux" } },
          configPath: null,
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        assert.match(text, /Scanned 1 documentation file/);
        assert.match(text, /<no \$VAR references found>/);
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("a throwing config property makes safeRedactConfig fall back to the error marker (lines 393-402)", async function () {
      this.timeout(60000);
      const evilConfig = { input: ".", environment: { platform: "linux" } };
      Object.defineProperty(evilConfig, "poison", {
        enumerable: true,
        get() {
          throw new Error("boom from config getter");
        },
      });
      const out = [];
      await printDebug({
        config: evilConfig,
        configPath: null,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      assert.match(text, /could not process config: boom from config getter/);
    });

    it("an unstringifiable full DebugData falls back to the error-JSON marker in the saved .json file (lines 425-431)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-bigint-outdir-"));
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" }, weird: 10n },
          configPath: null,
          outDir: tmp,
          print: (line) => out.push(line),
        });
        const jsonFiles = fs.readdirSync(tmp).filter((f) => f.endsWith(".json"));
        assert.equal(jsonFiles.length, 1);
        const saved = fs.readFileSync(path.join(tmp, jsonFiles[0]), "utf8");
        const parsed = JSON.parse(saved);
        assert.match(parsed.error, /failed to serialize debug data/);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("a throwing chmodSync on the output dir is swallowed; the dump still saves (lines 454-458)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-chmod-fail-"));
      const stub = sinon.stub(fs, "chmodSync").throws(new Error("chmod boom"));
      try {
        const out = [];
        await printDebug({
          config: { input: ".", environment: { platform: "linux" } },
          configPath: null,
          outDir: tmp,
          print: (line) => out.push(line),
        });
        const text = out.join("\n");
        assert.match(text, /Diagnostic dump saved to/);
        assert.match(text, /Diagnostic JSON saved to/);
        assert.doesNotMatch(text, /failed to save/);
      } finally {
        stub.restore();
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("a bad cacheDir flags detectionFailed in the Browsers section (lines 703-708 detectionFailed branch)", async function () {
      this.timeout(60000);
      const out = [];
      await printDebug({
        config: { input: ".", environment: { platform: "linux" }, cacheDir: BAD_CACHE_DIR },
        configPath: null,
        print: (line) => out.push(line),
      });
      const text = out.join("\n");
      assert.match(
        text,
        /browser detection hit an error; component status may be incomplete/
      );
    });
  });

  // -------------------------------------------------------------------
  // command.ts
  // -------------------------------------------------------------------
  //
  // debug.test.js's "debug CLI smoke test" suite already exercises
  // `debugCommand.handler` end-to-end, but only via `spawnSync` on a
  // separate `bin/doc-detective.js` child process — c8/V8 coverage isn't
  // propagated across that process boundary (no NODE_V8_COVERAGE wiring
  // in this repo's test setup), so the handler's own statements/branches
  // show as uncovered despite being exercised by a real, working smoke
  // test. Calling `debugCommand.handler(...)` directly, in-process,
  // exercises the identical code with full coverage visibility.
  describe("command.ts", function () {
    async function runHandler(cwd, args) {
      const prevCwd = process.cwd();
      const prevExitCode = process.exitCode;
      process.chdir(cwd);
      const lines = [];
      const originalLog = console.log;
      // setConfig logs AJV strict-mode warnings to console; capture printDebug's
      // own console.log output (the handler's default print sink) alongside it.
      console.log = (line) => {
        lines.push(String(line));
      };
      try {
        await debugCommand.handler(args);
        return { text: lines.join("\n"), exitCode: process.exitCode };
      } finally {
        console.log = originalLog;
        process.chdir(prevCwd);
        process.exitCode = prevExitCode;
      }
    }

    it("an explicit --config wins over auto-discovery (hasExplicitConfig branch, line 43)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cmd-explicit-"));
      const cfgPath = path.join(tmp, "my-config.json");
      fs.writeFileSync(cfgPath, "{}");
      try {
        const { text, exitCode } = await runHandler(tmp, {
          config: cfgPath,
          "include-env": false,
          _: [],
          $0: "doc-detective",
        });
        assert.match(text, /configPath:\s+\S*my-config\.json/);
        assert.notEqual(exitCode, 1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("auto-discovers .doc-detective.json when present (line 46 branch)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cmd-autojson-"));
      fs.writeFileSync(path.join(tmp, ".doc-detective.json"), "{}");
      try {
        const { text } = await runHandler(tmp, {
          "include-env": false,
          _: [],
          $0: "doc-detective",
        });
        assert.match(text, /configPath:\s+\S*\.doc-detective\.json/);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("auto-discovers .doc-detective.yaml when no .json is present (line 48 branch)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cmd-autoyaml-"));
      fs.writeFileSync(path.join(tmp, ".doc-detective.yaml"), "{}\n");
      try {
        const { text } = await runHandler(tmp, {
          "include-env": false,
          _: [],
          $0: "doc-detective",
        });
        assert.match(text, /configPath:\s+\S*\.doc-detective\.yaml/);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("auto-discovers .doc-detective.yml when neither .json nor .yaml is present (line 50 branch)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cmd-autoyml-"));
      fs.writeFileSync(path.join(tmp, ".doc-detective.yml"), "{}\n");
      try {
        const { text } = await runHandler(tmp, {
          "include-env": false,
          _: [],
          $0: "doc-detective",
        });
        assert.match(text, /configPath:\s+\S*\.doc-detective\.yml/);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("falls back to configPath: null (<none>) when no config file exists anywhere (line 52 branch)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cmd-noconfig-"));
      try {
        const { text } = await runHandler(tmp, {
          "include-env": false,
          _: [],
          $0: "doc-detective",
        });
        assert.match(text, /configPath:\s+<none>/);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("tolerates includeEnv via camelCase argv when the kebab form is absent (line 55 branch)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cmd-camel-"));
      try {
        const { text } = await runHandler(tmp, {
          includeEnv: true,
          _: [],
          $0: "doc-detective",
        });
        assert.match(text, /-- Environment variables \(full\) /);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("a valid config runs setConfig successfully and prints the full dump (lines 57-59, 67-80 success path)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cmd-success-"));
      try {
        const { text, exitCode } = await runHandler(tmp, {
          "include-env": false,
          _: [],
          $0: "doc-detective",
        });
        assert.match(text, /Doc Detective diagnostic dump/);
        assert.match(text, /-- System /);
        assert.doesNotMatch(text, /CONFIG INVALID/);
        assert.notEqual(exitCode, 1);
        const savedDir = path.join(tmp, ".doc-detective");
        const saved = fs.readdirSync(savedDir);
        assert.ok(saved.some((f) => /^debug-.+\.txt$/.test(f)));
        assert.ok(saved.some((f) => /^debug-.+\.json$/.test(f)));
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("a malformed config file surfaces the CONFIG INVALID banner and sets exitCode=1 (lines 60-79 error path)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cmd-badconfig-"));
      const badConfigPath = path.join(tmp, "bad-config.json");
      fs.writeFileSync(badConfigPath, "{ not valid json");
      try {
        const { text, exitCode } = await runHandler(tmp, {
          config: badConfigPath,
          "include-env": false,
          logLevel: "debug",
          input: "custom-input",
          _: [],
          $0: "doc-detective",
        });
        assert.match(text, /=== CONFIG INVALID ===/);
        // The best-effort raw config uses args.logLevel / args.input verbatim.
        assert.match(text, /"logLevel":\s*"debug"/);
        assert.match(text, /"input":\s*"custom-input"/);
        assert.equal(exitCode, 1);
        const savedDir = path.join(tmp, ".doc-detective");
        const saved = fs.readdirSync(savedDir);
        assert.ok(saved.some((f) => /^debug-.+\.txt$/.test(f)));
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });

    it("a malformed config file with non-string logLevel/input falls back to defaults (lines 65-67 branches)", async function () {
      this.timeout(60000);
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cmd-badconfig-defaults-"));
      const badConfigPath = path.join(tmp, "bad-config.json");
      fs.writeFileSync(badConfigPath, "{ not valid json");
      try {
        const { text, exitCode } = await runHandler(tmp, {
          config: badConfigPath,
          "include-env": false,
          // logLevel/input intentionally omitted (non-string / absent).
          _: [],
          $0: "doc-detective",
        });
        assert.match(text, /=== CONFIG INVALID ===/);
        assert.match(text, /"logLevel":\s*"info"/);
        assert.match(text, /"input":\s*"\."/);
        assert.equal(exitCode, 1);
      } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
      }
    });
  });
});
