// Unit tests for the warm-phase executor (src/core/warmPhase.ts).
// executeWarmTasks runs planned tasks through the run's resource-aware pool:
// best-effort (a failed task warns and never rejects the phase), tag-exclusive
// (cache-mutating tasks serialize on RUNTIME_INSTALL_RESOURCE), and bounded by
// WARM_POOL_LIMIT (docs/design/warm-phase.md, phase B1).
import assert from "node:assert/strict";
import {
  executeWarmTasks,
  WARM_POOL_LIMIT,
  RUNTIME_INSTALL_RESOURCE,
} from "../dist/core/warmPhase.js";
import { createResourceRegistry } from "../dist/core/utils.js";

function task(name, kind, exclusiveResources = []) {
  return { name, kind, exclusiveResources, payload: {} };
}

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

describe("warm phase: executeWarmTasks", function () {
  it("returns an empty report for an empty plan", async function () {
    const report = await executeWarmTasks({
      tasks: [],
      registry: createResourceRegistry(),
      runTask: async () => ({ outcome: "warmed" }),
      log: () => {},
    });
    assert.deepEqual(report.tasks, []);
    assert.equal(typeof report.durationMs, "number");
  });

  it("isolates a failing task: siblings complete, the phase resolves, a warning logs", async function () {
    const logs = [];
    const report = await executeWarmTasks({
      tasks: [
        task("a", "browser-install"),
        task("b", "browser-install"),
        task("c", "device-boot"),
      ],
      registry: createResourceRegistry(),
      runTask: async (t) => {
        if (t.name === "b") throw new Error("boom");
        return { outcome: "warmed" };
      },
      log: (level, msg) => logs.push({ level, msg }),
    });
    assert.equal(report.tasks.length, 3);
    const byName = new Map(report.tasks.map((r) => [r.name, r]));
    assert.equal(byName.get("a").outcome, "warmed");
    assert.equal(byName.get("b").outcome, "failed");
    assert.match(byName.get("b").note, /boom/);
    assert.equal(byName.get("c").outcome, "warmed");
    assert.ok(
      logs.some((l) => l.level === "warning" && /warm task 'b' failed/i.test(l.msg)),
      `expected a warning about task b, got: ${JSON.stringify(logs)}`
    );
  });

  it("carries skipped outcomes and notes through to the report", async function () {
    const report = await executeWarmTasks({
      tasks: [task("w", "wda-check")],
      registry: createResourceRegistry(),
      runTask: async () => ({ outcome: "skipped", note: "no prebuilt WDA" }),
      log: () => {},
    });
    assert.equal(report.tasks[0].outcome, "skipped");
    assert.equal(report.tasks[0].note, "no prebuilt WDA");
  });

  it("never runs two runtime-install tasks concurrently", async function () {
    let inFlight = 0;
    let maxInFlight = 0;
    const gates = [deferred(), deferred()];
    let started = 0;
    const run = executeWarmTasks({
      tasks: [
        task("i1", "browser-install", [RUNTIME_INSTALL_RESOURCE]),
        task("i2", "driver-install", [RUNTIME_INSTALL_RESOURCE]),
      ],
      registry: createResourceRegistry(),
      runTask: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await gates[started++].promise;
        inFlight--;
        return { outcome: "warmed" };
      },
      log: () => {},
    });
    // Let the pool spin up, then release the tasks one at a time.
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(maxInFlight, 1);
    gates[0].resolve();
    await new Promise((r) => setTimeout(r, 20));
    gates[1].resolve();
    const report = await run;
    assert.equal(maxInFlight, 1);
    assert.equal(report.tasks.length, 2);
  });

  it("overlaps untagged tasks up to the warm pool ceiling", async function () {
    const total = WARM_POOL_LIMIT + 2;
    let inFlight = 0;
    let maxInFlight = 0;
    const gate = deferred();
    const run = executeWarmTasks({
      tasks: Array.from({ length: total }, (_, i) => task(`t${i}`, "device-boot")),
      registry: createResourceRegistry(),
      runTask: async () => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await gate.promise;
        inFlight--;
        return { outcome: "warmed" };
      },
      log: () => {},
    });
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(maxInFlight, WARM_POOL_LIMIT);
    gate.resolve();
    const report = await run;
    assert.equal(report.tasks.length, total);
    assert.equal(maxInFlight, WARM_POOL_LIMIT);
  });

  it("records per-task and total durations from the injected clock", async function () {
    let t = 0;
    const report = await executeWarmTasks({
      tasks: [task("a", "wda-check")],
      registry: createResourceRegistry(),
      runTask: async () => ({ outcome: "warmed" }),
      log: () => {},
      now: () => (t += 5),
    });
    assert.ok(report.tasks[0].durationMs >= 0);
    assert.ok(report.durationMs >= report.tasks[0].durationMs);
  });
});
