import {
  detectPlatform,
  getPlatformKey,
  assetFilenames,
  assetBaseUrl,
  assetUrl,
  parsePrewarmManifest,
  evaluateManifestMatch,
  isPrebuiltOptedOut,
  readPrewarmAttempts,
  recordPrewarmAttempt,
} from "../dist/runtime/prewarm.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

// A glibc process.report stub for injection.
function glibcReport(version) {
  return { header: { glibcVersionRuntime: version } };
}

describe("runtime/prewarm (pure core)", function () {
  describe("detectPlatform / getPlatformKey", function () {
    it("linux + glibc ⇒ key linux-<arch>-glibc-<major.minor>", function () {
      const p = detectPlatform({
        platform: "linux",
        arch: "x64",
        getReport: () => glibcReport("2.39"),
      });
      expect(p.os).to.equal("linux");
      expect(p.arch).to.equal("x64");
      expect(p.libc).to.equal("glibc");
      expect(p.osVersion).to.equal("2.39");
      expect(p.key).to.equal("linux-x64-glibc-2.39");
      expect(getPlatformKey({
        platform: "linux",
        arch: "x64",
        getReport: () => glibcReport("2.39"),
      })).to.equal("linux-x64-glibc-2.39");
    });

    it("linux glibc version is truncated to major.minor", function () {
      const p = detectPlatform({
        platform: "linux",
        arch: "arm64",
        getReport: () => glibcReport("2.35.1"),
      });
      expect(p.osVersion).to.equal("2.35");
      expect(p.key).to.equal("linux-arm64-glibc-2.35");
    });

    it("linux without glibc (musl/absent) ⇒ key null, libc null", function () {
      const p = detectPlatform({
        platform: "linux",
        arch: "x64",
        getReport: () => ({ header: {} }),
      });
      expect(p.libc).to.equal(null);
      expect(p.key).to.equal(null);
    });

    it("darwin ⇒ key darwin-<arch>-<release-major>, libc null", function () {
      const p = detectPlatform({
        platform: "darwin",
        arch: "arm64",
        osRelease: () => "24.1.0",
      });
      expect(p.libc).to.equal(null);
      expect(p.osVersion).to.equal("24");
      expect(p.key).to.equal("darwin-arm64-24");
    });

    it("win32 ⇒ key win32-<arch>-<release-major>, libc null", function () {
      const p = detectPlatform({
        platform: "win32",
        arch: "x64",
        osRelease: () => "10.0.26200",
      });
      expect(p.libc).to.equal(null);
      expect(p.osVersion).to.equal("10");
      expect(p.key).to.equal("win32-x64-10");
    });

    it("unknown platform ⇒ key null", function () {
      const p = detectPlatform({ platform: "sunos", arch: "x64" });
      expect(p.key).to.equal(null);
    });
  });

  describe("assetFilenames / assetBaseUrl / assetUrl", function () {
    it("builds archive + manifest filenames per kind/key", function () {
      expect(assetFilenames("runtime", "linux-x64-glibc-2.39")).to.deep.equal({
        archive: "prewarm-runtime-linux-x64-glibc-2.39.tar.gz",
        manifest: "prewarm-runtime-linux-x64-glibc-2.39.manifest.json",
      });
      expect(assetFilenames("browsers", "darwin-arm64-24")).to.deep.equal({
        archive: "prewarm-browsers-darwin-arm64-24.tar.gz",
        manifest: "prewarm-browsers-darwin-arm64-24.manifest.json",
      });
    });

    it("default base URL targets the GitHub release download path", function () {
      const base = assetBaseUrl("4.25.1", {});
      expect(base).to.equal(
        "https://github.com/doc-detective/doc-detective/releases/download/v4.25.1/"
      );
    });

    it("DOC_DETECTIVE_PREBUILT_BASE_URL override is honored and trailing-slash tolerant", function () {
      expect(assetBaseUrl("4.25.1", { DOC_DETECTIVE_PREBUILT_BASE_URL: "http://127.0.0.1:9/" }))
        .to.equal("http://127.0.0.1:9/");
      expect(assetBaseUrl("4.25.1", { DOC_DETECTIVE_PREBUILT_BASE_URL: "http://127.0.0.1:9" }))
        .to.equal("http://127.0.0.1:9/");
    });

    it("assetUrl composes base + filenames", function () {
      const urls = assetUrl("4.25.1", "runtime", "linux-x64-glibc-2.39", {
        DOC_DETECTIVE_PREBUILT_BASE_URL: "http://localhost:1234/",
      });
      expect(urls.archive).to.equal(
        "http://localhost:1234/prewarm-runtime-linux-x64-glibc-2.39.tar.gz"
      );
      expect(urls.manifest).to.equal(
        "http://localhost:1234/prewarm-runtime-linux-x64-glibc-2.39.manifest.json"
      );
    });
  });

  describe("isPrebuiltOptedOut", function () {
    it("treats 0/false/no/off (any case) as opted out", function () {
      for (const v of ["0", "false", "FALSE", "no", "No", "off", "OFF", " off "]) {
        expect(isPrebuiltOptedOut({ DOC_DETECTIVE_PREBUILT: v }), v).to.equal(true);
      }
    });

    it("treats unset / other values as enabled", function () {
      expect(isPrebuiltOptedOut({})).to.equal(false);
      expect(isPrebuiltOptedOut({ DOC_DETECTIVE_PREBUILT: "1" })).to.equal(false);
      expect(isPrebuiltOptedOut({ DOC_DETECTIVE_PREBUILT: "true" })).to.equal(false);
      expect(isPrebuiltOptedOut({ DOC_DETECTIVE_PREBUILT: "" })).to.equal(false);
    });
  });

  describe("parsePrewarmManifest", function () {
    const validRuntime = {
      schemaVersion: 1,
      ddVersion: "4.25.1",
      kind: "runtime",
      platform: { os: "linux", arch: "x64", libc: "glibc", osVersion: "2.39" },
      node: { builtWith: "22.12.0" },
      createdAt: "2026-07-07T00:00:00.000Z",
      archive: {
        filename: "prewarm-runtime-linux-x64-glibc-2.39.tar.gz",
        sha256: "abc123",
        bytes: 100,
        format: "tar.gz",
        rootDir: "runtime",
      },
      npmPackages: { sharp: "0.35.2" },
    };

    it("parses a valid runtime manifest", function () {
      const m = parsePrewarmManifest(JSON.stringify(validRuntime));
      expect(m).to.not.equal(null);
      expect(m.kind).to.equal("runtime");
      expect(m.npmPackages.sharp).to.equal("0.35.2");
      expect(m.archive.rootDir).to.equal("runtime");
    });

    it("parses a valid browsers manifest with per-browser versions", function () {
      const browsers = {
        ...validRuntime,
        kind: "browsers",
        npmPackages: undefined,
        browsers: { chrome: { installedVersion: "121.0.0" } },
        archive: { ...validRuntime.archive, rootDir: "browsers" },
      };
      const m = parsePrewarmManifest(browsers);
      expect(m).to.not.equal(null);
      expect(m.kind).to.equal("browsers");
      expect(m.browsers.chrome.installedVersion).to.equal("121.0.0");
    });

    it("rejects schemaVersion !== 1", function () {
      expect(parsePrewarmManifest({ ...validRuntime, schemaVersion: 2 })).to.equal(null);
      expect(parsePrewarmManifest({ ...validRuntime, schemaVersion: "1" })).to.equal(null);
    });

    it("rejects wrong shape (missing archive, bad kind, non-JSON)", function () {
      expect(parsePrewarmManifest("{ not json")).to.equal(null);
      expect(parsePrewarmManifest({ ...validRuntime, archive: undefined })).to.equal(null);
      expect(parsePrewarmManifest({ ...validRuntime, kind: "other" })).to.equal(null);
      expect(parsePrewarmManifest({ ...validRuntime, platform: undefined })).to.equal(null);
      expect(parsePrewarmManifest({ ...validRuntime, archive: { ...validRuntime.archive, format: "zip" } })).to.equal(null);
    });
  });

  describe("evaluateManifestMatch", function () {
    function runtimeManifest(overrides = {}) {
      return parsePrewarmManifest({
        schemaVersion: 1,
        ddVersion: "4.25.1",
        kind: "runtime",
        platform: { os: "linux", arch: "x64", libc: "glibc", osVersion: "2.39" },
        node: { builtWith: "22.12.0" },
        createdAt: "2026-07-07T00:00:00.000Z",
        archive: { filename: "a.tar.gz", sha256: "x", bytes: 1, format: "tar.gz", rootDir: "runtime" },
        npmPackages: { sharp: "0.35.2", ...overrides.npmPackages },
      });
    }
    const platform = { os: "linux", arch: "x64", libc: "glibc", osVersion: "2.39" };
    // A declaredVersionFor that satisfies sharp's pin and every required heavy
    // dep the checklist demands.
    const declaredVersionFor = (name) => {
      const table = {
        sharp: "^0.35.2",
        webdriverio: "^9.29.0",
        appium: "^3.5.2",
        "appium-chromium-driver": "^3.0.2",
        "appium-geckodriver": "^3.0.6",
        "appium-safari-driver": "^5.0.2",
        "appium-xcuitest-driver": "^10.6.0",
        "@ffmpeg-installer/ffmpeg": "^1.1.0",
        "@puppeteer/browsers": "^3.0.5",
        geckodriver: "^6.1.0",
        pixelmatch: "^7.2.0",
        pngjs: "^7.0.0",
        "proxy-agent": "^8.0.2",
      };
      if (!(name in table)) throw new Error(`undeclared ${name}`);
      return table[name];
    };
    // A manifest that pins every required heavy dep (so the "present" check passes).
    function fullRuntimeManifest() {
      const npmPackages = {
        sharp: "0.35.2",
        webdriverio: "9.29.0",
        appium: "3.5.2",
        "appium-chromium-driver": "3.0.2",
        "appium-geckodriver": "3.0.6",
        "appium-safari-driver": "5.0.2",
        "appium-xcuitest-driver": "10.6.0",
        "@ffmpeg-installer/ffmpeg": "1.1.0",
        "@puppeteer/browsers": "3.0.5",
        geckodriver: "6.1.0",
        pixelmatch: "7.2.0",
        pngjs: "7.0.0",
        "proxy-agent": "8.0.2",
      };
      return parsePrewarmManifest({
        schemaVersion: 1,
        ddVersion: "4.25.1",
        kind: "runtime",
        platform,
        node: { builtWith: "22.12.0" },
        createdAt: "2026-07-07T00:00:00.000Z",
        archive: { filename: "a.tar.gz", sha256: "x", bytes: 1, format: "tar.gz", rootDir: "runtime" },
        npmPackages,
      });
    }

    it("passes when version + platform + pins all match and all required deps present", function () {
      const res = evaluateManifestMatch(fullRuntimeManifest(), {
        ddVersion: "4.25.1",
        platform,
        kind: "runtime",
        declaredVersionFor,
      });
      expect(res.ok).to.equal(true);
    });

    it("fails on ddVersion mismatch", function () {
      const res = evaluateManifestMatch(fullRuntimeManifest(), {
        ddVersion: "4.25.2",
        platform,
        kind: "runtime",
        declaredVersionFor,
      });
      expect(res.ok).to.equal(false);
      expect(res.reason).to.match(/ddVersion mismatch/);
    });

    it("fails on platform mismatch (osVersion differs)", function () {
      const res = evaluateManifestMatch(fullRuntimeManifest(), {
        ddVersion: "4.25.1",
        platform: { ...platform, osVersion: "2.35" },
        kind: "runtime",
        declaredVersionFor,
      });
      expect(res.ok).to.equal(false);
      expect(res.reason).to.match(/platform mismatch/);
    });

    it("fails on kind mismatch", function () {
      const res = evaluateManifestMatch(fullRuntimeManifest(), {
        ddVersion: "4.25.1",
        platform,
        kind: "browsers",
        declaredVersionFor,
      });
      expect(res.ok).to.equal(false);
      expect(res.reason).to.match(/kind mismatch/);
    });

    it("fails when a pin is outside the shim's declared range", function () {
      const m = runtimeManifest({ npmPackages: { sharp: "0.35.2" } });
      // Declared range wants ^0.36.0 but pin is 0.35.2 → outside.
      const res = evaluateManifestMatch(m, {
        ddVersion: "4.25.1",
        platform,
        kind: "runtime",
        declaredVersionFor: (name) => (name === "sharp" ? "^0.36.0" : declaredVersionFor(name)),
      });
      expect(res.ok).to.equal(false);
      expect(res.reason).to.match(/outside declared range/);
    });

    it("fails when a required heavy dep is missing from the manifest", function () {
      // Only sharp pinned → webdriverio (required, non-best-effort) missing.
      const m = runtimeManifest();
      const res = evaluateManifestMatch(m, {
        ddVersion: "4.25.1",
        platform,
        kind: "runtime",
        declaredVersionFor,
      });
      expect(res.ok).to.equal(false);
      expect(res.reason).to.match(/missing required heavy dep/);
    });

    it("browsers kind skips the npm-pin checks", function () {
      const m = parsePrewarmManifest({
        schemaVersion: 1,
        ddVersion: "4.25.1",
        kind: "browsers",
        platform,
        node: { builtWith: "22.12.0" },
        createdAt: "2026-07-07T00:00:00.000Z",
        archive: { filename: "b.tar.gz", sha256: "x", bytes: 1, format: "tar.gz", rootDir: "browsers" },
        browsers: { chrome: { installedVersion: "121.0.0" } },
      });
      const res = evaluateManifestMatch(m, {
        ddVersion: "4.25.1",
        platform,
        kind: "browsers",
        declaredVersionFor,
      });
      expect(res.ok).to.equal(true);
    });
  });

  describe("sentinel (prewarm-attempts.json)", function () {
    let tmpRoot;
    let originalEnv;
    beforeEach(function () {
      originalEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
      tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-prewarm-"));
      process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
    });
    afterEach(function () {
      if (originalEnv === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
      else process.env.DOC_DETECTIVE_CACHE_DIR = originalEnv;
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    });

    it("round-trips a recorded attempt keyed by (kind, ddVersion)", function () {
      expect(readPrewarmAttempts({}).attempts).to.deep.equal({});
      recordPrewarmAttempt({}, "runtime", "4.25.1", "sha-mismatch");
      const after = readPrewarmAttempts({});
      expect(after.attempts["runtime:4.25.1"]).to.be.an("object");
      expect(after.attempts["runtime:4.25.1"].outcome).to.equal("sha-mismatch");
      expect(after.attempts["runtime:4.25.1"].at).to.be.a("string");
      // Different kind / version is a distinct key.
      expect(after.attempts["browsers:4.25.1"]).to.equal(undefined);
    });

    it("preserves prior entries when recording another", function () {
      recordPrewarmAttempt({}, "runtime", "4.25.1", "not-found");
      recordPrewarmAttempt({}, "browsers", "4.25.1", "verify-failed");
      const after = readPrewarmAttempts({});
      expect(after.attempts["runtime:4.25.1"].outcome).to.equal("not-found");
      expect(after.attempts["browsers:4.25.1"].outcome).to.equal("verify-failed");
    });

    it("returns an empty record when the file is missing or corrupt", function () {
      expect(readPrewarmAttempts({}).attempts).to.deep.equal({});
      fs.writeFileSync(path.join(tmpRoot, "prewarm-attempts.json"), "{ not json");
      expect(readPrewarmAttempts({}).attempts).to.deep.equal({});
    });
  });
});
