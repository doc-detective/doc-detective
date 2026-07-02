// Hermetic offline coverage for the remaining src/debug/* gaps, per ADR
// 01017 (adrs/01017-honest-100-percent-coverage-policy.md): test what's
// reachable from Node; annotate what genuinely isn't. Extends test/debug.test.js
// and test/debug-findstrategies-coverage.test.js, does not duplicate them.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sinon from "sinon";

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

describe("debug/provenance", function () {
  let collectCliOverrides, collectProvenance;
  before(async function () {
    ({ collectCliOverrides, collectProvenance } = await import(
      "../dist/debug/provenance.js"
    ));
  });

  it("collectCliOverrides degrades a spec whose present() check throws", function () {
    // Every OVERRIDE_SPECS.present(args) reads a property off `args`; a
    // Proxy that throws on any property access exercises the per-spec
    // try/catch without needing a specific malformed shape.
    const throwing = new Proxy(
      {},
      {
        get() {
          throw new Error("boom");
        },
      }
    );
    assert.deepEqual(collectCliOverrides(throwing), []);
  });

  it("collectProvenance defaults env to process.env when opts.env is omitted", function () {
    const p = collectProvenance({ args: {} });
    assert.equal(typeof p.docDetectiveConfigApplied, "boolean");
  });
});

describe("debug/findings", function () {
  let computeFindings;
  before(async function () {
    ({ computeFindings } = await import("../dist/debug/findings.js"));
  });

  it("skips a rule whose evaluation throws on malformed data", function () {
    const data = {};
    Object.defineProperty(data, "browsers", {
      get() {
        throw new Error("boom");
      },
    });
    Object.defineProperty(data, "install", {
      get() {
        throw new Error("boom");
      },
    });
    Object.defineProperty(data, "cache", {
      get() {
        throw new Error("boom");
      },
    });
    Object.defineProperty(data, "network", {
      get() {
        throw new Error("boom");
      },
    });
    Object.defineProperty(data, "appium", {
      get() {
        throw new Error("boom");
      },
    });
    Object.defineProperty(data, "docDetective", {
      get() {
        throw new Error("boom");
      },
    });
    const findings = computeFindings(data);
    assert.ok(Array.isArray(findings));
    assert.equal(findings.length, 0);
  });
});

describe("debug/system", function () {
  let collectSystemInfo;
  before(async function () {
    ({ collectSystemInfo } = await import("../dist/debug/system.js"));
  });
  afterEach(function () {
    sinon.restore();
  });

  it("degrades cpuCount to 0 when os.cpus() throws", function () {
    sinon.stub(os, "cpus").throws(new Error("boom"));
    const info = collectSystemInfo();
    assert.equal(info.cpuCount, 0);
    assert.equal(info.cpuModel, "<unknown>");
  });

  it("degrades timezone to <unknown> when Intl.DateTimeFormat throws", function () {
    const orig = Intl.DateTimeFormat;
    Intl.DateTimeFormat = function () {
      throw new Error("boom");
    };
    try {
      const info = collectSystemInfo();
      assert.equal(info.timezone, "<unknown>");
    } finally {
      Intl.DateTimeFormat = orig;
    }
  });

  it("degrades hostname/osVersion/cwd to <unknown> via the safe() wrapper", function () {
    sinon.stub(os, "hostname").throws(new Error("boom"));
    sinon.stub(os, "version").throws(new Error("boom"));
    const info = collectSystemInfo();
    assert.equal(info.hostname, "<unknown>");
    assert.equal(info.osVersion, "<unknown>");
  });
});

