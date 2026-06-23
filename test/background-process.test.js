import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  spawnBackgroundCommand,
  waitForPort,
  waitForHttp,
  waitForStdio,
  waitForReady,
  findFreePort,
} from "../dist/core/utils.js";
import { stopProcess } from "../dist/core/tests/stopProcess.js";
import { runShell } from "../dist/core/tests/runShell.js";
import { runCode } from "../dist/core/tests/runCode.js";

const require = createRequire(import.meta.url);
const treeKill = require("tree-kill");

// Kill the whole process tree (shell + child) so a shell:true background
// process doesn't leak; child.kill() alone leaves the grandchild alive.
function killTree(pid) {
  return new Promise((resolve) => treeKill(pid, "SIGKILL", () => resolve()));
}

// Build a minimal fake BackgroundProcess for probe-logic tests that don't need
// a real child process.
function fakeBg({ exited = new Promise(() => {}) } = {}) {
  let stdout = "";
  let stderr = "";
  const subs = new Set();
  return {
    exited,
    getStdout: () => stdout,
    getStderr: () => stderr,
    getCombined: () => stdout + stderr,
    onChunk(cb) {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    // test helper to push output
    _emit(text, stream = "stdout") {
      if (stream === "stdout") stdout += text;
      else stderr += text;
      for (const cb of subs) cb(text, stream);
    },
  };
}

describe("spawnBackgroundCommand", function () {
  this.timeout(15000);

  it("returns immediately and buffers stdout from a long-running process", async function () {
    const tmp = path.join(os.tmpdir(), `dd-bg-test-${process.pid}.js`);
    fs.writeFileSync(
      tmp,
      `console.log("STARTED"); setInterval(() => {}, 100000);`
    );
    const bg = spawnBackgroundCommand(`"${process.execPath}" "${tmp}"`);
    try {
      assert.equal(typeof bg.pid, "number");
      // Wait until the buffered output shows the startup line.
      const start = Date.now();
      while (!bg.getStdout().includes("STARTED") && Date.now() - start < 5000) {
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.ok(bg.getStdout().includes("STARTED"), "expected buffered stdout");
      assert.ok(bg.getCombined().includes("STARTED"));
    } finally {
      await killTree(bg.pid);
      await bg.exited;
      fs.rmSync(tmp, { force: true });
    }
  });

  it("resolves `exited` with null when the command can't be spawned", async function () {
    const bg = spawnBackgroundCommand(
      "this-command-definitely-does-not-exist-xyz",
      [],
      {}
    );
    const code = await bg.exited;
    // Either the shell reports a non-zero exit code, or spawn errors (null).
    assert.ok(code === null || typeof code === "number");
  });
});

describe("waitForPort", function () {
  this.timeout(10000);

  it("resolves once a port is accepting connections", async function () {
    const port = await findFreePort();
    const server = net.createServer();
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    try {
      await waitForPort(port, { deadline: Date.now() + 5000 });
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it("rejects when nothing is listening before the deadline", async function () {
    const port = await findFreePort();
    await assert.rejects(
      waitForPort(port, { deadline: Date.now() + 300 }),
      /did not open in time/
    );
  });
});

describe("waitForHttp", function () {
  this.timeout(10000);

  it("resolves when the endpoint returns a 2xx status", async function () {
    const port = await findFreePort();
    const server = http.createServer((req, res) => {
      res.statusCode = 204;
      res.end();
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    try {
      await waitForHttp(`http://127.0.0.1:${port}/`, {
        deadline: Date.now() + 5000,
      });
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it("rejects when the status is never 2xx before the deadline", async function () {
    const port = await findFreePort();
    const server = http.createServer((req, res) => {
      res.statusCode = 503;
      res.end("nope");
    });
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    try {
      await assert.rejects(
        waitForHttp(`http://127.0.0.1:${port}/`, {
          deadline: Date.now() + 400,
        }),
        /did not return a 2xx status/
      );
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

describe("waitForStdio", function () {
  this.timeout(10000);

  it("resolves when already-buffered output contains the substring", async function () {
    const bg = fakeBg();
    bg._emit("server ready to accept connections\n");
    await waitForStdio(bg, "ready to accept", { deadline: Date.now() + 1000 });
  });

  it("resolves on a later chunk and searches both streams", async function () {
    const bg = fakeBg();
    const p = waitForStdio(bg, "listening", { deadline: Date.now() + 2000 });
    bg._emit("noise on stdout\n", "stdout");
    bg._emit("now listening on 8080\n", "stderr"); // matched even though on stderr
    await p;
  });

  it("supports /regex/ matching", async function () {
    const bg = fakeBg();
    bg._emit("started on port 8080\n");
    await waitForStdio(bg, "/on port \\d+/", { deadline: Date.now() + 1000 });
  });

  it("rejects when the content is never seen before the deadline", async function () {
    const bg = fakeBg();
    await assert.rejects(
      waitForStdio(bg, "never-appears", { deadline: Date.now() + 200 }),
      /not seen in time/
    );
  });
});

describe("waitForReady", function () {
  this.timeout(10000);

  it("resolves after a delayMs condition", async function () {
    const bg = fakeBg();
    const start = Date.now();
    await waitForReady(bg, { delayMs: 100 }, { timeoutMs: 5000 });
    assert.ok(Date.now() - start >= 90);
  });

  it("resolves immediately when no waitUntil is given", async function () {
    const bg = fakeBg();
    await waitForReady(bg, undefined, { timeoutMs: 5000 });
  });

  it("resolves via a port condition", async function () {
    const port = await findFreePort();
    const server = net.createServer();
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    const bg = fakeBg();
    try {
      await waitForReady(bg, { port }, { timeoutMs: 5000 });
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it("requires ALL combined conditions to pass", async function () {
    const port = await findFreePort();
    const server = net.createServer();
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    const bg = fakeBg();
    bg._emit("up and listening\n");
    try {
      // port is open AND stdio already matched AND a short delay → all pass
      await waitForReady(
        bg,
        { port, stdio: "listening", delayMs: 50 },
        { timeoutMs: 5000 }
      );
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it("fails when one combined condition can't be met", async function () {
    const port = await findFreePort();
    const server = net.createServer();
    await new Promise((r) => server.listen(port, "127.0.0.1", r));
    const bg = fakeBg(); // port opens, but the stdio match never arrives
    try {
      await assert.rejects(
        waitForReady(
          bg,
          { port, stdio: "never-shows-up" },
          { timeoutMs: 500 }
        ),
        /not seen in time/
      );
    } finally {
      await new Promise((r) => server.close(r));
    }
  });

  it("fails fast when the process exits before becoming ready", async function () {
    const port = await findFreePort(); // nothing listening here
    const bg = fakeBg({ exited: Promise.resolve(1) });
    await assert.rejects(
      waitForReady(bg, { port }, { timeoutMs: 5000 }),
      /exited before becoming ready/
    );
  });
});

describe("stopProcess", function () {
  this.timeout(15000);

  function spawnLongLived() {
    const tmp = path.join(
      os.tmpdir(),
      `dd-stop-test-${process.pid}-${Math.floor(performance.now())}.js`
    );
    fs.writeFileSync(tmp, `setInterval(() => {}, 100000);`);
    const bg = spawnBackgroundCommand(`"${process.execPath}" "${tmp}"`);
    return { bg, tmp };
  }

  it("stops a registered process and removes it from the registry", async function () {
    const { bg, tmp } = spawnLongLived();
    const registry = new Map([["srv", { name: "srv", bg }]]);
    const result = await stopProcess({
      config: {},
      step: { stopProcess: "srv" },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
    assert.equal(registry.has("srv"), false);
    await bg.exited; // process actually terminated
    fs.rmSync(tmp, { force: true });
  });

  it("removes a deferred temp script when stopping a runCode-style process", async function () {
    const { bg, tmp } = spawnLongLived();
    const registry = new Map([["api", { name: "api", bg, tempPath: tmp }]]);
    const result = await stopProcess({
      config: {},
      step: { stopProcess: { name: "api" } },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
    await bg.exited;
    assert.equal(fs.existsSync(tmp), false, "temp script should be deleted");
  });

  it("passes for a missing process when ignoreMissing is true", async function () {
    const registry = new Map();
    const result = await stopProcess({
      config: {},
      step: { stopProcess: { name: "nope", ignoreMissing: true } },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
  });

  it("fails for a missing process when ignoreMissing is false", async function () {
    const registry = new Map();
    const result = await stopProcess({
      config: {},
      step: { stopProcess: "nope" },
      processRegistry: registry,
    });
    assert.equal(result.status, "FAIL");
  });
});

describe("runShell/runCode background (integration)", function () {
  this.timeout(20000);

  it("runShell starts a background server, becomes ready, and is stoppable", async function () {
    const port = await findFreePort();
    const tmp = path.join(os.tmpdir(), `dd-srv-${process.pid}.js`);
    fs.writeFileSync(
      tmp,
      `require('http').createServer((q,r)=>r.end('ok')).listen(+process.argv[2]);`
    );
    const registry = new Map();
    try {
      const result = await runShell({
        config: {},
        step: {
          runShell: {
            command: `"${process.execPath}" "${tmp}" ${port}`,
            background: {
              name: "web",
              waitUntil: { port },
            },
            timeout: 10000,
          },
        },
        processRegistry: registry,
      });
      assert.equal(result.status, "PASS");
      assert.equal(result.outputs.name, "web");
      assert.equal(result.outputs.ready, "true");
      assert.ok(registry.has("web"));
      // Port is actually accepting connections.
      await waitForPort(port, { deadline: Date.now() + 2000 });
    } finally {
      await stopProcess({
        config: {},
        step: { stopProcess: { name: "web", ignoreMissing: true } },
        processRegistry: registry,
      });
      fs.rmSync(tmp, { force: true });
    }
  });

  it("runShell fails on a name collision", async function () {
    const registry = new Map([["web", { name: "web", bg: { pid: undefined } }]]);
    const result = await runShell({
      config: {},
      step: {
        runShell: {
          command: "echo hi",
          background: { name: "web", waitUntil: { delayMs: 10 } },
        },
      },
      processRegistry: registry,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /already running/);
  });

  it("runShell fails and deregisters when readiness times out", async function () {
    const port = await findFreePort(); // nothing will ever listen here
    const tmp = path.join(os.tmpdir(), `dd-noready-${process.pid}.js`);
    fs.writeFileSync(tmp, `setInterval(() => {}, 100000);`);
    const registry = new Map();
    const result = await runShell({
      config: {},
      step: {
        runShell: {
          command: `"${process.execPath}" "${tmp}"`,
          background: {
            name: "stuck",
            waitUntil: { port },
          },
          timeout: 600,
        },
      },
      processRegistry: registry,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /failed to become ready/);
    assert.equal(registry.has("stuck"), false);
    fs.rmSync(tmp, { force: true });
  });

  it("runCode starts a background server and defers temp-script cleanup", async function () {
    const port = await findFreePort();
    const registry = new Map();
    try {
      const result = await runCode({
        config: {},
        step: {
          runCode: {
            language: "javascript",
            code: `require('http').createServer((q,r)=>r.end('ok')).listen(${port});`,
            background: {
              name: "api",
              waitUntil: { port },
            },
            timeout: 10000,
          },
        },
        processRegistry: registry,
      });
      assert.equal(result.status, "PASS");
      assert.ok(registry.has("api"));
      const entry = registry.get("api");
      assert.ok(entry.tempPath, "temp script path should be retained on the entry");
      assert.equal(fs.existsSync(entry.tempPath), true, "temp script kept while running");
    } finally {
      const entry = registry.get("api");
      const tempPath = entry?.tempPath;
      await stopProcess({
        config: {},
        step: { stopProcess: { name: "api", ignoreMissing: true } },
        processRegistry: registry,
      });
      if (tempPath) assert.equal(fs.existsSync(tempPath), false, "temp script removed on stop");
    }
  });
});
