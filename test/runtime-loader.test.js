import {
  loadHeavyDep,
  ensureRuntimeInstalled,
  resolveHeavyDepPath,
  resolveHeavyDepSource,
  resolveHeavyDepVersion,
} from "../dist/runtime/loader.js";
import { readInstalledRecord } from "../dist/runtime/cacheDir.js";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

function makeFakeSpawner({
  exitCode = 0,
  stdout = "",
  stderr = "",
  stdoutChunks,
  stderrChunks,
  onSpawn,
} = {}) {
  const calls = [];
  const spawner = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    if (onSpawn) onSpawn({ cmd, args, opts });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      if (stdout) child.stdout.emit("data", stdout);
      // Emit each chunk as a separate `data` event to simulate a line split
      // across chunk boundaries.
      for (const c of stdoutChunks || []) child.stdout.emit("data", c);
      if (stderr) child.stderr.emit("data", stderr);
      for (const c of stderrChunks || []) child.stderr.emit("data", c);
      child.emit("close", exitCode);
    });
    return child;
  };
  spawner.calls = calls;
  return spawner;
}

describe("runtime/loader", function () {
  let originalEnv;
  let tmpRoot;
  beforeEach(function () {
    originalEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-loader-"));
    process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
  });
  afterEach(function () {
    if (originalEnv === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
    else process.env.DOC_DETECTIVE_CACHE_DIR = originalEnv;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("resolveHeavyDepSource / resolveHeavyDepVersion", function () {
    it("reports a shim-resolvable dep's source and version", function () {
      // pngjs is a declared heavy dep present in this source checkout.
      if (!resolveHeavyDepPath("pngjs")) this.skip();
      expect(resolveHeavyDepSource("pngjs")).to.equal("shim");
      expect(resolveHeavyDepVersion("pngjs")).to.match(/^\d+\.\d+\.\d+/);
    });

    it("returns null for a name that doesn't resolve anywhere", function () {
      const bogus = "definitely-not-a-real-heavy-dep-xyz";
      expect(resolveHeavyDepSource(bogus)).to.equal(null);
      expect(resolveHeavyDepVersion(bogus)).to.equal(null);
    });
  });

  describe("loadHeavyDep", function () {
    it("resolves a dep that is present in the shim's node_modules without invoking the installer", async function () {
      // In a source checkout pngjs lives in the shim's `optionalDependencies`,
      // which npm installs by default — so we expect it to resolve from the
      // shim's node_modules in this test environment. The fake spawner is
      // wired to throw if invoked; a successful load proves the cache fallback
      // never fired. Users of the published package (where the publish step moved
      // the heavy deps to `ddRuntimeDependencies`, so npm never installs them) hit
      // the cache/install path instead, exercised by other tests below.
      const calls = [];
      const spawner = makeFakeSpawner({
        onSpawn: () => calls.push("called"),
      });
      const mod = await loadHeavyDep("pngjs", { deps: { spawn: spawner, logger: () => {} } });
      // pngjs exports a `PNG` class — its presence proves the dynamic import
      // resolved a real module, not a stub. Avoid `to.be.an("object")`:
      // dynamic-imported ESM yields a Module Namespace, which isn't a plain
      // object in chai's strict type check.
      expect(mod).to.exist;
      expect(mod.PNG).to.be.a("function");
      expect(calls).to.deep.equal([]);
    });

    it("autoInstall:false throws a clean error when the dep is nowhere to be found", async function () {
      // Use a name that won't resolve either from the shim or from the
      // cache, AND isn't in package.json — so getDeclaredVersion() would
      // throw on the install path. With autoInstall:false, the loader
      // short-circuits before that and surfaces the cleaner "not
      // installed" error.
      try {
        await loadHeavyDep("@doc-detective/definitely-not-installed", {
          autoInstall: false,
          deps: { logger: () => {} },
        });
        throw new Error("expected loadHeavyDep to throw");
      } catch (err) {
        expect(String(err.message)).to.match(/not installed/i);
      }
    });
  });

  describe("ensureRuntimeInstalled", function () {
    it("is a no-op when the package list is empty", async function () {
      const spawner = makeFakeSpawner();
      await ensureRuntimeInstalled([], {
        deps: { spawn: spawner, logger: () => {} },
      });
      expect(spawner.calls).to.deep.equal([]);
    });

    it("spawns `npm install --prefix <runtimeDir> <pkg>@<declared>` for missing packages and writes installed.json", async function () {
      // The fake spawner reports exit 0 and creates the expected
      // <runtimeDir>/node_modules/<pkg>/package.json so the post-install
      // version readback succeeds.
      const declaredPngjsVersion = (() => {
        const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
        // Mirror production field priority (resolveDeclaredVersion):
        // ddRuntimeDependencies > optionalDependencies > dependencies.
        return (
          pkg.ddRuntimeDependencies?.pngjs ||
          pkg.optionalDependencies?.pngjs ||
          pkg.dependencies?.pngjs
        );
      })();
      const spawner = makeFakeSpawner({
        onSpawn: ({ args }) => {
          // Materialize a fake install under the prefix passed to npm so
          // the post-install version readback sees a coherent state.
          const prefixIdx = args.indexOf("--prefix");
          const prefix = args[prefixIdx + 1];
          const target = path.join(prefix, "node_modules", "pngjs");
          fs.mkdirSync(target, { recursive: true });
          fs.writeFileSync(
            path.join(target, "package.json"),
            JSON.stringify({ name: "pngjs", version: "7.0.0" }, null, 2)
          );
        },
      });

      // pngjs is already resolvable from the shim's node_modules (in a source
      // checkout it's declared in optionalDependencies, which npm installs by
      // default). force:true bypasses the skip-if-already-present check
      // so the install path is exercised here.
      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: spawner, logger: () => {} },
        force: true,
      });

      expect(spawner.calls).to.have.lengthOf(1);
      const { cmd, args } = spawner.calls[0];
      expect(cmd).to.match(/^npm(\.cmd)?$/);
      expect(args).to.include("install");
      expect(args).to.include("--prefix");
      expect(args).to.include("--no-save");
      expect(args).to.include("--no-audit");
      expect(args).to.include("--no-fund");
      expect(args.some((a) => a === `pngjs@${declaredPngjsVersion}`)).to.equal(
        true,
        `expected pngjs@${declaredPngjsVersion} in ${JSON.stringify(args)}`
      );

      const record = readInstalledRecord({});
      expect(record.npmPackages.pngjs).to.be.an("object");
      expect(record.npmPackages.pngjs.installedVersion).to.equal("7.0.0");
    });

    it("drops npm deprecation/funding noise from install output but keeps real lines", async function () {
      // Even a verbose-style logger (records every level) must not see the
      // scary deprecation/funding noise — only the loader's filtered output.
      const logged = [];
      const spawner = makeFakeSpawner({
        stdout: "added 1 package in 2s\nnpm fund packages are looking for funding\n",
        stderr:
          "npm warn deprecated glob@10.5.0: old versions are not supported\n" +
          "npm warn deprecated whatwg-encoding@3.1.1: use @exodus/bytes instead\n",
        onSpawn: ({ args }) => {
          const prefix = args[args.indexOf("--prefix") + 1];
          const target = path.join(prefix, "node_modules", "pngjs");
          fs.mkdirSync(target, { recursive: true });
          fs.writeFileSync(
            path.join(target, "package.json"),
            JSON.stringify({ name: "pngjs", version: "7.0.0" })
          );
        },
      });

      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: spawner, logger: (msg) => logged.push(msg) },
        force: true,
      });

      const out = logged.join("\n");
      expect(out, "deprecation noise must be dropped").to.not.match(/deprecated/i);
      expect(out, "funding noise must be dropped").to.not.match(/looking for funding/i);
      expect(out, "real npm output must be kept").to.match(/added 1 package/);
    });

    it("reassembles lines split across data chunks before filtering", async function () {
      // A deprecation line and a real line each arrive in two fragments with no
      // newline until the second — the per-stream buffer must reassemble them
      // before isNpmNoiseLine classifies, or fragmented noise would leak.
      const logged = [];
      const spawner = makeFakeSpawner({
        stderrChunks: ["npm warn deprecated gl", "ob@10.5.0: old versions\n"],
        stdoutChunks: ["added 1 packa", "ge in 2s\n"],
        onSpawn: ({ args }) => {
          const prefix = args[args.indexOf("--prefix") + 1];
          const target = path.join(prefix, "node_modules", "pngjs");
          fs.mkdirSync(target, { recursive: true });
          fs.writeFileSync(
            path.join(target, "package.json"),
            JSON.stringify({ name: "pngjs", version: "7.0.0" })
          );
        },
      });

      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: spawner, logger: (msg) => logged.push(msg) },
        force: true,
      });

      const out = logged.join("\n");
      expect(out, "fragmented deprecation noise must still be dropped").to.not.match(/deprecated/i);
      expect(out, "fragmented real line must be reassembled and kept").to.match(/added 1 package in 2s/);
    });

    it("rejects when npm exits non-zero", async function () {
      // pngjs resolves from the shim's node_modules (in a source checkout it's
      // declared in optionalDependencies, installed by default), so the
      // skip-if-already-present check short-circuits before npm runs.
      // force:true bypasses the skip so we can exercise the failure path.
      const spawner = makeFakeSpawner({ exitCode: 1 });
      try {
        await ensureRuntimeInstalled(["pngjs"], {
          deps: { spawn: spawner, logger: () => {} },
          force: true,
        });
        throw new Error("expected ensureRuntimeInstalled to reject");
      } catch (err) {
        expect(String(err.message)).to.match(/exited with code 1/);
        expect(String(err.message), "failure should point at the log file").to.match(/install\.log/);
      }
    });

    it("tees raw npm output to a log file and surfaces its path on failure", async function () {
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-loader-log-"));
      const logged = [];
      const spawner = makeFakeSpawner({
        exitCode: 1,
        stderr:
          "npm warn deprecated glob@10.5.0: old versions\n" +
          "npm error code E404\n" +
          "npm error 404 Not Found - GET https://registry/foo\n",
      });
      let caught;
      try {
        await ensureRuntimeInstalled(["pngjs"], {
          deps: { spawn: spawner, logger: (msg) => logged.push(msg) },
          ctx: { cacheDir },
          force: true,
        });
      } catch (err) {
        caught = err;
      }
      try {
        expect(caught, "should reject on exit 1").to.be.an("error");
        // Read the log path straight from the message (avoids Windows short/long
        // path-form mismatches) — it must point at the install.log we tee'd.
        const match = String(caught.message).match(/See full npm output: (.+install\.log)/);
        expect(match, "failure message must include the log path").to.not.equal(null);
        const logPath = match[1];

        // The log keeps the FULL raw output, including the deprecation noise that
        // was filtered from the terminal — that's what makes failures debuggable.
        const logContents = fs.readFileSync(logPath, "utf8");
        expect(logContents).to.match(/deprecated glob@10\.5\.0/);
        expect(logContents).to.match(/npm error 404 Not Found/);
        // ...but the terminal output still suppressed the deprecation noise.
        expect(logged.join("\n")).to.not.match(/deprecated/i);
      } finally {
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
    });

    it("still settles (no crash, no hang) when the log file can't be written", async function () {
      // Make <cacheDir>/runtime/install.log a directory so the log WriteStream
      // errors on open. Logging is best-effort: the install must still settle.
      const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-loader-logerr-"));
      fs.mkdirSync(path.join(cacheDir, "runtime", "install.log"), { recursive: true });
      const spawner = makeFakeSpawner({ exitCode: 1, stderr: "npm error boom\n" });
      let caught;
      try {
        try {
          await ensureRuntimeInstalled(["pngjs"], {
            deps: { spawn: spawner, logger: () => {} },
            ctx: { cacheDir },
            force: true,
          });
        } catch (err) {
          caught = err;
        }
        // The promise resolved/rejected — it didn't hang (mocha would time out)
        // or crash on an unhandled stream error.
        expect(caught, "should still reject on exit 1").to.be.an("error");
        expect(String(caught.message)).to.match(/exited with code 1/);
      } finally {
        fs.rmSync(cacheDir, { recursive: true, force: true });
      }
    });

    it("skips packages already present in the cache (idempotent fast path)", async function () {
      // Pre-populate a fake install in the cache.
      const runtimeDir = path.join(tmpRoot, "runtime");
      const target = path.join(runtimeDir, "node_modules", "pngjs");
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(
        path.join(target, "package.json"),
        JSON.stringify({ name: "pngjs", version: "7.0.0", main: "index.js" })
      );
      fs.writeFileSync(path.join(target, "index.js"), "module.exports = {};");
      fs.writeFileSync(
        path.join(runtimeDir, "package.json"),
        JSON.stringify({ name: "doc-detective-runtime-cache" })
      );

      const spawner = makeFakeSpawner();
      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: spawner, logger: () => {} },
      });
      expect(spawner.calls).to.deep.equal([]);
    });

    it("force: true reinstalls even when the package is already present", async function () {
      const runtimeDir = path.join(tmpRoot, "runtime");
      const target = path.join(runtimeDir, "node_modules", "pngjs");
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(
        path.join(target, "package.json"),
        JSON.stringify({ name: "pngjs", version: "6.0.0", main: "index.js" })
      );
      fs.writeFileSync(path.join(target, "index.js"), "module.exports = {};");
      fs.writeFileSync(
        path.join(runtimeDir, "package.json"),
        JSON.stringify({ name: "doc-detective-runtime-cache" })
      );

      const spawner = makeFakeSpawner({
        onSpawn: ({ args }) => {
          const prefix = args[args.indexOf("--prefix") + 1];
          const t = path.join(prefix, "node_modules", "pngjs");
          fs.mkdirSync(t, { recursive: true });
          fs.writeFileSync(
            path.join(t, "package.json"),
            JSON.stringify({ name: "pngjs", version: "7.0.0" })
          );
        },
      });
      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: spawner, logger: () => {} },
        force: true,
      });
      expect(spawner.calls).to.have.lengthOf(1);
    });
  });
});
