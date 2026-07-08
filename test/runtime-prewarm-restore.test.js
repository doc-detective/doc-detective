import { ensureRuntimeInstalled, resolveHeavyDepPathInCache } from "../dist/runtime/loader.js";
import {
  ensurePrewarmRestored,
  detectPlatform,
} from "../dist/runtime/prewarm.js";
import {
  readInstalledRecord,
  getRuntimeDir,
} from "../dist/runtime/cacheDir.js";
import { getShimVersion } from "../dist/runtime/heavyDeps.js";
import { EventEmitter } from "node:events";
import http from "node:http";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

// Match the tar binary the production restore uses (System32 bsdtar on Windows,
// where a bare "tar" may resolve to Git's GNU tar and choke on `-f C:\...`).
function tarBin() {
  if (process.platform === "win32") {
    return path.join(process.env.SystemRoot || "C:\\Windows", "System32", "tar.exe");
  }
  return "tar";
}

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

// The manifest pins every non-best-effort heavy dep (evaluateManifestMatch item
// 8) plus the TARGET driver we drive the restore for. Versions are chosen to
// satisfy the shim's declared ranges (item 8's satisfiesRange check) and are
// also the exact versions the staged stub package.json declares (walkUpVersion
// must equal the pin). All of these are declared in the shim's package.json.
const REQUIRED_PINS = {
  webdriverio: "9.29.0",
  appium: "3.5.2",
  "appium-chromium-driver": "3.0.2",
  "appium-geckodriver": "3.0.6",
  "appium-safari-driver": "5.0.2",
  "appium-xcuitest-driver": "10.6.0",
  sharp: "0.35.2",
  "@ffmpeg-installer/ffmpeg": "1.1.0",
  "@puppeteer/browsers": "3.0.5",
  geckodriver: "6.1.0",
  pixelmatch: "7.2.0",
  pngjs: "7.0.0",
  "proxy-agent": "8.0.2",
};
// The package the loader is asked to install. appium-mac2-driver is declared in
// the shim's ddRuntimeDependencies (^4.0.3) but is NOT present in the shim's
// node_modules in a source checkout — so the loader reaches the prewarm hook,
// and once restored, the skip-filter (which calls getDeclaredVersion +
// satisfiesRange) skips it. A truly-undeclared name would always be reinstalled
// because getDeclaredVersion throws in the filter's catch-all.
const TARGET_PKG = "appium-mac2-driver";
const TARGET_VERSION = "4.0.3";
const ALL_PINS = { ...REQUIRED_PINS, [TARGET_PKG]: TARGET_VERSION };

function makeFakeSpawner() {
  const calls = [];
  const spawner = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => child.emit("close", 0));
    return child;
  };
  spawner.calls = calls;
  return spawner;
}

function writeStubPackage(nmDir, name, version) {
  const pkgDir = path.join(nmDir, ...name.split("/"));
  fs.mkdirSync(pkgDir, { recursive: true });
  fs.writeFileSync(
    path.join(pkgDir, "package.json"),
    JSON.stringify({ name, version, main: "index.js" })
  );
  // Loads cleanly under `node -e require(...)` (sharp native check).
  fs.writeFileSync(path.join(pkgDir, "index.js"), "module.exports = {};\n");
}

// Build a `runtime/` tree with node_modules for every pinned package, then tar
// it with system tar. Returns { archivePath, sha256, bytes, tarOk }.
function buildFixture(workDir) {
  const runtimeDir = path.join(workDir, "runtime");
  const nmDir = path.join(runtimeDir, "node_modules");
  fs.mkdirSync(nmDir, { recursive: true });
  fs.writeFileSync(
    path.join(runtimeDir, "package.json"),
    JSON.stringify({ name: "doc-detective-runtime-cache", private: true, version: "0.0.0" })
  );
  for (const [name, version] of Object.entries(ALL_PINS)) {
    writeStubPackage(nmDir, name, version);
  }

  const archivePath = path.join(workDir, "prewarm.tar.gz");
  // Tar the `runtime/` dir (single top-level rootDir) with RELATIVE paths under
  // cwd so GNU tar doesn't mistake a `C:\` archive path for a remote host.
  const res = spawnSync(tarBin(), ["-czf", "prewarm.tar.gz", "-C", workDir, "runtime"], {
    stdio: "ignore",
    cwd: workDir,
  });
  if (res.error || res.status !== 0) {
    return { tarOk: false };
  }
  const buf = fs.readFileSync(archivePath);
  const sha256 = crypto.createHash("sha256").update(buf).digest("hex");
  return { archivePath, sha256, bytes: buf.length, tarOk: true };
}

