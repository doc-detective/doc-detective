import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import {
  probePtyAllocation,
  assertConptyAllocatable,
  PTY_PROBE_TIMEOUT_MS,
} from "../dist/core/ptyWatchdog.js";

// A hand-driven fake worker: the test registers handlers via probePtyAllocation,
// then emits events to drive the outcome. `terminated` counts terminate() calls.
function makeFakeWorker() {
  const handlers = { message: [], error: [], exit: [] };
  let terminated = 0;
  return {
    on(event, cb) {
      (handlers[event] ||= []).push(cb);
    },
    terminate() {
      terminated++;
      return Promise.resolve(0);
    },
    emit(event, arg) {
      for (const cb of handlers[event] || []) cb(arg);
    },
    get terminated() {
      return terminated;
    },
  };
}

describe("probePtyAllocation (ConPTY watchdog, issue #501)", function () {
  it("reports healthy when the worker posts { ok: true } and terminates it", async function () {
    const worker = makeFakeWorker();
    const p = probePtyAllocation({
      ptyModulePath: "x",
      timeoutMs: 1000,
      createWorker: () => worker,
    });
    // Handlers are registered synchronously inside probePtyAllocation.
    worker.emit("message", { ok: true });
    const res = await p;
    assert.equal(res.outcome, "healthy");
    assert.equal(worker.terminated, 1);
  });

  it("reports inconclusive (not wedged) when the worker posts { ok: false }", async function () {
    const worker = makeFakeWorker();
    const p = probePtyAllocation({
      ptyModulePath: "x",
      timeoutMs: 1000,
      createWorker: () => worker,
    });
    worker.emit("message", { ok: false, error: "addon can't load in worker" });
    const res = await p;
    assert.equal(res.outcome, "inconclusive");
    assert.match(res.detail, /addon can't load/);
  });

  it("reports inconclusive when the worker emits an error", async function () {
    const worker = makeFakeWorker();
    const p = probePtyAllocation({
      ptyModulePath: "x",
      timeoutMs: 1000,
      createWorker: () => worker,
    });
    worker.emit("error", new Error("boom"));
    const res = await p;
    assert.equal(res.outcome, "inconclusive");
    assert.match(res.detail, /worker-error/);
  });

  it("reports inconclusive when the worker exits without a verdict", async function () {
    const worker = makeFakeWorker();
    const p = probePtyAllocation({
      ptyModulePath: "x",
      timeoutMs: 1000,
      createWorker: () => worker,
    });
    worker.emit("exit", 1);
    const res = await p;
    assert.equal(res.outcome, "inconclusive");
    assert.match(res.detail, /without a result/);
  });

  it("reports WEDGED and terminates the worker when nothing arrives before the budget", async function () {
    const worker = makeFakeWorker();
    const res = await probePtyAllocation({
      ptyModulePath: "x",
      timeoutMs: 20,
      createWorker: () => worker,
    });
    assert.equal(res.outcome, "wedged");
    assert.match(res.detail, /no response in 20ms/);
    assert.equal(worker.terminated, 1);
  });

  it("reports inconclusive (never wedged) when a worker can't even be created", async function () {
    const res = await probePtyAllocation({
      ptyModulePath: "x",
      createWorker: () => {
        throw new Error("workers disabled");
      },
    });
    assert.equal(res.outcome, "inconclusive");
    assert.match(res.detail, /worker-unavailable/);
  });

  it("exposes a sane default budget", function () {
    assert.equal(typeof PTY_PROBE_TIMEOUT_MS, "number");
    assert.ok(PTY_PROBE_TIMEOUT_MS >= 1000);
  });

  it("drives a REAL worker end-to-end and degrades a bad backend path to inconclusive", async function () {
    // Exercises the actual node:worker_threads plumbing + dist/core/ptyProbeWorker.js:
    // a nonexistent backend path makes the worker's dynamic import throw, which it
    // reports as { ok: false } — proving the worker resolves, runs, and messages back
    // without ever spawning a real PTY.
    this.timeout(20000);
    const marker = `dd-no-such-pty-backend-${process.pid}`;
    const res = await probePtyAllocation({
      ptyModulePath: path.join(os.tmpdir(), `${marker}.mjs`),
      timeoutMs: 15000,
    });
    assert.equal(res.outcome, "inconclusive");
    // The detail must carry the (missing) backend path from the worker's own
    // dynamic-import failure — proving main() actually ran inside the worker,
    // not that the worker failed to start (which would also read "inconclusive"
    // but would NOT mention our path). This guards against a regression where
    // the worker silently doesn't execute the probe body.
    assert.match(res.detail, new RegExp(marker));
  });
});

describe("assertConptyAllocatable (runShell SKIP gate)", function () {
  const wedged = async () => ({ outcome: "wedged", detail: "no response in 15000ms" });
  const healthy = async () => ({ outcome: "healthy" });
  const inconclusive = async () => ({ outcome: "inconclusive", detail: "worker-error" });

  it("throws NODE_PTY_UNAVAILABLE when the probe is wedged on Windows", async function () {
    await assert.rejects(
      assertConptyAllocatable({
        ptyModulePath: "C:/pty",
        platform: "win32",
        probe: wedged,
      }),
      (err) => {
        assert.equal(err.code, "NODE_PTY_UNAVAILABLE");
        assert.match(err.message, /#501/);
        return true;
      }
    );
  });

  it("returns (proceeds to real spawn) when the probe is healthy or inconclusive", async function () {
    await assertConptyAllocatable({
      ptyModulePath: "C:/pty",
      platform: "win32",
      probe: healthy,
    });
    await assertConptyAllocatable({
      ptyModulePath: "C:/pty",
      platform: "win32",
      probe: inconclusive,
    });
  });

  it("never probes on non-Windows platforms", async function () {
    let probed = false;
    await assertConptyAllocatable({
      ptyModulePath: "/pty",
      platform: "linux",
      probe: async () => {
        probed = true;
        return { outcome: "wedged" };
      },
    });
    assert.equal(probed, false);
  });

  it("never probes when no backend path resolved", async function () {
    let probed = false;
    await assertConptyAllocatable({
      ptyModulePath: null,
      platform: "win32",
      probe: async () => {
        probed = true;
        return { outcome: "wedged" };
      },
    });
    assert.equal(probed, false);
  });
});
