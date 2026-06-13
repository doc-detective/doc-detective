import {
  ensureBrowserInstalled,
  getInstalledBrowsers,
  BROWSER_CHANNELS,
  requiredBrowserAssets,
} from "../dist/runtime/browsers.js";
import {
  readInstalledRecord,
  writeInstalledRecord,
} from "../dist/runtime/cacheDir.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

function makeFakeBrowsersModule({ latest = "100.0.0", onInstall, onUninstall } = {}) {
  const installs = [];
  const uninstalls = [];
  return {
    detectBrowserPlatform: () => "linux",
    resolveBuildId: async (browser, _platform, _channel) => latest,
    install: async (opts) => {
      installs.push(opts);
      if (onInstall) await onInstall(opts);
    },
    uninstall: async (opts) => {
      uninstalls.push(opts);
      if (onUninstall) await onUninstall(opts);
    },
    computeExecutablePath: ({ browser, buildId, cacheDir }) =>
      path.join(cacheDir, browser, buildId, "exe"),
    _calls: { installs, uninstalls },
  };
}

describe("runtime/browsers", function () {
  let originalEnv;
  let tmpRoot;
  beforeEach(function () {
    originalEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-browsers-"));
    process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
  });
  afterEach(function () {
    if (originalEnv === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
    else process.env.DOC_DETECTIVE_CACHE_DIR = originalEnv;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  describe("requiredBrowserAssets", function () {
    it("maps chrome to its browser + driver assets", function () {
      expect(requiredBrowserAssets("chrome")).to.deep.equal([
        "chrome",
        "chromedriver",
      ]);
    });

    it("maps chromium to the same assets as chrome", function () {
      expect(requiredBrowserAssets("chromium")).to.deep.equal([
        "chrome",
        "chromedriver",
      ]);
    });

    it("maps firefox to its browser + driver assets", function () {
      expect(requiredBrowserAssets("firefox")).to.deep.equal([
        "firefox",
        "geckodriver",
      ]);
    });

    it("returns no installable assets for safari (ships with the OS)", function () {
      expect(requiredBrowserAssets("safari")).to.deep.equal([]);
    });

    it("returns no installable assets for webkit (safari alias)", function () {
      expect(requiredBrowserAssets("webkit")).to.deep.equal([]);
    });

    it("is case-insensitive about the browser name", function () {
      expect(requiredBrowserAssets("FireFox")).to.deep.equal([
        "firefox",
        "geckodriver",
      ]);
    });

    it("returns no assets for an unknown or missing name", function () {
      expect(requiredBrowserAssets("edge")).to.deep.equal([]);
      expect(requiredBrowserAssets(undefined)).to.deep.equal([]);
      expect(requiredBrowserAssets("")).to.deep.equal([]);
    });
  });

  it("exports BROWSER_CHANNELS with the expected channel names", function () {
    expect(BROWSER_CHANNELS).to.deep.equal({
      chrome: "stable",
      firefox: "latest",
      chromedriver: "stable",
      geckodriver: "latest",
    });
  });

  it("ensureBrowserInstalled installs when nothing is recorded and records the install", async function () {
    const browsersModule = makeFakeBrowsersModule({ latest: "121.0.0" });
    const result = await ensureBrowserInstalled("chrome", {
      deps: { browsersModule, logger: () => {} },
    });
    expect(result.version).to.equal("121.0.0");
    expect(result.outdated).to.equal(false);
    expect(browsersModule._calls.installs).to.have.lengthOf(1);
    expect(browsersModule._calls.uninstalls).to.deep.equal([]);
    const record = readInstalledRecord({});
    expect(record.browsers.chrome.installedVersion).to.equal("121.0.0");
    expect(record.browsers.chrome.latestKnownVersion).to.equal("121.0.0");
  });

  it("ensureBrowserInstalled returns the fast-path cached result when freshness is current and versions match", async function () {
    // Pre-seed installed.json with a fresh latestCheckedAt and matching versions.
    writeInstalledRecord({
      npmPackages: {},
      browsers: {
        chrome: {
          installedVersion: "121.0.0",
          installedAt: "2026-01-01T00:00:00Z",
          latestKnownVersion: "121.0.0",
          latestCheckedAt: new Date().toISOString(),
        },
      },
    }, {});
    const browsersModule = makeFakeBrowsersModule({ latest: "999.0.0" });
    const result = await ensureBrowserInstalled("chrome", {
      deps: { browsersModule, logger: () => {} },
    });
    expect(result.version).to.equal("121.0.0");
    expect(result.outdated).to.equal(false);
    // Fast path: no install AND no resolveBuildId call.
    expect(browsersModule._calls.installs).to.deep.equal([]);
  });

  it("ensureBrowserInstalled warns (no install) when the installed version is older than the channel's current", async function () {
    writeInstalledRecord({
      npmPackages: {},
      browsers: {
        chrome: {
          installedVersion: "100.0.0",
          installedAt: "2026-01-01T00:00:00Z",
          latestKnownVersion: "100.0.0",
          latestCheckedAt: "2020-01-01T00:00:00Z", // stale → resolves channel
        },
      },
    }, {});
    const browsersModule = makeFakeBrowsersModule({ latest: "124.0.0" });
    const warnings = [];
    const logger = (msg, level) => {
      if (level === "warn") warnings.push(msg);
    };
    const result = await ensureBrowserInstalled("chrome", {
      deps: { browsersModule, logger },
    });
    expect(result.version).to.equal("100.0.0");
    expect(result.outdated).to.equal(true);
    expect(browsersModule._calls.installs).to.deep.equal([]);
    expect(warnings.length).to.equal(1);
    expect(warnings[0]).to.include("doc-detective install browsers chrome --force");
    // Freshness record updated even though we didn't install.
    const record = readInstalledRecord({});
    expect(record.browsers.chrome.latestKnownVersion).to.equal("124.0.0");
  });

  it("ensureBrowserInstalled with force replaces the old buildId and prunes it", async function () {
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
    const browsersModule = makeFakeBrowsersModule({ latest: "124.0.0" });
    const result = await ensureBrowserInstalled("chrome", {
      deps: { browsersModule, logger: () => {} },
      force: true,
    });
    expect(result.version).to.equal("124.0.0");
    expect(browsersModule._calls.installs).to.have.lengthOf(1);
    expect(browsersModule._calls.uninstalls).to.have.lengthOf(1);
    expect(browsersModule._calls.uninstalls[0].buildId).to.equal("100.0.0");
    const record = readInstalledRecord({});
    expect(record.browsers.chrome.installedVersion).to.equal("124.0.0");
  });

  it("ensureBrowserInstalled with no record but resolveBuildId fails surfaces the error", async function () {
    const browsersModule = makeFakeBrowsersModule();
    browsersModule.resolveBuildId = async () => {
      throw new Error("network down");
    };
    try {
      await ensureBrowserInstalled("chrome", {
        deps: { browsersModule, logger: () => {} },
      });
      throw new Error("expected throw");
    } catch (err) {
      expect(String(err.message)).to.match(/network down/);
    }
  });

  it("ensureBrowserInstalled with stale freshness but resolveBuildId failing falls back to the installed version", async function () {
    writeInstalledRecord({
      npmPackages: {},
      browsers: {
        chrome: {
          installedVersion: "100.0.0",
          installedAt: "2026-01-01T00:00:00Z",
          latestKnownVersion: "100.0.0",
          latestCheckedAt: "2020-01-01T00:00:00Z",
        },
      },
    }, {});
    const browsersModule = makeFakeBrowsersModule();
    browsersModule.resolveBuildId = async () => {
      throw new Error("network down");
    };
    const result = await ensureBrowserInstalled("chrome", {
      deps: { browsersModule, logger: () => {} },
    });
    expect(result.version).to.equal("100.0.0");
    expect(result.outdated).to.equal(false);
  });

  it("getInstalledBrowsers reads from the cache record", function () {
    writeInstalledRecord({
      npmPackages: {},
      browsers: {
        chrome: {
          installedVersion: "121.0.0",
          installedAt: "2026-01-01T00:00:00Z",
          latestKnownVersion: "124.0.0",
        },
        firefox: {
          installedVersion: "133.0",
          installedAt: "2026-01-01T00:00:00Z",
        },
      },
    }, {});
    const installed = getInstalledBrowsers({});
    expect(installed.map((b) => b.name).sort()).to.deep.equal(["chrome", "firefox"]);
    const chrome = installed.find((b) => b.name === "chrome");
    expect(chrome.installedVersion).to.equal("121.0.0");
    expect(chrome.latestKnownVersion).to.equal("124.0.0");
  });

  it("ensureBrowserInstalled('geckodriver') uses the geckodriver module and writes the record", async function () {
    const downloads = [];
    const geckodriverModule = {
      GECKODRIVER_VERSION: "0.36.0",
      download: async () => {
        downloads.push("ok");
        return { version: "0.36.0" };
      },
    };
    const result = await ensureBrowserInstalled("geckodriver", {
      deps: { geckodriverModule, logger: () => {} },
    });
    expect(downloads).to.have.lengthOf(1);
    expect(result.version).to.equal("0.36.0");
    const record = readInstalledRecord({});
    expect(record.browsers.geckodriver.installedVersion).to.equal("0.36.0");
  });
});