function buildManifest({ ddVersion, platform, filename, sha256, bytes, corruptSha = false }) {
  return {
    schemaVersion: 1,
    ddVersion,
    kind: "runtime",
    platform: {
      os: platform.os,
      arch: platform.arch,
      libc: platform.libc,
      osVersion: platform.osVersion,
    },
    node: { builtWith: process.versions.node },
    createdAt: "2026-07-07T00:00:00.000Z",
    archive: {
      filename,
      sha256: corruptSha ? "0".repeat(64) : sha256,
      bytes,
      format: "tar.gz",
      rootDir: "runtime",
    },
    npmPackages: { ...ALL_PINS },
  };
}

// Confirm the production extract path can read the fixture with whatever `tar`
// resolves on PATH (GNU tar in a Git-Bash shell mishandles absolute C:\ archive
// paths; bsdtar in System32 handles them). If it can't, the whole restore path
// degrades to skip — so we skip the suite rather than assert a false negative.
function productionTarCanExtract(archivePath) {
  const dest = fs.mkdtempSync(path.join(os.tmpdir(), "dd-tarprobe-"));
  try {
    const res = spawnSync(tarBin(), ["-xzf", archivePath, "-C", dest], { stdio: "ignore" });
    return !res.error && res.status === 0 && fs.existsSync(path.join(dest, "runtime"));
  } catch {
    return false;
  } finally {
    fs.rmSync(dest, { recursive: true, force: true });
  }
}

