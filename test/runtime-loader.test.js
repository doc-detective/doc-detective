import {
  loadHeavyDep,
  ensureRuntimeInstalled,
  resolveHeavyDepPath,
  resolveHeavyDepPathInCache,
  resolveHeavyDepSource,
  resolveHeavyDepVersion,
} from "../dist/runtime/loader.js";
import {
  readInstalledRecord,
  writeInstalledRecord,
  getRuntimeDir,
} from "../dist/runtime/cacheDir.js";
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

    it("resolves a pure-ESM cache package via package.json when `.` has no require export", function () {
      // Reproduces appium-chromium-driver v3 / appium-geckodriver v3 /
      // appium-safari-driver v5: a package whose "." export exposes only an
      // `import` condition. `require.resolve(name)` throws
      // ERR_PACKAGE_PATH_NOT_EXPORTED, but `./package.json` stays exported, so
      // the loader must fall back to it and derive the real entry.
      const runtimeDir = getRuntimeDir({ cacheDir: tmpRoot });
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.writeFileSync(
        path.join(runtimeDir, "package.json"),
        JSON.stringify({ name: "rt-cache", private: true, version: "0.0.0" })
      );
      const pkgDir = path.join(runtimeDir, "node_modules", "fake-esm-driver");
      fs.mkdirSync(path.join(pkgDir, "build"), { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({
          name: "fake-esm-driver",
          version: "3.0.0",
          type: "module",
          exports: {
            ".": { import: "./build/index.js" },
            "./package.json": "./package.json",
          },
        })
      );
      fs.writeFileSync(
        path.join(pkgDir, "build", "index.js"),
        "export default {};\n"
      );

      const resolved = resolveHeavyDepPath("fake-esm-driver", {
        cacheDir: tmpRoot,
      });
      // require.resolve realpath-normalizes its result, so on macOS the tmp dir
      // (/var/folders -> /private/var/folders symlink) and on Windows any
      // case/8.3 differences would break an exact string compare. Compare
      // realpaths so the assertion checks the same file, not the same spelling.
      expect(resolved).to.not.equal(null);
      expect(fs.realpathSync(resolved)).to.equal(
        fs.realpathSync(path.join(pkgDir, "build", "index.js"))
      );
      // The version walk-up must also work off the fallback-resolved entry.
      expect(resolveHeavyDepVersion("fake-esm-driver", { cacheDir: tmpRoot })).to.equal(
        "3.0.0"
      );
    });

    it("rejects a pure-ESM package whose entry escapes the package dir", function () {
      // A crafted exports target like "../../../escape.js" must not resolve —
      // the containment guard mirrors Node's own exports-target validation so a
      // malicious package.json can't point the entry outside the package.
      const runtimeDir = getRuntimeDir({ cacheDir: tmpRoot });
      fs.mkdirSync(runtimeDir, { recursive: true });
      fs.writeFileSync(
        path.join(runtimeDir, "package.json"),
        JSON.stringify({ name: "rt-cache", private: true, version: "0.0.0" })
      );
      const pkgDir = path.join(runtimeDir, "node_modules", "evil-esm");
      fs.mkdirSync(pkgDir, { recursive: true });
      fs.writeFileSync(
        path.join(pkgDir, "package.json"),
        JSON.stringify({
          name: "evil-esm",
          version: "1.0.0",
          type: "module",
          exports: {
            ".": { import: "../../../escape.js" },
            "./package.json": "./package.json",
          },
        })
      );
      expect(resolveHeavyDepPath("evil-esm", { cacheDir: tmpRoot })).to.equal(
        null
      );
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

  // An unusable cacheDir must not crash the read-only resolvers: they only
  // LOCATE a dep, so "the cache can't be constructed" means "not in cache"
  // (null), never a throw. `bad;chars` trips assertSafeRuntimePath, which is
  // the security gate that still fires at the one place that shells out.
  describe("an unusable cacheDir", function () {
    const BAD_CACHE_DIR = "bad;chars";
    const BOGUS = "definitely-not-a-real-heavy-dep-xyz";

    beforeEach(function () {
      // getCacheDir prefers DOC_DETECTIVE_CACHE_DIR over ctx.cacheDir, and the
      // outer beforeEach points it at a real tmpdir — clear it so the `ctx`
      // values under test are the ones that actually take effect.
      delete process.env.DOC_DETECTIVE_CACHE_DIR;
    });

    it("resolveHeavyDep* return null rather than throwing when the cacheDir is unsafe", function () {
      const ctx = { cacheDir: BAD_CACHE_DIR };
      expect(resolveHeavyDepPath(BOGUS, ctx)).to.equal(null);
      expect(resolveHeavyDepPathInCache(BOGUS, ctx)).to.equal(null);
      expect(resolveHeavyDepSource(BOGUS, ctx)).to.equal(null);
      expect(resolveHeavyDepVersion(BOGUS, ctx)).to.equal(null);
    });

    it("an unsafe cacheDir set via DOC_DETECTIVE_CACHE_DIR also degrades to null", function () {
      process.env.DOC_DETECTIVE_CACHE_DIR = BAD_CACHE_DIR;
      expect(resolveHeavyDepPath(BOGUS)).to.equal(null);
      expect(resolveHeavyDepPathInCache(BOGUS)).to.equal(null);
    });

    it("a shim-resolvable dep still resolves — the bad cache is never consulted", function () {
      if (!resolveHeavyDepPath("pngjs")) this.skip();
      expect(resolveHeavyDepPath("pngjs", { cacheDir: BAD_CACHE_DIR })).to.be.a("string");
      expect(resolveHeavyDepSource("pngjs", { cacheDir: BAD_CACHE_DIR })).to.equal("shim");
    });

    it("autoInstall:false surfaces the unsafe-cacheDir cause, not a generic 'not installed'", async function () {
      // Telling the user to run `doc-detective install runtime` would be
      // actively misdirecting: that command fails the same way. Report the
      // real reason the cache was unusable instead.
      try {
        await loadHeavyDep(BOGUS, {
          autoInstall: false,
          ctx: { cacheDir: BAD_CACHE_DIR },
          deps: { logger: () => {} },
        });
        throw new Error("expected loadHeavyDep to throw");
      } catch (err) {
        expect(String(err.message)).to.match(/shell-metacharacter/);
      }
    });

    it("autoInstall:true with an undeclared dep throws and never spawns npm", async function () {
      // Deliberately narrow: this asserts ONLY throws-and-never-spawns, which is
      // all it can. With an *undeclared* name the throw comes from
      // getDeclaredVersion, not from cacheDir validation — `specs =
      // toInstall.map(getDeclaredVersion)` runs before `getRuntimeDir(ctx)` in
      // ensureRuntimeInstalled. So this is NOT a guard on the unsafe-cacheDir
      // path and must not be read as one: it would still pass if that
      // protection regressed. The real cacheDir guard (declared dep →
      // getRuntimeDir throws before any spawn) is the ensureRuntimeInstalled
      // test below, which reaches validation via force:true.
      //
      // Forcing a declared dep to miss shim resolution isn't possible here:
      // tryResolveFromShim binds `require` at module scope and every declared
      // heavy dep is really installed in this checkout.
      let spawnCalled = false;
      const spawner = makeFakeSpawner({ onSpawn: () => { spawnCalled = true; } });
      let caught;
      try {
        await loadHeavyDep(BOGUS, {
          autoInstall: true,
          ctx: { cacheDir: BAD_CACHE_DIR },
          deps: { spawn: spawner, logger: () => {} },
        });
      } catch (err) {
        caught = err;
      }
      expect(caught, "expected loadHeavyDep to throw").to.exist;
      expect(spawnCalled, "npm must never be spawned with an unsafe cacheDir").to.equal(false);
    });

    it("ensureRuntimeInstalled still refuses to spawn npm with an unsafe cacheDir", async function () {
      // Security regression guard: swallowing the throw in the read-only
      // resolver must never let an unsafe path reach the `shell: true` npm
      // spawn on Windows. force:true bypasses the already-installed fast path
      // so we reach the spawn site's own assertSafeRuntimePath check.
      let spawnCalled = false;
      const spawner = makeFakeSpawner({ onSpawn: () => { spawnCalled = true; } });
      let caught;
      try {
        await ensureRuntimeInstalled(["pngjs"], {
          ctx: { cacheDir: BAD_CACHE_DIR },
          force: true,
          deps: { spawn: spawner, logger: () => {} },
        });
      } catch (err) {
        caught = err;
      }
      expect(caught, "expected ensureRuntimeInstalled to throw").to.exist;
      expect(String(caught.message)).to.match(/shell-metacharacter/);
      expect(spawnCalled, "npm must never be spawned with an unsafe cacheDir").to.equal(false);
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

    // Issue #501 root cause: `npm install --no-save` against a dependency-less
    // runtime package.json makes npm's arborist treat every already-installed
    // sibling as extraneous and PRUNE it — a mid-run JIT install of one heavy
    // dep (the NovaWindows driver) deleted node-pty's files out from under the
    // loaded module, and the next pty.spawn froze the process. The fix records
    // every on-disk managed package in the runtime package.json `dependencies`
    // so installs are additive.
    it("records installed packages as runtime package.json dependencies so a later install's ideal tree keeps them (#501)", async function () {
      const materialize = (name, version) => ({ args }) => {
        const prefix = args[args.indexOf("--prefix") + 1];
        const target = path.join(prefix, "node_modules", name);
        fs.mkdirSync(target, { recursive: true });
        fs.writeFileSync(
          path.join(target, "package.json"),
          JSON.stringify({ name, version })
        );
      };
      await ensureRuntimeInstalled(["pngjs"], {
        deps: { spawn: makeFakeSpawner({ onSpawn: materialize("pngjs", "7.0.0") }), logger: () => {} },
        force: true,
      });
      const pkgPath = path.join(getRuntimeDir({}), "package.json");
      let deps = JSON.parse(fs.readFileSync(pkgPath, "utf8")).dependencies;
      expect(deps).to.have.property("pngjs");

      // The second install must PRESERVE the first entry — this is the recorded
      // contract that stops npm pruning siblings.
      await ensureRuntimeInstalled(["pixelmatch"], {
        deps: { spawn: makeFakeSpawner({ onSpawn: materialize("pixelmatch", "7.2.0") }), logger: () => {} },
        force: true,
      });
      deps = JSON.parse(fs.readFileSync(pkgPath, "utf8")).dependencies;
      expect(deps).to.have.property("pngjs");
      expect(deps).to.have.property("pixelmatch");

      // Ranges mirror the shim's declared constraints (same priority order as
      // resolveDeclaredVersion).
      const shimPkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
      const declared =
        shimPkg.ddRuntimeDependencies?.pngjs ||
        shimPkg.optionalDependencies?.pngjs ||
        shimPkg.dependencies?.pngjs;
      expect(deps.pngjs).to.equal(declared);
    });

    it("seeds dependencies from a pre-fix cache (installed.json + node_modules) so the first new install can't prune it (#501)", async function () {
      // Simulate a cache created before the fix: a package physically present
      // and recorded in installed.json, but absent from package.json
      // dependencies. It is not declared by the shim, so the range falls back
      // to ^installedVersion.
      const runtimeDir = getRuntimeDir({});
      const legacy = path.join(runtimeDir, "node_modules", "some-legacy-pkg");
      fs.mkdirSync(legacy, { recursive: true });
      fs.writeFileSync(
        path.join(legacy, "package.json"),
        JSON.stringify({ name: "some-legacy-pkg", version: "1.2.3" })
      );
      writeInstalledRecord(
        {
          npmPackages: {
            "some-legacy-pkg": {
              installedVersion: "1.2.3",
              installedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          browsers: {},
        },
        {}
      );

      await ensureRuntimeInstalled(["pngjs"], {
        deps: {
          spawn: makeFakeSpawner({
            onSpawn: ({ args }) => {
              const prefix = args[args.indexOf("--prefix") + 1];
              const target = path.join(prefix, "node_modules", "pngjs");
              fs.mkdirSync(target, { recursive: true });
              fs.writeFileSync(
                path.join(target, "package.json"),
                JSON.stringify({ name: "pngjs", version: "7.0.0" })
              );
            },
          }),
          logger: () => {},
        },
        force: true,
      });

      const deps = JSON.parse(
        fs.readFileSync(path.join(runtimeDir, "package.json"), "utf8")
      ).dependencies;
      expect(deps["some-legacy-pkg"]).to.equal("^1.2.3");
      expect(deps).to.have.property("pngjs");
    });

    it("never records a package that is not physically on disk (no resurrecting failed/pruned installs)", async function () {
      // installed.json can be stale (it listed appium while the package was
      // pruned, in the observed #501 cache). Recording an absent package would
      // make every future npm install try to fetch it — and a permanently
      // failing best-effort dep (node-pty on an exotic platform) would then
      // poison all later installs. Presence on disk is the only trigger.
      writeInstalledRecord(
        {
          npmPackages: {
            "some-pruned-pkg": {
              installedVersion: "2.0.0",
              installedAt: "2026-01-01T00:00:00.000Z",
            },
          },
          browsers: {},
        },
        {}
      );
      await ensureRuntimeInstalled(["pngjs"], {
        deps: {
          spawn: makeFakeSpawner({
            onSpawn: ({ args }) => {
              const prefix = args[args.indexOf("--prefix") + 1];
              const target = path.join(prefix, "node_modules", "pngjs");
              fs.mkdirSync(target, { recursive: true });
              fs.writeFileSync(
                path.join(target, "package.json"),
                JSON.stringify({ name: "pngjs", version: "7.0.0" })
              );
            },
          }),
          logger: () => {},
        },
        force: true,
      });
      const deps = JSON.parse(
        fs.readFileSync(path.join(getRuntimeDir({}), "package.json"), "utf8")
      ).dependencies;
      expect(deps).to.not.have.property("some-pruned-pkg");
    });

    it("protects on-disk shim-declared orphans that installed.json never recorded (interrupted bulk install)", async function () {
      // The CI failure mode behind the Appium start timeouts: the postinstall
      // bulk pre-warm's npm child gets killed (install timeout, OOM, job
      // cancel) AFTER extracting most packages but BEFORE ensureRuntimeInstalled
      // could write installed.json / record dependencies. Those packages are
      // physically present but invisible to both recording sources, so the next
      // JIT install pruned them all ("removed 1064 packages") — gutting the
      // appium tree while the runner was about to start it. Shim-declared names
      // found on disk must be swept into the manifest BEFORE this install's
      // npm child runs, so its reify keeps them.
      const runtimeDir = getRuntimeDir({});
      for (const orphan of ["appium", "proxy-agent"]) {
        const dir = path.join(runtimeDir, "node_modules", orphan);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, "package.json"),
          JSON.stringify({ name: orphan, version: "1.0.0" })
        );
      }
      // NO installed.json, NO prior dependencies in the manifest — the orphans
      // exist on disk only.

      let depsAtSpawnTime;
      await ensureRuntimeInstalled(["pngjs"], {
        deps: {
          spawn: makeFakeSpawner({
            onSpawn: ({ args }) => {
              const prefix = args[args.indexOf("--prefix") + 1];
              depsAtSpawnTime = JSON.parse(
                fs.readFileSync(path.join(prefix, "package.json"), "utf8")
              ).dependencies;
              const target = path.join(prefix, "node_modules", "pngjs");
              fs.mkdirSync(target, { recursive: true });
              fs.writeFileSync(
                path.join(target, "package.json"),
                JSON.stringify({ name: "pngjs", version: "7.0.0" })
              );
            },
          }),
          logger: () => {},
        },
        force: true,
      });

      // Recorded BEFORE npm ran — protection must cover this very install.
      expect(depsAtSpawnTime).to.have.property("appium");
      expect(depsAtSpawnTime).to.have.property("proxy-agent");
      const deps = JSON.parse(
        fs.readFileSync(path.join(runtimeDir, "package.json"), "utf8")
      ).dependencies;
      expect(deps).to.have.property("appium");
      // The recorded range mirrors the shim's declared constraint.
      const shimPkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
      const declaredAppium =
        shimPkg.ddRuntimeDependencies?.appium ||
        shimPkg.optionalDependencies?.appium ||
        shimPkg.dependencies?.appium;
      expect(deps.appium).to.equal(declaredAppium);
      // Declared-but-absent names stay unrecorded: the orphan sweep is
      // presence-filtered, so a genuinely failed install (e.g. the best-effort
      // PTY backend on an exotic platform) is still never resurrected.
      expect(deps).to.not.have.property("webdriverio");
      expect(deps).to.not.have.property("@homebridge/node-pty-prebuilt-multiarch");
    });

    it("sweeps orphans declared only in ddRuntimeDependencies (app-surface drivers), not just HEAVY_NPM_DEPS", async function () {
      // The app-surface preflights JIT-install drivers that are declared in
      // package.json#ddRuntimeDependencies but are NOT in HEAVY_NPM_DEPS
      // (appium-novawindows-driver, appium-mac2-driver,
      // appium-uiautomator2-driver). An interrupted install of one of those
      // leaves the same kind of unrecorded on-disk orphan — the sweep list
      // must cover the full declared universe, not only the loader's own
      // constant.
      const runtimeDir = getRuntimeDir({});
      const orphan = path.join(
        runtimeDir,
        "node_modules",
        "appium-novawindows-driver"
      );
      fs.mkdirSync(orphan, { recursive: true });
      fs.writeFileSync(
        path.join(orphan, "package.json"),
        JSON.stringify({ name: "appium-novawindows-driver", version: "1.4.1" })
      );

      await ensureRuntimeInstalled(["pngjs"], {
        deps: {
          spawn: makeFakeSpawner({
            onSpawn: ({ args }) => {
              const prefix = args[args.indexOf("--prefix") + 1];
              const target = path.join(prefix, "node_modules", "pngjs");
              fs.mkdirSync(target, { recursive: true });
              fs.writeFileSync(
                path.join(target, "package.json"),
                JSON.stringify({ name: "pngjs", version: "7.0.0" })
              );
            },
          }),
          logger: () => {},
        },
        force: true,
      });

      const deps = JSON.parse(
        fs.readFileSync(path.join(runtimeDir, "package.json"), "utf8")
      ).dependencies;
      const shimPkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
      expect(deps["appium-novawindows-driver"]).to.equal(
        shimPkg.ddRuntimeDependencies["appium-novawindows-driver"]
      );
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
