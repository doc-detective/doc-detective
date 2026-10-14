// runCode skips its `node --version` availability probe when the `node` the
// probe's shell would run is the Node running Doc Detective: that probe can
// only succeed. Any other `node` (or none) still gets the probe, so a missing
// or broken interpreter FAILs exactly as before.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { runCode, pathNodeIsCurrentNode } from "../dist/core/tests/runCode.js";

describe("pathNodeIsCurrentNode", function () {
  // A fake filesystem: `files` maps candidate path -> real path.
  const fake = (files, extra = {}) => ({
    isFile: (p) => p in files,
    realpath: (p) => {
      if (p in files) return files[p];
      if (p === extra.execPath) return extra.execPath;
      throw new Error(`ENOENT ${p}`);
    },
    ...extra,
  });

  it("POSIX: true when the first `node` on PATH resolves to the running node", function () {
    const deps = fake(
      { "/usr/local/bin/node": "/opt/node-22/bin/node", "/usr/bin/node": "/usr/bin/node" },
      { platform: "linux", cwd: "/work", execPath: "/opt/node-22/bin/node", env: { PATH: "/usr/local/bin:/usr/bin" } }
    );
    assert.equal(pathNodeIsCurrentNode(deps), true);
  });

  it("POSIX: false when an earlier PATH entry holds a different node", function () {
    const deps = fake(
      { "/usr/bin/node": "/usr/bin/node", "/opt/node-22/bin/node": "/opt/node-22/bin/node" },
      { platform: "linux", cwd: "/work", execPath: "/opt/node-22/bin/node", env: { PATH: "/usr/bin:/opt/node-22/bin" } }
    );
    assert.equal(pathNodeIsCurrentNode(deps), false);
  });

  it("POSIX: an empty PATH entry is the current directory", function () {
    const deps = fake(
      { "/work/node": "/work/node", "/opt/node-22/bin/node": "/opt/node-22/bin/node" },
      { platform: "linux", cwd: "/work", execPath: "/opt/node-22/bin/node", env: { PATH: ":/opt/node-22/bin" } }
    );
    assert.equal(pathNodeIsCurrentNode(deps), false);
  });

  it("false when no node is on PATH", function () {
    const deps = fake({}, { platform: "linux", cwd: "/work", execPath: "/opt/node/bin/node", env: { PATH: "/usr/bin" } });
    assert.equal(pathNodeIsCurrentNode(deps), false);
    assert.equal(pathNodeIsCurrentNode({ ...deps, env: {} }), false);
  });

  it("Windows: searches the current directory first, PATHEXT order, case-insensitively", function () {
    const execPath = "C:\\Program Files\\nodejs\\node.exe";
    const base = { platform: "win32", cwd: "C:\\work", execPath, env: { PATH: '"C:\\Program Files\\nodejs";C:\\Windows', PATHEXT: ".com;.exe;.bat;.cmd" } };
    assert.equal(
      pathNodeIsCurrentNode(fake({ "C:\\Program Files\\nodejs\\node.exe": "c:\\program files\\nodejs\\NODE.EXE" }, base)),
      true
    );
    // A node.cmd in the current directory shadows PATH, as it does for cmd.exe.
    assert.equal(
      pathNodeIsCurrentNode(
        fake({ "C:\\work\\node.cmd": "C:\\work\\node.cmd", "C:\\Program Files\\nodejs\\node.exe": execPath }, base)
      ),
      false
    );
    // An extensionless `node` file is never what cmd.exe runs.
    assert.equal(
      pathNodeIsCurrentNode(fake({ "C:\\work\\node": "C:\\work\\node", "C:\\Program Files\\nodejs\\node.exe": execPath }, base)),
      true
    );
  });

  it("on the real filesystem, recognizes this node's own directory on PATH", function () {
    const env = { PATH: path.dirname(process.execPath), PATHEXT: process.env.PATHEXT };
    assert.equal(pathNodeIsCurrentNode({ env, cwd: os.tmpdir() }), true);
    assert.equal(pathNodeIsCurrentNode({ env: { ...env, PATH: os.tmpdir() }, cwd: os.tmpdir() }), false);
  });
});

describe("runCode javascript availability check", function () {
  this.timeout(60000);
  let savedPath;
  let emptyDir;
  beforeEach(function () {
    savedPath = process.env.PATH;
    emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-nonode-"));
  });
  afterEach(function () {
    process.env.PATH = savedPath;
    fs.rmSync(emptyDir, { recursive: true, force: true });
  });

  it("still FAILs as unavailable when no node is on PATH", async function () {
    process.env.PATH = emptyDir;
    const result = await runCode({
      config: { logLevel: "silent" },
      step: { runCode: { language: "javascript", code: "console.log('x')" } },
    });
    assert.equal(result.status, "FAIL");
    assert.match(result.description, /Command node is unavailable/);
  });

  it("runs the step when node is on PATH", async function () {
    process.env.PATH = `${path.dirname(process.execPath)}${path.delimiter}${savedPath}`;
    const result = await runCode({
      config: { logLevel: "silent" },
      step: { runCode: { language: "javascript", code: "console.log('ran-it')" } },
    });
    assert.equal(result.status, "PASS", result.description);
    assert.match(result.outputs.stdio.stdout, /ran-it/);
  });
});
