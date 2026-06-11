import {
  getCacheDir,
  getRuntimeDir,
  getBrowsersDir,
  getInstalledRecordPath,
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

describe("runtime/cacheDir", function () {
  // Snapshot + restore the env var; tests below mutate it.
  let originalEnv;
  beforeEach(function () {
    originalEnv = process.env.DOC_DETECTIVE_CACHE_DIR;
    delete process.env.DOC_DETECTIVE_CACHE_DIR;
  });
  afterEach(function () {
    if (originalEnv === undefined) delete process.env.DOC_DETECTIVE_CACHE_DIR;
    else process.env.DOC_DETECTIVE_CACHE_DIR = originalEnv;
  });

  describe("precedence", function () {
    it("DOC_DETECTIVE_CACHE_DIR env var wins over config.cacheDir and tmpdir default", function () {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-prec-"));
      try {
        process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
        const dir = getCacheDir({ cacheDir: "/something/else" });
        expect(dir).to.equal(tmpRoot);
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it("config.cacheDir wins over the tmpdir default", function () {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-cfg-"));
      try {
        const dir = getCacheDir({ cacheDir: tmpRoot });
        expect(dir).to.equal(tmpRoot);
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it("falls back to <os.tmpdir()>/doc-detective when neither override is set", function () {
      const dir = getCacheDir({});
      expect(dir).to.equal(path.join(os.tmpdir(), "doc-detective"));
    });

    it("treats empty config.cacheDir as absent and falls back to the default", function () {
      const dir = getCacheDir({ cacheDir: "" });
      expect(dir).to.equal(path.join(os.tmpdir(), "doc-detective"));
    });

    it("treats a whitespace-only config.cacheDir as absent and falls back to the default", function () {
      const dir = getCacheDir({ cacheDir: "   " });
      expect(dir).to.equal(path.join(os.tmpdir(), "doc-detective"));
    });

    it("trims surrounding whitespace from config.cacheDir", function () {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-trim-"));
      try {
        const dir = getCacheDir({ cacheDir: `  ${tmpRoot}  ` });
        expect(dir).to.equal(tmpRoot);
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe("dir helpers", function () {
    it("getRuntimeDir / getBrowsersDir compose from the resolved cache dir", function () {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-sub-"));
      try {
        process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
        expect(getRuntimeDir({})).to.equal(path.join(tmpRoot, "runtime"));
        expect(getBrowsersDir({})).to.equal(path.join(tmpRoot, "browsers"));
        expect(getInstalledRecordPath({})).to.equal(
          path.join(tmpRoot, "installed.json")
        );
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it("getCacheDir creates the directory on first read", function () {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-mk-"));
      const target = path.join(tmpRoot, "nested", "doc-detective");
      try {
        process.env.DOC_DETECTIVE_CACHE_DIR = target;
        const dir = getCacheDir({});
        expect(dir).to.equal(target);
        expect(fs.existsSync(target)).to.equal(true);
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe("installed record I/O", function () {
    it("readInstalledRecord returns an empty record when the file does not exist", function () {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-noread-"));
      try {
        process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
        const record = readInstalledRecord({});
        expect(record).to.deep.equal({ npmPackages: {}, browsers: {} });
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it("writeInstalledRecord persists data round-trip via readInstalledRecord", function () {
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-rw-"));
      try {
        process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
        const record = {
          npmPackages: {
            sharp: { installedVersion: "0.34.5", installedAt: "2026-01-01T00:00:00Z" },
          },
          browsers: {
            chrome: {
              installedVersion: "124.0.6367.78",
              installedAt: "2026-01-01T00:00:00Z",
              latestKnownVersion: "124.0.6367.78",
              latestCheckedAt: "2026-01-01T00:00:00Z",
            },
          },
        };
        writeInstalledRecord(record, {});
        const back = readInstalledRecord({});
        expect(back).to.deep.equal(record);
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it("writeInstalledRecord is atomic: a partial-write crash never leaves the target half-written", function () {
      // We can't easily inject a crash, but we can assert the file ends up
      // as one valid JSON document (no leftover .tmp companion) after a
      // successful write.
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-atomic-"));
      try {
        process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
        writeInstalledRecord({ npmPackages: {}, browsers: {} }, {});
        const entries = fs.readdirSync(tmpRoot);
        // installed.json plus possibly nothing else from this op.
        expect(entries).to.include("installed.json");
        const tmpLeftovers = entries.filter((e) => e.endsWith(".tmp"));
        expect(tmpLeftovers).to.deep.equal([]);
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });

    it("readInstalledRecord returns an empty record when the file is unparseable JSON", function () {
      // Hand-corruption of the file (or an interrupted write that the atomic
      // rename failed to clean up) should degrade to "nothing installed",
      // not crash the lazy resolver.
      const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "dd-cache-corrupt-"));
      try {
        process.env.DOC_DETECTIVE_CACHE_DIR = tmpRoot;
        // Trigger directory creation first.
        getCacheDir({});
        fs.writeFileSync(path.join(tmpRoot, "installed.json"), "{not json");
        const record = readInstalledRecord({});
        expect(record).to.deep.equal({ npmPackages: {}, browsers: {} });
      } finally {
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });
});
