import {
  checkForUpdate,
  compareVersions,
  detectInstallMode,
  selfUpdate,
} from "../dist/runtime/selfUpdate.js";
import { EventEmitter } from "node:events";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

function fakeHttp(payload, { throws } = {}) {
  return {
    get: async () => {
      if (throws) throw throws;
      return { data: payload };
    },
  };
}

function fakeSpawner({ exitCode = 0 } = {}) {
  const calls = [];
  const fn = (cmd, args, opts) => {
    calls.push({ cmd, args, opts });
    const child = new EventEmitter();
    setImmediate(() => child.emit("close", exitCode));
    return child;
  };
  fn.calls = calls;
  return fn;
}

describe("runtime/selfUpdate", function () {
  describe("compareVersions", function () {
    it("returns 0 for equal versions", function () {
      expect(compareVersions("4.5.0", "4.5.0")).to.equal(0);
    });
    it("returns negative when a < b", function () {
      expect(compareVersions("4.5.0", "4.5.1")).to.be.lessThan(0);
      expect(compareVersions("4.4.9", "4.5.0")).to.be.lessThan(0);
      expect(compareVersions("3.9.9", "4.0.0")).to.be.lessThan(0);
    });
    it("returns positive when a > b", function () {
      expect(compareVersions("4.6.0", "4.5.0")).to.be.greaterThan(0);
    });
    it("treats a release as greater than a prerelease of the same core", function () {
      expect(compareVersions("4.5.0", "4.5.0-next.1")).to.be.greaterThan(0);
      expect(compareVersions("4.5.0-next.1", "4.5.0")).to.be.lessThan(0);
    });
    it("orders prerelease numeric identifiers numerically, not lexically", function () {
      // The pre-fix behavior compared "next.10" < "next.2" lexically and
      // would have flipped this assertion. Semver semantics: numeric IDs
      // compare numerically; numeric ranks lower than alphanumeric; a
      // shorter set with all-equal shared IDs ranks lower.
      expect(compareVersions("4.5.0-next.2", "4.5.0-next.10")).to.be.lessThan(0);
      expect(compareVersions("4.5.0-next.10", "4.5.0-next.2")).to.be.greaterThan(0);
      expect(compareVersions("4.5.0-next", "4.5.0-next.1")).to.be.lessThan(0);
      // Numeric vs alphanumeric — numeric ranks lower.
      expect(compareVersions("4.5.0-alpha.1", "4.5.0-1")).to.be.greaterThan(0);
    });
    it("orders two alphanumeric prerelease identifiers lexically", function () {
      // Both identifiers non-numeric -> the a<b / a>b lexical arms.
      expect(compareVersions("1.0.0-beta", "1.0.0-alpha")).to.be.greaterThan(0);
      expect(compareVersions("1.0.0-alpha", "1.0.0-beta")).to.be.lessThan(0);
    });
  });

  describe("checkForUpdate", function () {
    it("returns { newer: true } when the registry's dist-tags.latest is higher", async function () {
      const http = fakeHttp({ "dist-tags": { latest: "4.6.0" } });
      const res = await checkForUpdate("4.5.0", { http, logger: () => {} });
      expect(res.newer).to.equal(true);
      expect(res.latest).to.equal("4.6.0");
    });

    it("returns { newer: false } when the registry's latest matches the running version", async function () {
      const http = fakeHttp({ "dist-tags": { latest: "4.5.0" } });
      const res = await checkForUpdate("4.5.0", { http, logger: () => {} });
      expect(res.newer).to.equal(false);
    });

    it("returns { newer: false } when the registry call throws", async function () {
      const http = fakeHttp(null, { throws: new Error("network down") });
      const res = await checkForUpdate("4.5.0", { http, logger: () => {} });
      expect(res.newer).to.equal(false);
      expect(res.latest).to.equal(null);
    });

    it("returns { newer: false } when the registry response shape is malformed", async function () {
      const http = fakeHttp({ "dist-tags": {} });
      const res = await checkForUpdate("4.5.0", { http, logger: () => {} });
      expect(res.newer).to.equal(false);
    });

    it("falls back to the default logger when deps.logger is omitted", async function () {
      // Exercises the `deps.logger ?? defaultLogger` fallback with an injected
      // http so no real network call happens.
      const http = fakeHttp({ "dist-tags": { latest: "4.6.0" } });
      const res = await checkForUpdate("4.5.0", { http });
      expect(res.newer).to.equal(true);
      expect(res.latest).to.equal("4.6.0");
    });
  });

  describe("detectInstallMode", function () {
    // Save/restore process.argv[1] + npm_execpath around each classifier probe.
    // Paths use forward slashes so the `split(path.sep).join("/")` normalization
    // yields the same result on both the POSIX and Windows CI legs.
    let savedArgv, savedExecpath;
    beforeEach(function () {
      savedArgv = process.argv;
      savedExecpath = process.env.npm_execpath;
    });
    afterEach(function () {
      process.argv = savedArgv;
      if (savedExecpath === undefined) delete process.env.npm_execpath;
      else process.env.npm_execpath = savedExecpath;
    });

    it("returns a string from the canonical set", function () {
      const mode = detectInstallMode();
      expect(["global", "local", "npx", "unknown"]).to.include(mode);
    });

    it("returns 'unknown' when process.argv[1] is absent (the ?? '' fallback)", function () {
      process.argv = [process.argv[0]];
      delete process.env.npm_execpath;
      expect(detectInstallMode()).to.equal("unknown");
    });

    it("detects npx via npm_execpath when the entry path isn't an _npx path", function () {
      process.argv = [process.argv[0], "/home/u/project/bin/doc-detective.js"];
      process.env.npm_execpath =
        "/home/u/.npm/_cache/_npx/abc/node_modules/npm/bin/npx-cli.js";
      expect(detectInstallMode()).to.equal("npx");
    });

    it("detects a Windows global install via the AppData npm path", function () {
      process.argv = [
        process.argv[0],
        "/c/users/u/appdata/roaming/npm/node_modules/doc-detective/bin.js",
      ];
      delete process.env.npm_execpath;
      expect(detectInstallMode()).to.equal("global");
    });

    it("detects a global install under an .npm-global prefix", function () {
      process.argv = [process.argv[0], "/home/u/.npm-global/doc-detective/bin.js"];
      delete process.env.npm_execpath;
      expect(detectInstallMode()).to.equal("global");
    });
  });

  describe("selfUpdate", function () {
    it("local mode logs an info hint and returns updated:false without exiting", async function () {
      const infos = [];
      const spawner = fakeSpawner();
      const result = await selfUpdate("4.6.0", "local", {
        logger: (msg, lvl) => {
          if (lvl === "info" || lvl === undefined) infos.push(msg);
        },
        spawn: spawner,
      });
      expect(result.updated).to.equal(false);
      expect(spawner.calls).to.deep.equal([]);
      expect(infos.length).to.be.greaterThan(0);
      expect(infos[0]).to.include("doc-detective@4.6.0");
    });

    it("unknown mode behaves like local — log + return, no spawn", async function () {
      const spawner = fakeSpawner();
      const result = await selfUpdate("4.6.0", "unknown", {
        logger: () => {},
        spawn: spawner,
      });
      expect(result.updated).to.equal(false);
      expect(spawner.calls).to.deep.equal([]);
    });

    it("refuses to self-update when latestVersion contains non-semver characters", async function () {
      // A compromised registry could return a value with shell
      // metacharacters that would reach cmd.exe via the .cmd spawn's
      // shell:true on Windows. The validator must bail out before
      // spawning anything.
      const spawner = fakeSpawner();
      const errors = [];
      const result = await selfUpdate("4.6.0; rm -rf /", "global", {
        logger: (msg, lvl) => {
          if (lvl === "error") errors.push(msg);
        },
        spawn: spawner,
      });
      expect(result.updated).to.equal(false);
      expect(spawner.calls).to.deep.equal([]);
      expect(errors.length).to.equal(1);
      expect(errors[0]).to.match(/semver charset/);
    });

    it("resolves the default logger and spawner when deps are omitted (local mode)", async function () {
      // Exercises the `?? defaultLogger` and `?? nodeSpawn` fallbacks. local
      // mode returns before spawning, so the real nodeSpawn is never invoked.
      const result = await selfUpdate("4.6.0", "local");
      expect(result.updated).to.equal(false);
      expect(result.reexec).to.equal(false);
    });

    it("treats a null child close code as exit 1 (npx re-exec path)", async function () {
      // runChild resolves `code ?? 1`; a child that closes with a null code
      // (killed by signal) must resolve to 1. The npx path calls process.exit
      // with that code, so stub process.exit to capture it without killing the
      // runner.
      const savedExit = process.exit;
      const nullSpawner = () => {
        const child = new EventEmitter();
        setImmediate(() => child.emit("close", null));
        return child;
      };
      let exitArg;
      try {
        process.exit = (code) => {
          exitArg = code;
        };
        await selfUpdate("4.6.0", "npx", { logger: () => {}, spawn: nullSpawner });
      } finally {
        process.exit = savedExit;
      }
      expect(exitArg).to.equal(1);
    });
  });
});
