import {
  installRuntime,
  installBrowsers,
  status,
} from "../dist/runtime/installer.js";
import { resolveHeavyDepSource } from "../dist/runtime/loader.js";
import { writeInstalledRecord } from "../dist/runtime/cacheDir.js";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

function makeFakeBrowsersModule({ latest = "120.0.0" } = {}) {
  return {
    detectBrowserPlatform: () => "linux",
    resolveBuildId: async () => latest,
    install: async () => {},
    uninstall: async () => {},
    computeExecutablePath: ({ browser, buildId, cacheDir }) =>
      path.join(cacheDir, browser, buildId, "exe"),
  };
}

function fakeNpmSpawner({ exitCode = 0, materialize = {} } = {}) {
  return (cmd, args, _opts) => {
    const prefix = args[args.indexOf("--prefix") + 1];
    for (const [pkg, version] of Object.entries(materialize)) {
      const target = path.join(prefix, "node_modules", pkg);
      fs.mkdirSync(target, { recursive: true });
      fs.writeFileSync(
        path.join(target, "package.json"),
        JSON.stringify({ name: pkg, version }, null, 2)
      );
    }
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    setImmediate(() => child.emit("close", exitCode));
    return child;
  };
}

describe("runtime/installer", function () {
  let originalEnv;
  let tmpRoot;
  beforeEach(function () {
    originalEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-installer-"));
    process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
  });
  afterEach(function () {
    if (originalEnv === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
    else process.env.DOC_DETECTIVE_CACHE_DIR = originalEnv;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("installRuntime", function () {
    it("dry-run returns one report per requested package, action='dry-run'", async function () {
      const reports = await installRuntime({
        packages: ["pngjs", "pixelmatch"],
        dryRun: true,
        deps: { logger: () => {} },
      });
      expect(reports).to.have.lengthOf(2);
      for (const r of reports) {
        expect(r.action).to.equal("dry-run");
        expect(r.kind).to.equal("npm");
        // dry-run reports must NOT set installedVersion — nothing has been
        // installed yet. The would-be install target lives in `notes` so
        // CLI output and API consumers don't render a constraint range
        // (e.g. `^7.0.0`) in a column that elsewhere shows a resolved
        // version.
        expect(r.installedVersion).to.be.undefined;
        expect(r.notes).to.be.an("array").with.lengthOf.at.least(1);
        expect(r.notes[0]).to.match(/^would install /);
      }
    });

    it("dry-run expands peer companions so it matches the real install", async function () {
      const reports = await installRuntime({
        packages: ["@puppeteer/browsers"],
        dryRun: true,
        deps: { logger: () => {} },
      });
      const ids = reports.map((r) => r.assetId);
      // The real install pulls in proxy-agent alongside @puppeteer/browsers,
      // so the dry-run report must list it too rather than under-reporting.
      expect(ids).to.include("@puppeteer/browsers");
      expect(ids).to.include("proxy-agent");
    });

    it("installs the requested package and reports an actionable state", async function () {
      // In a source checkout pngjs lives in the shim's `optionalDependencies`,
      // which npm installs by default — so it resolves from the shim's
      // node_modules and the installer's skip-if-already-resolvable path would
      // report "already-up-to-date". force:true bypasses that skip and
      // exercises the actual install path. Users of the published package
      // (heavy deps moved to `ddRuntimeDependencies`, never installed by npm)
      // hit the install path without force.
      const spawner = fakeNpmSpawner({
        materialize: { pngjs: "7.0.0" },
      });
      const reports = await installRuntime({
        packages: ["pngjs"],
        force: true,
        deps: { spawn: spawner, logger: () => {} },
      });
      expect(reports).to.have.lengthOf(1);
      expect(["installed", "forced", "updated"]).to.include(reports[0].action);
      expect(reports[0].installedVersion).to.equal("7.0.0");
    });

    it("reports installed peer companions, not just the requested package", async function () {
      // @puppeteer/browsers pulls in proxy-agent; the install report must list
      // both so it matches what was actually installed (and the dry-run).
      const spawner = fakeNpmSpawner({
        materialize: { "@puppeteer/browsers": "3.0.4", "proxy-agent": "8.0.1" },
      });
      const reports = await installRuntime({
        packages: ["@puppeteer/browsers"],
        force: true,
        deps: { spawn: spawner, logger: () => {} },
      });
      const ids = reports.map((r) => r.assetId);
      expect(ids).to.include("@puppeteer/browsers");
      expect(ids).to.include("proxy-agent");
    });

    it("reports 'already-up-to-date' when nothing changes on re-run", async function () {
      // Pre-seed the cache with a fake pngjs install and matching record.
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
      writeInstalledRecord({
        npmPackages: {
          pngjs: { installedVersion: "7.0.0", installedAt: "2026-01-01T00:00:00Z" },
        },
        browsers: {},
      }, {});

      const spawner = fakeNpmSpawner({ materialize: { pngjs: "7.0.0" } });
      const reports = await installRuntime({
        packages: ["pngjs"],
        deps: { spawn: spawner, logger: () => {} },
      });
      expect(reports[0].action).to.equal("already-up-to-date");
    });
  });

  describe("installBrowsers", function () {
    it("dry-run returns one report per browser asset with channel notes", async function () {
      const reports = await installBrowsers({
        names: ["chrome", "firefox"],
        dryRun: true,
        deps: { logger: () => {} },
      });
      expect(reports).to.have.lengthOf(2);
      const chrome = reports.find((r) => r.assetId === "chrome");
      expect(chrome.action).to.equal("dry-run");
      expect(chrome.notes[0]).to.include("channel: stable");
    });

    it("installs missing browsers and reports 'installed' with installedVersion", async function () {
      const browsersModule = makeFakeBrowsersModule({ latest: "121.0.0" });
      const reports = await installBrowsers({
        names: ["chrome"],
        deps: {
          logger: () => {},
          browserDeps: { browsersModule },
        },
      });
      expect(reports).to.have.lengthOf(1);
      expect(reports[0].action).to.equal("installed");
      expect(reports[0].installedVersion).to.equal("121.0.0");
    });

    it("reports 'forced' when force=true", async function () {
      writeInstalledRecord({
        npmPackages: {},
        browsers: {
          chrome: {
            installedVersion: "100.0.0",
            installedAt: "2026-01-01T00:00:00Z",
            latestKnownVersion: "100.0.0",
            latestCheckedAt: new Date().toISOString(),
          },
        },
      }, {});
      const browsersModule = makeFakeBrowsersModule({ latest: "121.0.0" });
      const reports = await installBrowsers({
        names: ["chrome"],
        force: true,
        deps: {
          logger: () => {},
          browserDeps: { browsersModule },
        },
      });
      expect(reports[0].action).to.equal("forced");
      expect(reports[0].installedVersion).to.equal("121.0.0");
    });
  });

  describe("status", function () {
    it("reports all HEAVY_NPM_DEPS + all browser assets; browsers absent on an empty cache", function () {
      const rows = status({});
      const npmRows = rows.filter((r) => r.kind === "npm");
      const browserRows = rows.filter((r) => r.kind === "browser");
      expect(npmRows.length).to.be.greaterThan(0);
      expect(browserRows.length).to.equal(4);
      // Browsers only come from the cache/record (never the shim's
      // node_modules), so an empty cache means none are installed.
      for (const r of browserRows) expect(r.installed).to.equal(false);
      // npm packages count as installed when resolvable from the shim's
      // node_modules OR the cache — matching `install all`'s presence check
      // — even with an empty cache record. Assert status agrees with the
      // resolver rather than hard-coding env-dependent install state.
      for (const r of npmRows) {
        expect(r.installed).to.equal(Boolean(resolveHeavyDepSource(r.assetId)));
      }
    });

    it("never flags a shim-resolved package as outdated, even with a stale cache record", function () {
      // pngjs is declared as a heavy dep and present in this source
      // checkout's node_modules, so it resolves from the shim. The shim
      // wins over the cache at runtime and is never overridden, so a stale
      // cache record must NOT flag it outdated (regression: status consulted
      // the cache record before the shim).
      const source = resolveHeavyDepSource("pngjs");
      if (source !== "shim") this.skip();
      writeInstalledRecord(
        {
          npmPackages: {
            pngjs: { installedVersion: "1.0.0", installedAt: "2026-01-01T00:00:00Z" },
          },
          browsers: {},
        },
        {}
      );
      const rows = status({});
      const pngjs = rows.find((r) => r.assetId === "pngjs");
      expect(pngjs.installed).to.equal(true);
      // Reports the real shim version, not the stale "1.0.0" record, and
      // is not flagged outdated.
      expect(pngjs.installedVersion).to.be.a("string");
      expect(pngjs.installedVersion).to.not.equal("1.0.0");
      expect(pngjs.outdated).to.equal(false);
    });

    it("marks a browser row outdated when its installed buildId drifts from the channel", function () {
      // Browsers are never shim-resolved, so the cache record's freshness
      // check applies directly.
      writeInstalledRecord(
        {
          npmPackages: {},
          browsers: {
            chrome: {
              installedVersion: "100.0.0",
              installedAt: "2026-01-01T00:00:00Z",
              latestKnownVersion: "121.0.0",
            },
          },
        },
        {}
      );
      const rows = status({});
      const chrome = rows.find((r) => r.assetId === "chrome");
      expect(chrome.installed).to.equal(true);
      expect(chrome.outdated).to.equal(true);
    });
  });
});