describe("debug/appium (collectAppiumDiagnostics)", function () {
  let collectAppiumDiagnostics, registeredDriverPkgNames;
  before(async function () {
    ({ collectAppiumDiagnostics, registeredDriverPkgNames } = await import(
      "../dist/debug/appium.js"
    ));
  });
  afterEach(function () {
    sinon.restore();
  });

  it("swallows a setAppiumHome failure and still returns diagnostics (best-effort)", function () {
    // A cacheDir containing a shell metacharacter makes getRuntimeDir() ->
    // getCacheDir() -> assertSafeRuntimePath() throw inside setAppiumHome();
    // that inner try/catch is best-effort, so the function must still
    // return a full diagnostics object rather than propagating.
    const result = collectAppiumDiagnostics({ cacheDir: "bad;dir" });
    assert.equal(typeof result, "object");
    assert.ok(Array.isArray(result.drivers));
  });

  it("degrades extensionsManifestPresent to false when fs.existsSync throws", function () {
    sinon.stub(fs, "existsSync").throws(new Error("boom"));
    const result = collectAppiumDiagnostics({});
    assert.equal(result.extensionsManifestPresent, false);
  });

  it("sets manifestError when the manifest exists but fails to parse", function () {
    sinon.stub(fs, "existsSync").returns(true);
    sinon.stub(fs, "readFileSync").returns("::: not: valid: yaml: [[[");
    const result = collectAppiumDiagnostics({});
    assert.equal(typeof result.manifestError, "string");
    assert.deepEqual(result.registeredDrivers, []);
  });

  it("registeredDriverPkgNames falls back to the driver key when pkgName is missing", function () {
    const names = registeredDriverPkgNames(
      "drivers:\n  chromium:\n    pkgName: appium-chromium-driver\n  geckodriver-no-pkg: {}\n"
    );
    assert.deepEqual(names.sort(), ["appium-chromium-driver", "geckodriver-no-pkg"]);
  });

  it("registeredDriverPkgNames returns [] when the document has no drivers section", function () {
    assert.deepEqual(registeredDriverPkgNames("foo: bar"), []);
  });
});

describe("debug/install (collectInstallStatus)", function () {
  let collectInstallStatus;
  before(async function () {
    ({ collectInstallStatus } = await import("../dist/debug/install.js"));
  });

  it("returns an error marker when the cache dir is unsafe", function () {
    const result = collectInstallStatus({ cacheDir: "bad;dir" });
    assert.equal(typeof result.error, "string");
    assert.equal(result.rows, undefined);
  });
});

