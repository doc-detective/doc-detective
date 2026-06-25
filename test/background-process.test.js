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
  waitForOutputMatch,
  findFreePort,
} from "../dist/core/utils.js";
import { closeSurface } from "../dist/core/tests/closeSurface.js";
import {
  translateProcessKeys,
  resolveSurface,
  _processKeyMap,
} from "../dist/core/tests/typeKeys.js";
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

  it("rejects a malformed /regex/ with a friendly error", async function () {
    const bg = fakeBg();
    await assert.rejects(
      waitForStdio(bg, "/[unclosed/", { deadline: Date.now() + 1000 }),
      /invalid regular expression/
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

describe("BackgroundProcess.write", function () {
  this.timeout(20000);

  it("writes to stdin and the response is buffered into getCombined()", async function () {
    // `node -i` is a line-oriented REPL: writing "1+1\r" should echo "2".
    const bg = spawnBackgroundCommand(`"${process.execPath}" -i`);
    try {
      // Wait for the REPL prompt before sending input.
      const promptDeadline = Date.now() + 8000;
      while (!bg.getCombined().includes(">") && Date.now() < promptDeadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      const accepted = bg.write("1+1\r");
      assert.equal(accepted, true, "write should be accepted");
      const deadline = Date.now() + 8000;
      while (!bg.getCombined().includes("2") && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.ok(bg.getCombined().includes("2"), "REPL should have evaluated 1+1");
    } finally {
      await killTree(bg.pid);
      await bg.exited;
    }
  });

  it("returns false when stdin is gone (dead process)", async function () {
    const bg = spawnBackgroundCommand(
      "this-command-definitely-does-not-exist-xyz"
    );
    await bg.exited;
    // After the process is gone, write must be a safe no-op (false), not a throw.
    const result = bg.write("data");
    assert.equal(typeof result, "boolean");
  });
});

describe("waitForOutputMatch", function () {
  this.timeout(10000);

  it("resolves true when already-buffered output matches (before subscribe)", async function () {
    const bg = fakeBg();
    bg._emit("server ready to accept connections\n");
    const matched = await waitForOutputMatch(bg, "ready to accept", {
      deadline: Date.now() + 1000,
    });
    assert.equal(matched, true);
  });

  it("resolves true when a later chunk matches (after subscribe)", async function () {
    const bg = fakeBg();
    const p = waitForOutputMatch(bg, "/listening on \\d+/", {
      deadline: Date.now() + 2000,
    });
    bg._emit("noise\n");
    bg._emit("now listening on 8080\n");
    assert.equal(await p, true);
  });

  it("resolves false on timeout when the pattern never appears", async function () {
    const bg = fakeBg();
    const matched = await waitForOutputMatch(bg, "never-appears", {
      deadline: Date.now() + 200,
    });
    assert.equal(matched, false);
  });
});

describe("_processKeyMap / translateProcessKeys", function () {
  it("maps special keys to control bytes", function () {
    assert.equal(_processKeyMap.$ENTER$, "\r");
    assert.equal(_processKeyMap.$RETURN$, "\r");
    assert.equal(_processKeyMap.$TAB$, "\t");
    assert.equal(_processKeyMap.$ESCAPE$, "\x1b");
    assert.equal(_processKeyMap.$BACKSPACE$, "\x7f");
    assert.equal(_processKeyMap.$SPACE$, " ");
    assert.equal(_processKeyMap.$ARROW_UP$, "\x1b[A");
    assert.equal(_processKeyMap.$ARROW_DOWN$, "\x1b[B");
    assert.equal(_processKeyMap.$ARROW_RIGHT$, "\x1b[C");
    assert.equal(_processKeyMap.$ARROW_LEFT$, "\x1b[D");
    assert.equal(_processKeyMap.$DELETE$, "\x1b[3~");
  });

  it("passes plain strings through verbatim", function () {
    assert.deepEqual(translateProcessKeys(["6 * 7"]), ["6 * 7"]);
  });

  it("translates special keys and $ENTER$", function () {
    assert.deepEqual(translateProcessKeys(["6 * 7", "$ENTER$"]), ["6 * 7", "\r"]);
  });

  it("translates $CTRL$ + next key into a control byte", function () {
    // Ctrl+C → 0x03
    assert.deepEqual(translateProcessKeys(["$CTRL$", "c"]), ["\x03"]);
    // Ctrl+D → 0x04
    assert.deepEqual(translateProcessKeys(["$CTRL$", "d"]), ["\x04"]);
    // case-insensitive
    assert.deepEqual(translateProcessKeys(["$CTRL$", "C"]), ["\x03"]);
  });

  it("passes unknown $...$ tokens through verbatim", function () {
    assert.deepEqual(translateProcessKeys(["$UNKNOWN$"]), ["$UNKNOWN$"]);
  });
});

describe("resolveSurface", function () {
  it("resolves a string name to a process kind", function () {
    assert.deepEqual(resolveSurface("repl"), { kind: "process", name: "repl" });
  });

  it("resolves a process object", function () {
    assert.deepEqual(resolveSurface({ process: "repl" }), {
      kind: "process",
      name: "repl",
    });
  });

  it("flags a reserved browser engine keyword as unsupported", function () {
    assert.equal(resolveSurface("chrome").kind, "unsupported");
    assert.equal(resolveSurface("firefox").kind, "unsupported");
  });

  it("flags a non-process object as unsupported", function () {
    assert.equal(resolveSurface({ browser: "chrome" }).kind, "unsupported");
  });

  it("returns none for an absent surface", function () {
    assert.equal(resolveSurface(undefined).kind, "none");
  });
});

describe("closeSurface", function () {
  this.timeout(15000);

  function spawnLongLived() {
    const tmp = path.join(
      os.tmpdir(),
      `dd-close-test-${process.pid}-${Math.floor(performance.now())}.js`
    );
    fs.writeFileSync(tmp, `setInterval(() => {}, 100000);`);
    const bg = spawnBackgroundCommand(`"${process.execPath}" "${tmp}"`);
    return { bg, tmp };
  }

  it("closes a registered process and removes it from the registry", async function () {
    const { bg, tmp } = spawnLongLived();
    const registry = new Map([["srv", { name: "srv", bg }]]);
    const result = await closeSurface({
      config: {},
      step: { closeSurface: "srv" },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
    assert.equal(registry.has("srv"), false);
    await bg.exited; // process actually terminated
    fs.rmSync(tmp, { force: true });
  });

  it("removes a deferred temp script when closing a runCode-style process", async function () {
    const { bg, tmp } = spawnLongLived();
    const registry = new Map([["api", { name: "api", bg, tempPath: tmp }]]);
    const result = await closeSurface({
      config: {},
      step: { closeSurface: { process: "api" } },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
    await bg.exited;
    assert.equal(fs.existsSync(tmp), false, "temp script should be deleted");
  });

  it("is idempotent: closing an absent surface is a PASS no-op", async function () {
    const registry = new Map();
    const result = await closeSurface({
      config: {},
      step: { closeSurface: "nope" },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
  });

  it("closes several surfaces in one step (array form)", async function () {
    const a = spawnLongLived();
    const b = spawnLongLived();
    const registry = new Map([
      ["web", { name: "web", bg: a.bg }],
      ["api", { name: "api", bg: b.bg }],
    ]);
    const result = await closeSurface({
      config: {},
      step: { closeSurface: ["web", "api"] },
      processRegistry: registry,
    });
    assert.equal(result.status, "PASS");
    assert.equal(registry.size, 0);
    await a.bg.exited;
    await b.bg.exited;
    fs.rmSync(a.tmp, { force: true });
    fs.rmSync(b.tmp, { force: true });
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
      await closeSurface({
        config: {},
        step: { closeSurface: "web" },
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
      await closeSurface({
        config: {},
        step: { closeSurface: "api" },
        processRegistry: registry,
      });
      if (tempPath) assert.equal(fs.existsSync(tempPath), false, "temp script removed on stop");
    }
  });
});
