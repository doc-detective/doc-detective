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
  });

  describe("detectInstallMode", function () {
    it("returns a string from the canonical set", function () {
      const mode = detectInstallMode();
      expect(["global", "local", "npx", "unknown"]).to.include(mode);
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

    // global / npx modes call process.exit after spawning. We don't test
    // those here because process.exit kills the test runner; the spawn
    // commands are mechanically simple and the behavior is exercised by
    // the integration tests in CI.
  });
});