describe("debug/cache (collectCacheStatus)", function () {
  let collectCacheStatus;
  before(async function () {
    ({ collectCacheStatus } = await import("../dist/debug/cache.js"));
  });
  afterEach(function () {
    sinon.restore();
  });

  it("returns a top-level error when getCacheDir itself throws (unsafe cacheDir)", function () {
    const result = collectCacheStatus({ cacheDir: "bad;dir" });
    assert.equal(typeof result.error, "string");
  });

  it("degrades exists=false when fs.existsSync throws (safeExists catch)", function () {
    const dir = tmpDir("dd-cache-");
    try {
      sinon.stub(fs, "existsSync").throws(new Error("EACCES"));
      const result = collectCacheStatus({ cacheDir: dir });
      assert.ok(result.entries.every((e) => e.exists === false));
    } finally {
      sinon.restore();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("marks a probe not-writable when fs.accessSync throws", function () {
    const dir = tmpDir("dd-cache-");
    try {
      sinon.stub(fs, "accessSync").throws(new Error("EACCES"));
      const result = collectCacheStatus({ cacheDir: dir });
      assert.ok(result.entries.every((e) => e.writable === false || e.writable === null));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports freeBytes null when statfsSync is unavailable or malformed", function () {
    const dir = tmpDir("dd-cache-");
    try {
      const origStatfs = fs.statfsSync;
      // Simulate an older Node without statfsSync.
      // eslint-disable-next-line no-param-reassign
      fs.statfsSync = undefined;
      const result = collectCacheStatus({ cacheDir: dir });
      assert.ok(result.entries.every((e) => e.freeBytes === null));
      fs.statfsSync = origStatfs;

      // Simulate a malformed stats shape.
      sinon.stub(fs, "statfsSync").returns({});
      const result2 = collectCacheStatus({ cacheDir: dir });
      assert.ok(result2.entries.every((e) => e.freeBytes === null));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("reports freeBytes null when statfsSync throws", function () {
    const dir = tmpDir("dd-cache-");
    try {
      sinon.stub(fs, "statfsSync").throws(new Error("boom"));
      const result = collectCacheStatus({ cacheDir: dir });
      assert.ok(result.entries.every((e) => e.freeBytes === null));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("debug/envvars", function () {
  let findReferencedEnvVars, detectContainer, resolveDocExtensions, enumerateInputFiles;
  before(async function () {
    ({ findReferencedEnvVars, detectContainer, resolveDocExtensions, enumerateInputFiles } =
      await import("../dist/debug/envvars.js"));
  });
  afterEach(function () {
    sinon.restore();
  });

  it("swallows a /.dockerenv existsSync failure (non-fatal probe)", function () {
    sinon.stub(fs, "existsSync").throws(new Error("boom"));
    const info = detectContainer();
    assert.equal(typeof info.inContainer, "boolean");
  });

  it("adds a signal when /proc/1/cgroup matches a container runtime (linux only)", function () {
    sinon.stub(process, "platform").value("linux");
    sinon.stub(fs, "readFileSync").returns("12:pids:/docker/abcd1234");
    const info = detectContainer();
    assert.ok(info.signals.some((s) => s.includes("cgroup")));
    assert.equal(info.inContainer, true);
  });

  it("swallows a /proc/1/cgroup read failure on linux (non-fatal probe)", function () {
    sinon.stub(process, "platform").value("linux");
    sinon.stub(fs, "readFileSync").throws(new Error("ENOENT"));
    const info = detectContainer();
    assert.equal(typeof info.inContainer, "boolean");
  });

  it("resolveDocExtensions ignores unknown file-type names and object entries without extensions", function () {
    const exts = resolveDocExtensions([{ notAKnownKey: true }, "totally-unknown-type"]);
    // Falls back to the union of all known extensions when nothing matched.
    assert.ok(exts.has("md"));
  });

  it("enumerateInputFiles skips a directory whose realpathSync throws (falls back to the raw path)", function () {
    const dir = tmpDir("dd-enum-");
    try {
      fs.writeFileSync(path.join(dir, "a.md"), "hello");
      sinon.stub(fs, "realpathSync").throws(new Error("boom"));
      const files = enumerateInputFiles([dir], 10);
      assert.ok(files.some((f) => f.endsWith("a.md")));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("enumerateInputFiles skips a directory whose readdirSync throws", function () {
    const dir = tmpDir("dd-enum-");
    try {
      sinon.stub(fs, "readdirSync").throws(new Error("EACCES"));
      const files = enumerateInputFiles([dir], 10);
      assert.deepEqual(files, []);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("debug/redact — extra branches", function () {
  let redactArg;
  before(async function () {
    ({ redactArg } = await import("../dist/debug/redact.js"));
  });
  it("passes through non-string / empty-string args unchanged", function () {
    assert.equal(redactArg(""), "");
    assert.equal(redactArg(123), 123);
    assert.equal(redactArg(null), null);
  });
});

describe("debug/render — extra branches", function () {
  let renderKeyValues;
  before(async function () {
    ({ renderKeyValues } = await import("../dist/debug/render.js"));
  });
  it("formats a plain string value verbatim and an object value as JSON", function () {
    const lines = renderKeyValues([
      ["a", "plain string"],
      ["b", { x: 1 }],
    ]);
    assert.match(lines[0], /plain string$/);
    assert.match(lines[1], /\{"x":1\}$/);
  });
});

describe("debug/tools", function () {
  let envWithoutNodeModulesBin, probeTool, probeAllTools;
  before(async function () {
    ({ envWithoutNodeModulesBin, probeTool, probeAllTools } = await import(
      "../dist/debug/tools.js"
    ));
  });
  afterEach(function () {
    sinon.restore();
  });

  it("envWithoutNodeModulesBin strips node_modules/.bin segments from PATH", function () {
    const origPath = process.env.PATH;
    process.env.PATH = ["/usr/bin", "/repo/node_modules/.bin", "/usr/local/bin"].join(
      path.delimiter
    );
    try {
      const env = envWithoutNodeModulesBin();
      assert.ok(!env.PATH.includes("node_modules"));
    } finally {
      process.env.PATH = origPath;
    }
  });

  it("probeTool reports <not found> for a genuinely nonexistent binary", async function () {
    // Real (offline, no network) spawn of a command that cannot resolve on
    // any platform's PATH -- the shell's own "not recognized"/"not found"
    // message exercises the exitCode!==0 + notFoundNoise-suppressed branch.
    this.timeout(10000);
    const result = await probeTool(
      "nonexistent",
      "doc-detective-nonexistent-binary-xyz123 --version"
    );
    assert.equal(result.name, "nonexistent");
    assert.equal(result.version, "<not found>");
    assert.equal(result.notes, undefined);
  });

  it("probeTool times out and reports the configured timeout", async function () {
    // A real long-running command (node's own REPL with no input, or a sleep
    // equivalent) bounded by a very small timeoutMs -- exercises the
    // timedOut branch without depending on a specific missing/present binary.
    this.timeout(5000);
    const sleepCmd =
      process.platform === "win32"
        ? "ping -n 5 127.0.0.1 >NUL"
        : "sleep 5";
    const result = await probeTool("slow", sleepCmd, { timeoutMs: 50 });
    assert.match(result.version, /^<timed out after 50ms>$/);
  });

  it("probeAllTools resolves every probe concurrently and returns 9 rows", async function () {
    // Real spawn-based probes against real (or absent) system binaries —
    // deterministic in shape (9 named tools), not in exact version strings.
    this.timeout(15000);
    const results = await probeAllTools();
    assert.equal(results.length, 9);
    assert.ok(results.every((r) => typeof r.name === "string"));
  });
});

describe("debug/command (debugCommand.handler CONFIG INVALID path)", function () {
  let debugCommand;
  before(async function () {
    ({ debugCommand } = await import("../dist/debug/command.js"));
  });

  it("emits a CONFIG INVALID dump and sets exitCode=1 on a broken config", async function () {
    this.timeout(15000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-debugcmd-"));
    const badConfigPath = path.join(dir, "bad.json");
    fs.writeFileSync(badConfigPath, "{ not valid json", "utf8");
    const origCwd = process.cwd();
    const origExitCode = process.exitCode;
    process.chdir(dir);
    try {
      await debugCommand.handler({ config: badConfigPath, "include-env": false });
      assert.equal(process.exitCode, 1);
    } finally {
      process.chdir(origCwd);
      process.exitCode = origExitCode;
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("debug/index (printDebug integration)", function () {
  let printDebug;
  before(async function () {
    ({ printDebug } = await import("../dist/debug/index.js"));
  });

  it("propagates a bad cacheDir into the Install status and Cache sections' error branches", async function () {
    this.timeout(15000);
    const lines = [];
    await printDebug({
      config: { logLevel: "silent", input: ".", cacheDir: "bad;dir" },
      configPath: null,
      configError: null,
      includeEnv: false,
      print: (line) => lines.push(line),
    });
    const doc = lines.join("\n");
    assert.match(doc, /Install status/);
    assert.match(doc, /install status failed/);
  });

  it("swallows a write failure (writeFileSafe catch) when outDir is not a directory", async function () {
    this.timeout(15000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-printdebug-"));
    const notADir = path.join(dir, "im-a-file");
    fs.writeFileSync(notADir, "x");
    const lines = [];
    try {
      await printDebug({
        config: { logLevel: "silent", input: "." },
        configPath: null,
        configError: null,
        includeEnv: false,
        // outDir resolves UNDER a plain file, so mkdirSync(..., {recursive:true})
        // fails with ENOTDIR -- exercises writeFileSafe's outer catch.
        outDir: path.join(notADir, "nested"),
        print: (line) => lines.push(line),
      });
      const doc = lines.join("\n");
      assert.match(doc, /failed to save/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