describe("runtime/prewarm restore (integration)", function () {
  this.timeout(30000);
  let tmpRoot;
  let workDir;
  let originalCache;
  let originalBaseUrl;
  let originalPrebuilt;
  let server;
  let baseUrl;
  let fixture;
  let platform;
  let ddVersion;
  let serve;

  before(function (done) {
    platform = detectPlatform();
    ddVersion = getShimVersion();
    if (!platform.key || !ddVersion) {
      this.skip();
      return;
    }
    workDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-prewarm-fx-"));
    fixture = buildFixture(workDir);
    if (!fixture.tarOk || !productionTarCanExtract(fixture.archivePath)) {
      // System tar unavailable / mishandles the paths this env's tar sees —
      // matches the plan's ENOENT/degradation fallback.
      this.skip();
      return;
    }
    const archiveName = `prewarm-runtime-${platform.key}.tar.gz`;
    const manifestName = `prewarm-runtime-${platform.key}.manifest.json`;
    serve = {
      manifest: JSON.stringify(
        buildManifest({ ddVersion, platform, filename: archiveName, sha256: fixture.sha256, bytes: fixture.bytes })
      ),
      archiveName,
      manifestName,
      archive404: false,
      manifest404: false,
    };
    server = http.createServer((req, res) => {
      const url = req.url || "";
      if (url.endsWith(manifestName)) {
        if (serve.manifest404) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, { "content-type": "application/json" });
        res.end(serve.manifest);
        return;
      }
      if (url.endsWith(archiveName)) {
        if (serve.archive404) {
          res.writeHead(404);
          res.end("not found");
          return;
        }
        res.writeHead(200, { "content-type": "application/gzip" });
        fs.createReadStream(fixture.archivePath).pipe(res);
        return;
      }
      res.writeHead(404);
      res.end("not found");
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      baseUrl = `http://127.0.0.1:${port}/`;
      done();
    });
  });

  after(function (done) {
    if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
    if (server) server.close(() => done());
    else done();
  });

  beforeEach(function () {
    originalCache = process.env.DOC_DETECTIVE_CACHE_DIR;
    originalBaseUrl = process.env.DOC_DETECTIVE_PREBUILT_BASE_URL;
    originalPrebuilt = process.env.DOC_DETECTIVE_PREBUILT;
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-prewarm-cache-"));
    process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
    process.env.DOC_DETECTIVE_PREBUILT_BASE_URL = baseUrl;
    // Re-enable prewarm (hooks.js disables it globally by default).
    delete process.env.DOC_DETECTIVE_PREBUILT;
    // Reset serve to the happy path.
    serve.archive404 = false;
    serve.manifest404 = false;
    serve.manifest = JSON.stringify(
      buildManifest({ ddVersion, platform, filename: serve.archiveName, sha256: fixture.sha256, bytes: fixture.bytes })
    );
  });

  afterEach(function () {
    if (originalCache === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
    else process.env.DOC_DETECTIVE_CACHE_DIR = originalCache;
    if (originalBaseUrl === undefined) delete process.env.DOC_DETECTIVE_PREBUILT_BASE_URL;
    else process.env.DOC_DETECTIVE_PREBUILT_BASE_URL = originalBaseUrl;
    if (originalPrebuilt === undefined) delete process.env.DOC_DETECTIVE_PREBUILT;
    else process.env.DOC_DETECTIVE_PREBUILT = originalPrebuilt;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it("restores from the tarball so ensureRuntimeInstalled never spawns npm; package resolves; installed.json merged", async function () {
    const spawner = makeFakeSpawner();
    await ensureRuntimeInstalled([TARGET_PKG], {
      deps: { spawn: spawner, logger: () => {} },
    });
    // The whole point: npm was never invoked because prewarm satisfied it.
    expect(spawner.calls, "npm should not be spawned on a successful restore").to.deep.equal([]);
    // The target driver now resolves from the restored cache.
    expect(
      resolveHeavyDepPathInCache(TARGET_PKG, {}),
      "target resolves from restored cache"
    ).to.be.a("string");
    // installed.json merged from the manifest's declared pins.
    const record = readInstalledRecord({});
    expect(record.npmPackages[TARGET_PKG]).to.be.an("object");
    expect(record.npmPackages[TARGET_PKG].installedVersion).to.equal(TARGET_VERSION);
    expect(record.npmPackages.sharp.installedVersion).to.equal("0.35.2");
    expect(record.npmPackages.webdriverio.installedVersion).to.equal("9.29.0");
  });

  it("falls back (restore skipped, cache untouched) when the archive sha256 is corrupted", async function () {
    serve.manifest = JSON.stringify(
      buildManifest({
        ddVersion,
        platform,
        filename: serve.archiveName,
        sha256: fixture.sha256,
        bytes: fixture.bytes,
        corruptSha: true,
      })
    );
    const result = await ensurePrewarmRestored("runtime", { ctx: {}, deps: { logger: () => {} } });
    expect(result).to.equal("skipped");
    expect(
      fs.existsSync(path.join(getRuntimeDir({}), "node_modules")),
      "cache must NOT be populated on a sha mismatch"
    ).to.equal(false);
    // Through the loader hook: with the restore skipped, the target still needs
    // installing, so the npm spawner IS invoked (fallback proven).
    const spawner = makeFakeSpawner();
    await ensureRuntimeInstalled([TARGET_PKG], {
      deps: { spawn: spawner, logger: () => {} },
    });
    expect(spawner.calls.length, "npm must be invoked on the sha-mismatch fallback").to.be.greaterThan(0);
  });

  it("falls back (restore skipped) when the manifest 404s", async function () {
    serve.manifest404 = true;
    const result = await ensurePrewarmRestored("runtime", { ctx: {}, deps: { logger: () => {} } });
    expect(result).to.equal("skipped");
    expect(
      fs.existsSync(path.join(getRuntimeDir({}), "node_modules")),
      "cache must NOT be populated on a 404"
    ).to.equal(false);
  });

  it("records a sentinel on 404 so a second run makes no download attempt", async function () {
    serve.manifest404 = true;
    // First run: records not-found sentinel.
    await ensurePrewarmRestored("runtime", { ctx: {}, deps: { logger: () => {} } });
    // Flip the server back to a working manifest; the sentinel must still
    // short-circuit the second run (no HTTP even though assets now exist).
    serve.manifest404 = false;
    let httpCalls = 0;
    const countingHttp = {
      getText: async () => {
        httpCalls++;
        throw new Error("should not be called");
      },
      download: async () => {
        httpCalls++;
        throw new Error("should not be called");
      },
    };
    const result = await ensurePrewarmRestored("runtime", {
      ctx: {},
      deps: { logger: () => {}, http: countingHttp },
    });
    expect(result).to.equal("skipped");
    expect(httpCalls, "no HTTP call on the second run (sentinel short-circuit)").to.equal(0);
  });

  it("de-dupes concurrent restores (single in-flight promise, no double download)", async function () {
    const [a, b] = await Promise.all([
      ensurePrewarmRestored("runtime", { ctx: {}, deps: { logger: () => {} } }),
      ensurePrewarmRestored("runtime", { ctx: {}, deps: { logger: () => {} } }),
    ]);
    expect(a).to.equal("restored");
    // The second concurrent caller shared the same in-flight promise, so it also
    // sees "restored" (not a second download racing into "lost-race").
    expect(b).to.equal("restored");
    expect(resolveHeavyDepPathInCache(TARGET_PKG, {})).to.be.a("string");
  });
});
