import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { killTree } from "../dist/core/tests.js";

// Confirms a pid is alive (`process.kill(pid, 0)` doesn't throw) or dead.
function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe("killTree", function () {
  this.timeout(15000);

  it("resolves only after the process is actually terminated", async function () {
    const tmp = path.join(os.tmpdir(), `dd-killtree-test-${process.pid}.js`);
    fs.writeFileSync(tmp, `setInterval(() => {}, 100000);`);
    const proc = spawn(process.execPath, [tmp], { stdio: "ignore" });
    try {
      // Wait for the child to actually be running before we try to kill it.
      await new Promise((resolve) => {
        if (proc.pid) return resolve();
        proc.once("spawn", resolve);
      });
      assert.ok(isAlive(proc.pid), "expected the spawned process to be alive");

      await killTree(proc.pid);

      // No polling/setTimeout here on purpose: killTree() resolves only once
      // the pid is confirmed gone — after tree-kill's callback it polls
      // `process.kill(pid, 0)` on POSIX (where the callback only means the
      // signal was sent, not that the process exited) until the pid no
      // longer exists. So the process must already be dead the instant the
      // await returns. Before the fix, the run-end teardown fired `kill()`
      // without awaiting this at all, so control returned (and the run could
      // exit) while the process was still alive.
      assert.equal(
        isAlive(proc.pid),
        false,
        "expected the process to be terminated synchronously after killTree resolves"
      );
    } finally {
      try {
        process.kill(proc.pid, "SIGKILL");
      } catch {
        // already dead — expected on the happy path
      }
      fs.rmSync(tmp, { force: true });
    }
  });

  it("resolves without throwing for an already-dead pid", async function () {
    const tmp = path.join(os.tmpdir(), `dd-killtree-dead-${process.pid}.js`);
    fs.writeFileSync(tmp, `process.exit(0);`);
    const proc = spawn(process.execPath, [tmp], { stdio: "ignore" });
    await new Promise((resolve) => proc.once("exit", resolve));

    await assert.doesNotReject(() => killTree(proc.pid));

    fs.rmSync(tmp, { force: true });
  });

  it("resolves immediately for an undefined pid", async function () {
    await assert.doesNotReject(() => killTree(undefined));
  });
});
