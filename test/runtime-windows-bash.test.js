// Hermetic unit tests for the Windows Git Bash runtime asset
// (src/runtime/windowsBash.ts). Every effectful edge — platform, env, fs
// probes, bash verification, `where.exe git`, and the MinGit download — is
// injected through deps, so no test touches the network or the real cache.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  MINGIT_VERSION,
  getCachedBashPath,
  resolveWindowsBash,
  installBash,
} from "../dist/runtime/windowsBash.js";

// A throwaway cache dir per test run; only path shapes are exercised, plus
// installed-record writes from the injected-install path. Lives under the
// gitignored repo-root .tmp/ per CLAUDE.md ("Testing behavior") rather than
// the system temp dir.
function tmpCacheDir() {
  const scratchRoot = path.resolve("./.tmp");
  fs.mkdirSync(scratchRoot, { recursive: true });
  return fs.mkdtempSync(path.join(scratchRoot, "dd-bash-test-"));
}

// Build a deps object where only the named seams do anything.
function makeDeps(overrides = {}) {
  return {
    platform: "win32",
    env: {},
    fileExists: () => false,
    verifyBash: async () => true,
    whereGit: async () => [],
    installMinGit: async () => {
      throw new Error("installMinGit should not run in this test");
    },
    ...overrides,
  };
}

