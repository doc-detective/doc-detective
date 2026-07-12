import assert from "node:assert/strict";
import net from "node:net";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import {
  spawnCommand,
  spawnBackgroundCommand,
  spawnPtyBackgroundCommand,
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
  resolveInputDelay,
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

// Finding 2 (PR #394, CodeQL js/shell-command-constructed-from-input):
// `spawnCommand`/`spawnBackgroundCommand` run with `shell: true`. That is the
// FEATURE contract (runShell/runCode execute the exact shell command an author
// writes — pipes, `&&`, globbing, redirection), not an injection sink: the
// command string is author-controlled test content, never untrusted external
// input. This lock test proves the shell metacharacters that the feature
// depends on are honored, so any future "fix" that swaps `shell: true` for an
// arg-array/execFile form (which would NOT interpret `&&`) breaks this test and
// forces a deliberate decision rather than a silent contract change.
describe("spawnCommand honors shell metacharacters (finding 2: shell:true is by design)", function () {
  this.timeout(15000);

  it("interprets `&&` to chain two commands (a shell feature, not literal args)", async function () {
    const a = `"${process.execPath}" -e "process.stdout.write('first')"`;
    const b = `"${process.execPath}" -e "process.stdout.write('second')"`;
    const { stdout, exitCode } = await spawnCommand(`${a} && ${b}`);
    // With shell:true the `&&` runs both; without it (arg-array form) the `&&`
    // would be passed as a literal argument and this would not be "firstsecond".
    assert.ok(
      stdout.includes("first") && stdout.includes("second"),
      `expected chained output, got: ${JSON.stringify(stdout)}`
    );
    assert.equal(exitCode, 0);
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

describe("spawnPtyBackgroundCommand (PTY)", function () {
  this.timeout(30000);

  // node-pty is a heavy native dep. Skip the whole suite unless it can be both
  // LOADED and used to SPAWN a PTY here. Detect in two cheap steps so we never
  // trigger a slow JIT install in the hook: (1) resolve node-pty with
  // autoInstall:false (fast — fails immediately on platforms where it isn't
  // installed, e.g. Windows runners, instead of attempting a multi-minute build
  // that would blow the hook timeout), then (2) actually spawn once to confirm a
  // PTY can be created (skips platforms where node-pty loads but `pty.spawn`
  // fails, e.g. some macOS arm64 runners).
  let ptyAvailable = false;
  before(async function () {
    try {
      const { loadHeavyDep } = await import("../dist/runtime/loader.js");
      await loadHeavyDep("@homebridge/node-pty-prebuilt-multiarch", {
        autoInstall: false,
      });
      const bg = await spawnPtyBackgroundCommand("node -e \"\"");
      await bg.kill(); // kill() resolves once the PTY has exited
      ptyAvailable = true;
    } catch {
      ptyAvailable = false;
    }
  });

  // Write a probe script to a temp file referenced by an unquoted, space-free
  // path. Avoids nested-quote mangling when the command string is appended to
  // `cmd /c` / `sh -c` on Windows.
  function writeProbe(body) {
    // os.tmpdir() is space-free on the CI runners and dev machines we target.
    const file = path.join(
      os.tmpdir(),
      `dd-pty-${process.pid}-${Math.floor(performance.now())}.js`
    );
    fs.writeFileSync(file, body);
    return file;
  }

  it("makes the process see a TTY (isTTY true)", async function () {
    if (!ptyAvailable) this.skip();
    const probe = writeProbe(
      "process.stdout.write('ISTTY:'+process.stdout.isTTY)"
    );
    const bg = await spawnPtyBackgroundCommand(`node ${probe}`);
    try {
      const deadline = Date.now() + 15000;
      while (
        !bg.getCombined().includes("ISTTY:") &&
        Date.now() < deadline
      ) {
        await new Promise((r) => setTimeout(r, 50));
      }
      assert.ok(
        bg.getCombined().includes("ISTTY:true"),
        `expected ISTTY:true in PTY output, got: ${JSON.stringify(
          bg.getCombined().slice(-120)
        )}`
      );
      assert.equal(bg.isPty, true);
      // PTY = one merged stream → stderr buffer is empty, combined == stdout.
      assert.equal(bg.getStderr(), "");
      assert.equal(bg.getCombined(), bg.getStdout());
    } finally {
      await bg.kill(); // resolves once the PTY has exited
      fs.rmSync(probe, { force: true });
    }
  });

  it("round-trips write + readiness over the PTY (node -i)", async function () {
    if (!ptyAvailable) this.skip();
    // Use the bare `node -i` command (no quoted exe path): under Windows
    // ConPTY a quoted interactive exe can trip node-pty's console-list agent.
    // The runner always spawns through the shell the same way.
    const bg = await spawnPtyBackgroundCommand("node -i");
    try {
      // Wait for the REPL prompt.
      await waitForStdio(bg, ">", { deadline: Date.now() + 15000 });
      const accepted = bg.write("2+2\r");
      assert.equal(accepted, true, "write should be accepted");
      const matched = await waitForOutputMatch(bg, "/4/", {
        deadline: Date.now() + 10000,
      });
      assert.equal(matched, true, "REPL should have evaluated 2+2");
    } finally {
      await bg.kill(); // resolves once the PTY has exited
    }
  });

  it("kill() terminates the PTY (exited resolves)", async function () {
    if (!ptyAvailable) this.skip();
    const tmp = writeProbe("setInterval(() => {}, 100000);");
    const bg = await spawnPtyBackgroundCommand(`node ${tmp}`);
    try {
      assert.equal(typeof bg.pid, "number");
      await bg.kill();
      const code = await bg.exited; // resolves once the PTY exits
      assert.ok(code === null || typeof code === "number");
    } finally {
      fs.rmSync(tmp, { force: true });
    }
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

  it("does not produce a garbage code point for $CTRL$ + a $...$ sentinel", function () {
    // `$CTRL$` followed by a known sentinel must not compute a control byte from
    // the literal "$" — that produced an out-of-range/garbage code point.
    const out = translateProcessKeys(["$CTRL$", "$ENTER$"]);
    for (const token of out) {
      for (let i = 0; i < token.length; i++) {
        assert.ok(
          token.charCodeAt(i) <= 0xff,
          `unexpected code point > 0xFF in ${JSON.stringify(token)}`
        );
      }
    }
    // $CTRL$ + $ENTER$ collapses to the carriage return the sentinel maps to.
    assert.deepEqual(out, ["\r"]);
  });

  it("still maps $CTRL$ + an ASCII letter to a control byte", function () {
    assert.deepEqual(translateProcessKeys(["$CTRL$", "c"]), ["\x03"]);
  });
});

// Finding 6 (PR #394): `inputDelay || 100` replaced an explicit author `0`
// with 100, silently ignoring "type as fast as possible". `?? 100` only fills
// in the default when inputDelay is absent (undefined/null), honoring an
// explicit 0.
describe("resolveInputDelay (finding 6: explicit 0 is honored)", function () {
  it("returns 100 when inputDelay is undefined (schema default)", function () {
    assert.equal(resolveInputDelay(undefined), 100);
  });

  it("returns 100 when inputDelay is null", function () {
    assert.equal(resolveInputDelay(null), 100);
  });

  it("returns 0 when inputDelay is an explicit 0 (NOT 100)", function () {
    assert.equal(resolveInputDelay(0), 0);
  });

  it("returns the author value for a positive delay", function () {
    assert.equal(resolveInputDelay(500), 500);
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
      explicit: true,
    });
  });

  it("resolves a reserved browser engine keyword to a browser surface (Phase 3)", function () {
    assert.equal(resolveSurface("chrome").kind, "browser");
    assert.equal(resolveSurface("chrome").engine, "chrome");
    assert.equal(resolveSurface("firefox").kind, "browser");
  });

  it("resolves a browser object to a browser surface (Phase 3)", function () {
    assert.equal(resolveSurface({ browser: "chrome" }).kind, "browser");
    assert.equal(
      resolveSurface({ browser: "chrome", tab: "cart" }).tab,
      "cart"
    );
  });

  it("flags an unknown surface object kind as unsupported", function () {
    assert.equal(resolveSurface({ app: "calc" }).kind, "unsupported");
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

describe("startBackgroundProcessSurface (Phase 6 shared launcher)", function () {
  this.timeout(20000);

  it("starts, registers, waits for readiness, and reports outputs", async function () {
    const { startBackgroundProcessSurface } = await import(
      "../dist/core/tests/processSurface.js"
    );
    const port = await findFreePort();
    const tmp = path.join(os.tmpdir(), `dd-p6-srv-${process.pid}.js`);
    fs.writeFileSync(
      tmp,
      `require('http').createServer((q,r)=>r.end('ok')).listen(+process.argv[2]);`
    );
    const registry = new Map();
    try {
      const result = await startBackgroundProcessSurface({
        config: {},
        descriptor: {
          command: `"${process.execPath}" "${tmp}" ${port}`,
          name: "web",
          waitUntil: { port },
          timeout: 10000,
        },
        processRegistry: registry,
      });
      assert.equal(result.status, "PASS");
      assert.equal(result.outputs.name, "web");
      assert.equal(result.outputs.ready, "true");
      assert.ok(registry.has("web"));
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

  it("fails fast without a process registry", async function () {
    const { startBackgroundProcessSurface } = await import(
      "../dist/core/tests/processSurface.js"
    );
    const result = await startBackgroundProcessSurface({
      config: {},
      descriptor: { command: "echo hi", name: "web" },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /no process registry/);
  });

  it("fails on a duplicate process name and on a browser-surface name collision", async function () {
    const { startBackgroundProcessSurface } = await import(
      "../dist/core/tests/processSurface.js"
    );
    const dup = await startBackgroundProcessSurface({
      config: {},
      descriptor: { command: "echo hi", name: "web" },
      processRegistry: new Map([["web", { name: "web", bg: {} }]]),
    });
    assert.equal(dup.status, "FAIL");
    assert.match(dup.description, /already running/);

    const cross = await startBackgroundProcessSurface({
      config: {},
      descriptor: { command: "echo hi", name: "web" },
      processRegistry: new Map(),
      driver: {
        state: { sessionRegistry: { sessions: new Map([["web", {}]]) } },
      },
    });
    assert.equal(cross.status, "FAIL");
    assert.match(cross.description, /browser surface named "web"/);
  });

  it("fails and deregisters when readiness times out", async function () {
    const { startBackgroundProcessSurface } = await import(
      "../dist/core/tests/processSurface.js"
    );
    const port = await findFreePort(); // nothing will ever listen here
    const tmp = path.join(os.tmpdir(), `dd-p6-noready-${process.pid}.js`);
    fs.writeFileSync(tmp, `setInterval(() => {}, 100000);`);
    const registry = new Map();
    try {
      const result = await startBackgroundProcessSurface({
        config: {},
        descriptor: {
          command: `"${process.execPath}" "${tmp}"`,
          name: "stuck",
          waitUntil: { port },
          timeout: 600,
        },
        processRegistry: registry,
      });
      assert.equal(result.status, "FAIL");
      assert.match(result.description, /failed to become ready/);
      assert.equal(registry.has("stuck"), false);
    } finally {
      // The launcher already killed + deregistered on the timeout, but if an
      // assertion above regresses, sweep any surviving entry so it can't leak
      // into later tests; always remove the temp script.
      await closeSurface({
        config: {},
        step: { closeSurface: "stuck" },
        processRegistry: registry,
      });
      fs.rmSync(tmp, { force: true });
    }
  });
});

// ADR 01046: transient concurrent-spawn recovery. Under concurrentRunners > 1
// on Windows, spawning many node/ConPTY children at once can starve a transient
// Windows loader/console limit so one child dies during init before it can
// signal ready (STATUS_DLL_INIT_FAILED 0xC0000142 / STATUS_CONTROL_C_EXIT
// 0xC000013A). A fresh spawn on the next attempt recovers, mirroring the
// driverStart transient-session retry. The launcher takes injectable `deps` so
// this can be proven deterministically without racing real processes.
describe("startBackgroundProcessSurface: transient init retry (Phase 6)", function () {
  this.timeout(10000);

  // A minimal BackgroundProcess-shaped stub whose readiness outcome the test
  // controls via `exitCode` (early-exit) or `ready` (becomes ready).
  function stubBg({ exitCode = null, ready = false } = {}) {
    return {
      pid: 4321,
      kill: async () => {},
      getStdout: () => "",
      getStderr: () => "",
      getCombined: () => "",
      write: () => true,
      onChunk: () => () => {},
      // Only used by the real waitForReady, which we stub out here.
      exited: ready ? new Promise(() => {}) : Promise.resolve(exitCode),
      _exitCode: exitCode,
      _ready: ready,
    };
  }

  it("retries a transient win32 init early-exit with a fresh spawn, then succeeds", async function () {
    const { startBackgroundProcessSurface } = await import(
      "../dist/core/tests/processSurface.js"
    );
    const spawns = [];
    // Attempt 1 crashes during init (STATUS_CONTROL_C_EXIT, as seen in CI);
    // attempt 2 becomes ready.
    const outcomes = [
      stubBg({ exitCode: -1073741510 }),
      stubBg({ ready: true }),
    ];
    const registry = new Map();
    const result = await startBackgroundProcessSurface({
      config: {},
      descriptor: { command: "flaky-under-load", name: "p6-tty" },
      processRegistry: registry,
      deps: {
        platform: "win32",
        // No-op the backoff so the retry loop completes instantly.
        sleep: () => Promise.resolve(),
        spawnBackgroundCommand: () => {
          const bg = outcomes[spawns.length];
          spawns.push(bg);
          return bg;
        },
        waitForReady: async (bg) => {
          if (bg._ready) return;
          throw new Error(
            `Process exited before becoming ready (exit code ${bg._exitCode}).`
          );
        },
      },
    });
    assert.equal(result.status, "PASS", result.description);
    // Two spawns: the first crashed transiently, the second succeeded.
    assert.equal(spawns.length, 2);
    // The surviving (ready) process is the one registered.
    assert.ok(registry.has("p6-tty"));
    assert.equal(registry.get("p6-tty").bg, outcomes[1]);
  });

  it("does not retry a non-transient readiness failure — fails after one attempt", async function () {
    const { startBackgroundProcessSurface } = await import(
      "../dist/core/tests/processSurface.js"
    );
    const spawns = [];
    const registry = new Map();
    const result = await startBackgroundProcessSurface({
      config: {},
      descriptor: { command: "genuinely-broken", name: "broken" },
      processRegistry: registry,
      deps: {
        platform: "win32",
        spawnBackgroundCommand: () => {
          const bg = stubBg({ exitCode: 1 });
          spawns.push(bg);
          return bg;
        },
        // A normal non-zero exit (a broken command) is not a transient init crash.
        waitForReady: async () => {
          throw new Error(
            `Process exited before becoming ready (exit code 1).`
          );
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /failed to become ready/);
    // Exactly one spawn — a genuine failure fails fast, no retry.
    assert.equal(spawns.length, 1);
    assert.equal(registry.has("broken"), false);
  });

  it("does not retry a transient-looking exit on a non-win32 platform", async function () {
    const { startBackgroundProcessSurface } = await import(
      "../dist/core/tests/processSurface.js"
    );
    const spawns = [];
    const result = await startBackgroundProcessSurface({
      config: {},
      descriptor: { command: "x", name: "linux-proc" },
      processRegistry: new Map(),
      deps: {
        platform: "linux",
        spawnBackgroundCommand: () => {
          const bg = stubBg({ exitCode: -1073741510 });
          spawns.push(bg);
          return bg;
        },
        waitForReady: async () => {
          throw new Error(
            `Process exited before becoming ready (exit code -1073741510).`
          );
        },
      },
    });
    assert.equal(result.status, "FAIL");
    // The transient codes are Windows NTSTATUS values; other platforms fail fast.
    assert.equal(spawns.length, 1);
  });

  it("gives up after the retry bound when every attempt crashes transiently", async function () {
    const { startBackgroundProcessSurface } = await import(
      "../dist/core/tests/processSurface.js"
    );
    const spawns = [];
    const result = await startBackgroundProcessSurface({
      config: {},
      descriptor: { command: "always-crashes", name: "doomed" },
      processRegistry: new Map(),
      deps: {
        platform: "win32",
        // No-op the backoff so the exhausted-retry path completes instantly.
        sleep: () => Promise.resolve(),
        spawnBackgroundCommand: () => {
          const bg = stubBg({ exitCode: -1073741502 }); // STATUS_DLL_INIT_FAILED
          spawns.push(bg);
          return bg;
        },
        waitForReady: async () => {
          throw new Error(
            `Process exited before becoming ready (exit code -1073741502).`
          );
        },
      },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /failed to become ready/);
    // Bounded to EXACTLY maxAttempts = 1 initial + PROCESS_INIT_RETRIES(2).
    // An exact check (not a range) catches a bumped constant or an extra attempt.
    assert.equal(
      spawns.length,
      3,
      `expected 3 spawns (1 initial + 2 retries), got ${spawns.length}`
    );
  });

  // teardown() is best-effort cleanup of an ALREADY-crashed child (that's why
  // readiness failed). A kill() rejection must never (a) escape and turn a
  // clean FAIL into a thrown step, (b) mask the real readiness error, or
  // (c) strand a stale processRegistry entry that the next attempt's register
  // would silently overwrite.
  it("a teardown kill() rejection neither escapes, masks the readiness error, nor strands the registry entry", async function () {
    const { startBackgroundProcessSurface } = await import(
      "../dist/core/tests/processSurface.js"
    );
    const registry = new Map();
    const result = await startBackgroundProcessSurface({
      config: {},
      descriptor: { command: "kill-explodes", name: "kill-rejects" },
      processRegistry: registry,
      deps: {
        platform: "linux",
        sleep: () => Promise.resolve(),
        spawnBackgroundCommand: () => ({
          pid: 4321,
          // The crashed handle's kill() rejects (e.g. node-pty on a dead pid).
          kill: async () => {
            throw new Error("kill failed: process already gone");
          },
          getStdout: () => "",
          getStderr: () => "",
          getCombined: () => "",
          write: () => true,
          onChunk: () => () => {},
          exited: Promise.resolve(1),
        }),
        waitForReady: async () => {
          throw new Error(`Process exited before becoming ready (exit code 1).`);
        },
      },
    });
    // (a) it returned rather than threw, and (b) the readiness error survived.
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /failed to become ready/);
    assert.match(result.description, /exit code 1/);
    assert.doesNotMatch(result.description, /kill failed/);
    // (c) no stale entry left behind.
    assert.equal(registry.has("kill-rejects"), false);
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

  it("runShell fails when the name is already an open browser surface", async function () {
    // Cross-kind uniqueness (Phase 4): a process can't reuse a browser
    // surface's name, or a bare-string surface would route to the browser.
    const registry = new Map();
    const driver = {
      state: { sessionRegistry: { sessions: new Map([["web", {}]]) } },
    };
    const result = await runShell({
      config: {},
      step: {
        runShell: {
          command: "echo hi",
          background: { name: "web", waitUntil: { delayMs: 10 } },
        },
      },
      driver,
      processRegistry: registry,
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /browser surface named "web"/);
    assert.equal(registry.has("web"), false);
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
