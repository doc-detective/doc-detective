import { loadHeavyDep, ensureRuntimeInstalled } from "../dist/runtime/loader.js";
import { readInstalledRecord } from "../dist/runtime/cacheDir.js";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

function makeFakeSpawner({ exitCode = 0, stdout = "", stderr = "", onSpawn } = {}) {
  const calls = [];
  const spawner = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    if (onSpawn) onSpawn({ cmd, args, opts });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => {
      if (stdout) child.stdout.emit("data", stdout);
      if (stderr) child.stderr.emit("data", stderr);
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

  describe("loadHeavyDep", function () {
    it("resolves a dep that is present in the shim's node_modules without invoking the installer", async function () {
      // pngjs is currently a regular dependency, so it must resolve from the
      // shim's node_modules. The fake spawner is wired to throw if invoked —
      // a successful load proves the cache fallback never fired.
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
      // Use a name that won't resolve either from the shim or from the cache,
      // but IS declared in package.json so getDeclaredVersion() doesn't fire
      // a different error path. pngjs would resolve from shim, so we instead
      // point the cache at an empty dir and use a freshly-named dep — but the
      // simplest way is to use autoInstall:false and a name not in shim
      // node_modules. We pick a package that's in optionalDependencies but
      // not in regular dependencies. Actually all our heavy deps are in
      // regular deps today. So we point require resolution at an empty
      // scope by using a fake package name that is NOT in package.json.
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
        return pkg.dependencies?.pngjs || pkg.optionalDependencies?.pngjs;
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

      // pngjs is already resolvable from the shim's node_modules (it's a
      // regular dep). force:true bypasses the skip-if-already-present check
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

    it("rejects when npm exits non-zero", async function () {
      // pngjs resolves from the shim's node_modules (it's a regular dep),
      // so the skip-if-already-present check would short-circuit before
      // npm even runs. force:true bypasses the skip so we can exercise
      // the failure path.
      const spawner = makeFakeSpawner({ exitCode: 1 });
      try {
        await ensureRuntimeInstalled(["pngjs"], {
          deps: { spawn: spawner, logger: () => {} },
          force: true,
        });
        throw new Error("expected ensureRuntimeInstalled to reject");
      } catch (err) {
        expect(String(err.message)).to.match(/exited with code 1/);
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