describe("runtime/windowsBash", function () {
  let cacheDir;
  beforeEach(function () {
    cacheDir = tmpCacheDir();
  });
  afterEach(function () {
    fs.rmSync(cacheDir, { recursive: true, force: true });
  });

  describe("getCachedBashPath", function () {
    it("points inside <cacheDir>/tools/git-bash/<version>", function () {
      const p = getCachedBashPath({ cacheDir });
      assert.ok(p.startsWith(path.join(cacheDir, "tools", "git-bash")), p);
      assert.ok(p.includes(MINGIT_VERSION), p);
      assert.ok(p.endsWith(path.join("usr", "bin", "bash.exe")), p);
    });
  });

  describe("resolveWindowsBash", function () {
    it("rejects off Windows", async function () {
      await assert.rejects(
        resolveWindowsBash({ cacheDir, deps: makeDeps({ platform: "linux" }) }),
        /only .*Windows/i
      );
    });

    it("returns the cached bash when present and verifying", async function () {
      const cached = getCachedBashPath({ cacheDir });
      const deps = makeDeps({
        fileExists: (p) => p === cached,
        verifyBash: async (p) => p === cached,
      });
      assert.equal(await resolveWindowsBash({ cacheDir, deps }), cached);
    });

    it("prefers an existing Git for Windows derived from `where git`", async function () {
      const gitExe = "C:\\Program Files\\Git\\cmd\\git.exe";
      const bashExe = "C:\\Program Files\\Git\\bin\\bash.exe";
      const deps = makeDeps({
        whereGit: async () => [gitExe],
        fileExists: (p) => p === bashExe,
      });
      assert.equal(await resolveWindowsBash({ cacheDir, deps }), bashExe);
    });

    it("never returns a System32 (WSL launcher) bash", async function () {
      // Defensive: even if a probe surfaced a System32-rooted location, it
      // must be filtered rather than returned.
      const wslLike = "C:\\Windows\\System32\\git.exe";
      const deps = makeDeps({
        whereGit: async () => [wslLike],
        fileExists: (p) => p.toLowerCase().includes("system32"),
        installMinGit: async () => {},
      });
      await assert.rejects(
        resolveWindowsBash({ cacheDir, autoInstall: false, deps })
      );
    });

    it("falls back to well-known install locations from env", async function () {
      const bashExe = "C:\\Users\\u\\AppData\\Local\\Programs\\Git\\bin\\bash.exe";
      const deps = makeDeps({
        env: { LOCALAPPDATA: "C:\\Users\\u\\AppData\\Local" },
        fileExists: (p) => p === bashExe,
      });
      assert.equal(await resolveWindowsBash({ cacheDir, deps }), bashExe);
    });

    it("skips a candidate that exists but fails verification", async function () {
      const brokenBash = "C:\\Program Files\\Git\\bin\\bash.exe";
      const cached = getCachedBashPath({ cacheDir });
      let installed = false;
      const deps = makeDeps({
        whereGit: async () => ["C:\\Program Files\\Git\\cmd\\git.exe"],
        fileExists: (p) => p === brokenBash || (installed && p === cached),
        verifyBash: async (p) => p !== brokenBash,
        installMinGit: async () => {
          installed = true;
        },
      });
      assert.equal(await resolveWindowsBash({ cacheDir, deps }), cached);
      assert.equal(installed, true);
    });

    it("installs MinGit into the cache when nothing resolves", async function () {
      const cached = getCachedBashPath({ cacheDir });
      const installCalls = [];
      let installed = false;
      const deps = makeDeps({
        fileExists: (p) => installed && p === cached,
        installMinGit: async (destDir) => {
          installCalls.push(destDir);
          installed = true;
        },
      });
      assert.equal(await resolveWindowsBash({ cacheDir, deps }), cached);
      assert.equal(installCalls.length, 1);
      assert.equal(installCalls[0], path.dirname(path.dirname(path.dirname(cached))));
    });

    it("re-installs when the cached bash is broken", async function () {
      const cached = getCachedBashPath({ cacheDir });
      let installed = false;
      const deps = makeDeps({
        fileExists: (p) => p === cached,
        verifyBash: async () => {
          // Broken until the (re)install fires, healthy after.
          return installed;
        },
        installMinGit: async () => {
          installed = true;
        },
      });
      assert.equal(await resolveWindowsBash({ cacheDir, deps }), cached);
      assert.equal(installed, true);
    });

    it("throws an actionable error when autoInstall is off and nothing resolves", async function () {
      const deps = makeDeps();
      await assert.rejects(
        resolveWindowsBash({ cacheDir, autoInstall: false, deps }),
        /doc-detective install bash/
      );
    });

    it("dedupes concurrent installs", async function () {
      const cached = getCachedBashPath({ cacheDir });
      let installs = 0;
      let installed = false;
      const deps = makeDeps({
        fileExists: (p) => installed && p === cached,
        installMinGit: async () => {
          installs += 1;
          await new Promise((resolve) => setTimeout(resolve, 50));
          installed = true;
        },
      });
      const [a, b] = await Promise.all([
        resolveWindowsBash({ cacheDir, deps }),
        resolveWindowsBash({ cacheDir, deps }),
      ]);
      assert.equal(a, cached);
      assert.equal(b, cached);
      assert.equal(installs, 1);
    });
  });

  describe("installBash", function () {
    it("reports skipped off Windows", async function () {
      const reports = await installBash({
        ctx: { cacheDir },
        deps: makeDeps({ platform: "darwin" }),
      });
      assert.equal(reports.length, 1);
      assert.equal(reports[0].kind, "tool");
      assert.equal(reports[0].action, "skipped");
    });

    it("reports dry-run without installing", async function () {
      const reports = await installBash({
        dryRun: true,
        ctx: { cacheDir },
        deps: makeDeps(),
      });
      assert.equal(reports[0].action, "dry-run");
    });

    it("reports already-up-to-date when a bash resolves", async function () {
      const cached = getCachedBashPath({ cacheDir });
      const reports = await installBash({
        ctx: { cacheDir },
        deps: makeDeps({
          fileExists: (p) => p === cached,
        }),
      });
      assert.equal(reports[0].action, "already-up-to-date");
    });

    it("installs when nothing resolves", async function () {
      const cached = getCachedBashPath({ cacheDir });
      let installed = false;
      const reports = await installBash({
        ctx: { cacheDir },
        deps: makeDeps({
          fileExists: (p) => installed && p === cached,
          installMinGit: async () => {
            installed = true;
          },
        }),
      });
      assert.equal(reports[0].action, "installed");
      assert.equal(installed, true);
    });

    it("force reinstalls even when a bash resolves", async function () {
      const cached = getCachedBashPath({ cacheDir });
      let installs = 0;
      const reports = await installBash({
        force: true,
        ctx: { cacheDir },
        deps: makeDeps({
          fileExists: (p) => p === cached,
          installMinGit: async () => {
            installs += 1;
          },
        }),
      });
      assert.equal(reports[0].action, "forced");
      assert.equal(installs, 1);
    });
  });
});
