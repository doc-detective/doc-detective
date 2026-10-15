import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import {
  reuseAppiumEnabled,
  appiumServerKey,
  createServerCache,
  takeServer,
  handBackServer,
  APPIUM_WATCHDOG_IMPORT,
  allowSessionDiscovery,
} from "../dist/core/appiumReuse.js";

// ADR 01125: opt-in reuse of browser-pool Appium servers across runs.

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// A stand-in for a spawned server: just enough of a ChildProcess for the
// cache's liveness checks and unref/ref calls.
function fakeServer(port, { exited = false } = {}) {
  const stream = () => ({ ref() {}, unref() {} });
  return {
    port,
    process: {
      pid: 100000 + port,
      exitCode: exited ? 0 : null,
      signalCode: null,
      ref() {},
      unref() {},
      stdin: stream(),
      stdout: stream(),
      stderr: stream(),
    },
  };
}

describe("Appium server reuse (ADR 01125)", function () {
  describe("reuseAppiumEnabled", function () {
    it("is off unless DOC_DETECTIVE_REUSE_APPIUM is true or 1", function () {
      assert.equal(reuseAppiumEnabled({}), false);
      assert.equal(reuseAppiumEnabled({ DOC_DETECTIVE_REUSE_APPIUM: "false" }), false);
      assert.equal(reuseAppiumEnabled({ DOC_DETECTIVE_REUSE_APPIUM: "" }), false);
      assert.equal(reuseAppiumEnabled({ DOC_DETECTIVE_REUSE_APPIUM: "true" }), true);
      assert.equal(reuseAppiumEnabled({ DOC_DETECTIVE_REUSE_APPIUM: "1" }), true);
    });
  });

  describe("appiumServerKey", function () {
    let home;
    const pkgs = ["appium", "appium-chromium-driver"];
    beforeEach(function () {
      home = fs.mkdtempSync(path.join(os.tmpdir(), "dd-reuse-key-"));
      for (const pkg of pkgs) {
        fs.mkdirSync(path.join(home, "node_modules", pkg), { recursive: true });
        fs.writeFileSync(
          path.join(home, "node_modules", pkg, "package.json"),
          JSON.stringify({ name: pkg, version: "1.0.0" })
        );
      }
    });
    afterEach(function () {
      fs.rmSync(home, { recursive: true, force: true });
    });
    const key = (over = {}) =>
      appiumServerKey({
        entry: "/x/appium/index.js",
        args: ["--use-drivers=chromium"],
        env: { A: "1", APPIUM_HOME: home },
        appiumHome: home,
        packages: pkgs,
        ...over,
      });

    it("is stable for identical inputs, whatever the env key order", function () {
      assert.equal(key(), key({ env: { APPIUM_HOME: home, A: "1" } }));
    });

    it("changes with the entry, the args, or the environment", function () {
      assert.notEqual(key(), key({ entry: "/y/appium/index.js" }));
      assert.notEqual(key(), key({ args: ["--use-drivers=chromium,gecko"] }));
      assert.notEqual(key(), key({ env: { A: "2", APPIUM_HOME: home } }));
    });

    // webdriverio sets WDIO_LOG_LEVEL in this process on its first session, so
    // keying on it made every process's second run miss. Appium never reads it.
    it("ignores WDIO_LOG_LEVEL", function () {
      assert.equal(key(), key({ env: { A: "1", APPIUM_HOME: home, WDIO_LOG_LEVEL: "error" } }));
    });

    it("changes when an installed driver's version changes", function () {
      const before = key();
      fs.writeFileSync(
        path.join(home, "node_modules", "appium-chromium-driver", "package.json"),
        JSON.stringify({ name: "appium-chromium-driver", version: "1.0.1" })
      );
      assert.notEqual(key(), before);
    });
  });

  describe("allowSessionDiscovery", function () {
    // Hand-back reads GET /appium/sessions, which Appium serves only with the
    // session_discovery insecure feature. It must join the existing grant, not
    // replace it, or Firefox loses its managed geckodriver path.
    it("adds the feature to an existing --allow-insecure list", function () {
      assert.deepEqual(
        allowSessionDiscovery(["--allow-insecure", "*:custom_geckodriver_executable", "--use-drivers=gecko"]),
        ["--allow-insecure", "*:custom_geckodriver_executable,*:session_discovery", "--use-drivers=gecko"]
      );
    });

    it("adds the flag when there is none", function () {
      assert.deepEqual(allowSessionDiscovery(["--use-drivers=gecko"]), [
        "--use-drivers=gecko",
        "--allow-insecure",
        "*:session_discovery",
      ]);
    });
  });

  describe("createServerCache", function () {
    it("hands back a parked server only under the same key, once", function () {
      const killed = [];
      const cache = createServerCache({ kill: async (s) => killed.push(s), idleMs: 60000, maxIdle: 4 });
      const s = fakeServer(1);
      cache.park("k", s);
      assert.equal(cache.take("other"), undefined);
      assert.equal(cache.take("k"), s);
      assert.equal(cache.take("k"), undefined, "a taken server must not be handed out twice");
      assert.deepEqual(killed, []);
    });

    it("kills a server that stays idle past idleMs", async function () {
      const killed = [];
      const cache = createServerCache({ kill: async (s) => killed.push(s), idleMs: 20, maxIdle: 4 });
      const s = fakeServer(2);
      cache.park("k", s);
      await new Promise((r) => setTimeout(r, 80));
      assert.deepEqual(killed, [s]);
      assert.equal(cache.take("k"), undefined);
    });

    it("kills servers beyond maxIdle instead of parking them", function () {
      const killed = [];
      const cache = createServerCache({ kill: async (s) => killed.push(s), idleMs: 60000, maxIdle: 1 });
      const a = fakeServer(3);
      const b = fakeServer(4);
      cache.park("k1", a);
      cache.park("k2", b);
      assert.deepEqual(killed, [b]);
      assert.equal(cache.take("k1"), a);
    });

    it("drain() kills every idle server", async function () {
      const killed = [];
      const cache = createServerCache({ kill: async (s) => killed.push(s), idleMs: 60000, maxIdle: 4 });
      const a = fakeServer(5);
      const b = fakeServer(6);
      cache.park("k", a);
      cache.park("k", b);
      await cache.drain();
      assert.equal(killed.length, 2);
      assert.equal(cache.take("k"), undefined);
    });
  });

  describe("takeServer", function () {
    it("skips (and kills) idle servers that exited or don't answer /status", async function () {
      const killed = [];
      const cache = createServerCache({ kill: async (s) => killed.push(s), idleMs: 60000, maxIdle: 4 });
      const dead = fakeServer(7, { exited: true });
      const deaf = fakeServer(8);
      const good = fakeServer(9);
      cache.park("k", good);
      cache.park("k", deaf);
      cache.park("k", dead);
      const got = await takeServer(cache, "k", { isReady: async (port) => port === 9 });
      assert.equal(got, good);
      assert.deepEqual(killed.map((s) => s.port).sort(), [7, 8]);
    });

    it("returns undefined when nothing is parked under the key", async function () {
      const cache = createServerCache({ kill: async () => {}, idleMs: 60000, maxIdle: 4 });
      assert.equal(await takeServer(cache, "k", { isReady: async () => true }), undefined);
    });
  });

  describe("handBackServer", function () {
    const setup = () => {
      const killed = [];
      const cache = createServerCache({ kill: async (s) => killed.push(s), idleMs: 60000, maxIdle: 4 });
      return { cache, killed };
    };

    it("parks a live server with no sessions", async function () {
      const { cache, killed } = setup();
      const s = fakeServer(10);
      const outcome = await handBackServer(cache, "k", s, { listSessions: async () => [] });
      assert.equal(outcome, "parked");
      assert.deepEqual(killed, []);
      assert.equal(cache.take("k"), s);
    });

    it("kills a server that still has a session", async function () {
      const { cache, killed } = setup();
      const s = fakeServer(11);
      const outcome = await handBackServer(cache, "k", s, {
        listSessions: async () => [{ id: "leftover" }],
      });
      assert.equal(outcome, "killed");
      assert.deepEqual(killed, [s]);
      assert.equal(cache.take("k"), undefined);
    });

    it("kills a server whose session list can't be read", async function () {
      const { cache, killed } = setup();
      const s = fakeServer(12);
      const outcome = await handBackServer(cache, "k", s, {
        listSessions: async () => {
          throw new Error("ECONNREFUSED");
        },
      });
      assert.equal(outcome, "killed");
      assert.deepEqual(killed, [s]);
    });

    it("kills a server whose process already exited", async function () {
      const { cache, killed } = setup();
      const s = fakeServer(13, { exited: true });
      const outcome = await handBackServer(cache, "k", s, { listSessions: async () => [] });
      assert.equal(outcome, "killed");
      assert.deepEqual(killed, [s]);
    });
  });

  describe("APPIUM_WATCHDOG_IMPORT", function () {
    this.timeout(20000);

    // Proves the parent-death guard on every OS: an idle child spawned with
    // the preload must not outlive its parent. On POSIX nothing else would end
    // it (verified: without the preload the child is orphaned). On Windows
    // libuv's job object also ends it, so this passes there either way.
    it("ends an idle child once its parent is killed", async function () {
      const pidFile = path.join(os.tmpdir(), `dd-reuse-watchdog-${process.pid}.pid`);
      const parentScript = `
        const { spawn } = require("node:child_process");
        const c = spawn(process.execPath, ["--import", ${JSON.stringify(APPIUM_WATCHDOG_IMPORT)}, "-e", "setInterval(()=>{},1000)"], { stdio: ["pipe", "pipe", "pipe"] });
        c.stdout.on("data", () => {}); c.stderr.on("data", () => {});
        require("node:fs").writeFileSync(${JSON.stringify(pidFile)}, String(c.pid));
        setTimeout(() => process.kill(process.pid, "SIGKILL"), 500);
      `;
      const parent = spawn(process.execPath, ["-e", parentScript], { stdio: "ignore" });
      await new Promise((r) => parent.once("exit", r));
      const childPid = Number(fs.readFileSync(pidFile, "utf8"));
      fs.rmSync(pidFile, { force: true });
      const deadline = Date.now() + 5000;
      while (isAlive(childPid) && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const alive = isAlive(childPid);
      if (alive) process.kill(childPid, "SIGKILL");
      assert.equal(alive, false, "child outlived its killed parent");
    });

    it("leaves the child running while the parent holds stdin open", async function () {
      const child = spawn(
        process.execPath,
        ["--import", APPIUM_WATCHDOG_IMPORT, "-e", "setInterval(()=>{},1000)"],
        { stdio: ["pipe", "ignore", "ignore"] }
      );
      try {
        await new Promise((r) => setTimeout(r, 500));
        assert.equal(child.exitCode, null);
        assert.ok(isAlive(child.pid));
      } finally {
        child.kill("SIGKILL");
      }
    });
  });
});

describe("Appium server reuse end to end (ADR 01125)", function () {
  // Two real browser runs plus Appium boot; generous like the port-conflict suite.
  this.timeout(600000);
  const artifactPath = path.resolve("./test/core-artifacts");
  const makeConfig = () => {
    const config = JSON.parse(fs.readFileSync(`${artifactPath}/config.json`, "utf8"));
    // Chrome: the fastest browser session to stand up.
    config.input = path.join(artifactPath, "navigation", "context_chrome.spec.json");
    return config;
  };
  let saved;
  let core;
  before(async function () {
    saved = process.env.DOC_DETECTIVE_REUSE_APPIUM;
    core = {
      ...(await import("../dist/core/index.js")),
      ...(await import("../dist/core/tests.js")),
    };
  });
  afterEach(async function () {
    if (saved === undefined) delete process.env.DOC_DETECTIVE_REUSE_APPIUM;
    else process.env.DOC_DETECTIVE_REUSE_APPIUM = saved;
    await core.appiumServerCache.drain();
  });

  // The suite runs with reuse on (test/hooks.js), so these pin the user
  // default explicitly: unset and "false" both keep nothing after a run.
  for (const value of [undefined, "false"]) {
    it(`keeps no server after a run when the variable is ${value === undefined ? "unset" : `"${value}"`}`, async function () {
      if (value === undefined) delete process.env.DOC_DETECTIVE_REUSE_APPIUM;
      else process.env.DOC_DETECTIVE_REUSE_APPIUM = value;
      await core.appiumServerCache.drain();
      const result = await core.runTests(makeConfig());
      assert.equal(result.summary.specs.fail, 0);
      assert.equal(core.appiumServerCache.servers().length, 0);
    });
  }

  it("hands the first run's server to the second run when enabled", async function () {
    process.env.DOC_DETECTIVE_REUSE_APPIUM = "true";
    const first = await core.runTests(makeConfig());
    assert.equal(first.summary.specs.fail, 0);
    const parked = core.appiumServerCache.servers();
    assert.equal(parked.length, 1, "the run should park its one server");
    const pid = parked[0].process.pid;
    assert.ok(isAlive(pid));

    const second = await core.runTests(makeConfig());
    assert.equal(second.summary.specs.fail, 0);
    const after = core.appiumServerCache.servers();
    assert.equal(after.length, 1);
    assert.equal(after[0].process.pid, pid, "the second run should reuse, not respawn");

    await core.appiumServerCache.drain();
    const deadline = Date.now() + 5000;
    while (isAlive(pid) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    assert.equal(isAlive(pid), false, "drain must kill the idle server");
  });
});
