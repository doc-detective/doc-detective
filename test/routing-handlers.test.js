import assert from "node:assert/strict";
import {
  buildConditionContext,
  resolveStepRouting,
} from "../dist/core/routing.js";

// Step-level routing handlers: onPass/onFail/onWarning/onSkip. Each is an array
// of routing entries ({ if?, <action> }); the FIRST entry whose `if` matches
// wins (no `if` => always matches). This phase acts on `continue` and `stop`.
// Defaults reproduce today exactly: PASS/WARNING/SKIPPED -> continue,
// FAIL -> stop (test). flow != verdict: routing never changes the result.
describe("routing: resolveStepRouting", function () {
  const ctx = buildConditionContext({
    platform: "windows",
    outputs: { exitCode: 0 },
    steps: { a: { outputs: { exitCode: 1 } } },
  });

  // --- defaults (no handlers) reproduce today ---
  it("PASS, no handlers -> continue", async function () {
    assert.deepEqual(
      await resolveStepRouting({ status: "PASS", step: {}, context: ctx }),
      { action: "continue" }
    );
  });
  it("FAIL, no handlers -> stop test", async function () {
    assert.deepEqual(
      await resolveStepRouting({ status: "FAIL", step: {}, context: ctx }),
      { action: "stop", scope: "test" }
    );
  });
  it("WARNING, no handlers -> continue", async function () {
    assert.deepEqual(
      await resolveStepRouting({ status: "WARNING", step: {}, context: ctx }),
      { action: "continue" }
    );
  });
  it("SKIPPED, no handlers -> continue", async function () {
    assert.deepEqual(
      await resolveStepRouting({ status: "SKIPPED", step: {}, context: ctx }),
      { action: "continue" }
    );
  });

  // --- explicit overrides ---
  it("onFail [{continue:true}] -> continue (continue past failure)", async function () {
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ continue: true }] },
        context: ctx,
      }),
      { action: "continue" }
    );
  });
  it("onPass [{stop:'test'}] -> stop test", async function () {
    assert.deepEqual(
      await resolveStepRouting({
        status: "PASS",
        step: { onPass: [{ stop: "test" }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });
  it("onSkip [{stop:'test'}] -> stop test", async function () {
    assert.deepEqual(
      await resolveStepRouting({
        status: "SKIPPED",
        step: { onSkip: [{ stop: "test" }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });
  it("stop scope is preserved (spec / run)", async function () {
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ stop: "run" }] },
        context: ctx,
      }),
      { action: "stop", scope: "run" }
    );
  });

  // --- if-selector matching: first match wins ---
  it("first entry whose `if` matches wins", async function () {
    // platform is windows, so the linux entry is skipped; the second matches.
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: {
          onFail: [
            { if: "$$platform == linux", stop: "test" },
            { continue: true },
          ],
        },
        context: ctx,
      }),
      { action: "continue" }
    );
  });
  it("entry `if` can reference the just-run step's $$outputs", async function () {
    assert.deepEqual(
      await resolveStepRouting({
        status: "PASS",
        step: { onPass: [{ if: "$$outputs.exitCode == 0", stop: "test" }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });
  it("no entry matches -> falls back to default for the status", async function () {
    // FAIL default is stop; the only entry's `if` does not match.
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ if: "$$platform == linux", continue: true }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });

  // --- empty / deferred actions -> default ---
  it("empty handler array -> default", async function () {
    assert.deepEqual(
      await resolveStepRouting({
        status: "PASS",
        step: { onPass: [] },
        context: ctx,
      }),
      { action: "continue" }
    );
  });
  it("deferred actions (retry/goToStep/goToTest) -> default for the status", async function () {
    // Not implemented in this phase: behave as if no handler matched.
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ retry: { limit: 2 } }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
    assert.deepEqual(
      await resolveStepRouting({
        status: "PASS",
        step: { onPass: [{ goToStep: "x" }] },
        context: ctx,
      }),
      { action: "continue" }
    );
  });
  it("a matched deferred-action entry stops scanning (a later entry can't override it)", async function () {
    // The first entry matches (no `if`) but its action (retry) is deferred ->
    // return the status default and STOP scanning, so the trailing
    // `{continue:true}` must NOT take effect. FAIL default is stop:test.
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ retry: { limit: 2 } }, { continue: true }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });
  it("an entry `if` can reference the just-run step itself via $$steps.<self>", async function () {
    // The runtime records a ran step into the steps map before resolving its
    // own routing, so a handler `if` may read `$$steps.<self>.outputs.*`. Lock
    // that the helper resolves such a self-reference (here `a`).
    assert.deepEqual(
      await resolveStepRouting({
        status: "PASS",
        step: { onPass: [{ if: "$$steps.a.outputs.exitCode == 1", stop: "test" }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });
});
