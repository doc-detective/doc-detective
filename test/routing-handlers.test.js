import assert from "node:assert/strict";
import {
  buildConditionContext,
  resolveStepRouting,
  computeRetryDelay,
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
  it("deferred actions (goToStep/goToTest) -> default for the status", async function () {
    // Not implemented in this phase: behave as if no handler matched.
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ goToStep: "x" }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
    assert.deepEqual(
      await resolveStepRouting({
        status: "PASS",
        step: { onPass: [{ goToTest: "x" }] },
        context: ctx,
      }),
      { action: "continue" }
    );
  });
  it("a matched deferred-action entry stops scanning (a later entry can't override it)", async function () {
    // The first entry matches (no `if`) but its action (goToStep) is deferred ->
    // return the status default and STOP scanning, so the trailing
    // `{continue:true}` must NOT take effect. FAIL default is stop:test.
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ goToStep: "x" }, { continue: true }] },
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

  // --- retry action ---
  it("onFail [{retry:{limit:3}}] -> retry decision with normalized delay/backoff", async function () {
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ retry: { limit: 3 } }] },
        context: ctx,
      }),
      { action: "retry", limit: 3, delay: 0, backoff: "fixed" }
    );
  });
  it("retry passes through delay + backoff", async function () {
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ retry: { limit: 2, delay: 1000, backoff: "exponential" } }] },
        context: ctx,
      }),
      { action: "retry", limit: 2, delay: 1000, backoff: "exponential" }
    );
  });
  it("retry only applies to the matching status' handler", async function () {
    // The retry is on onFail, so a PASS resolves onPass (default continue).
    assert.deepEqual(
      await resolveStepRouting({
        status: "PASS",
        step: { onFail: [{ retry: { limit: 2 } }] },
        context: ctx,
      }),
      { action: "continue" }
    );
  });
  it("retry honors its `if` selector", async function () {
    // exitCode is 0 in ctx outputs, so this retry `if` does not match -> default.
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ if: "$$outputs.exitCode == 1", retry: { limit: 2 } }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });

  // --- skipRetry (post-exhaustion re-resolution) ---
  it("skipRetry falls past a retry entry to the status default", async function () {
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ retry: { limit: 3 } }] },
        context: ctx,
        skipRetry: true,
      }),
      { action: "stop", scope: "test" }
    );
  });
  it("skipRetry falls past a retry entry to a later non-retry entry (retry-then-continue)", async function () {
    assert.deepEqual(
      await resolveStepRouting({
        status: "FAIL",
        step: { onFail: [{ retry: { limit: 3 } }, { continue: true }] },
        context: ctx,
        skipRetry: true,
      }),
      { action: "continue" }
    );
  });
});

describe("routing: computeRetryDelay", function () {
  it("returns 0 when delay is 0 / falsy", function () {
    assert.equal(computeRetryDelay(0, "fixed", 0), 0);
    assert.equal(computeRetryDelay(0, "exponential", 3), 0);
    assert.equal(computeRetryDelay(undefined, "fixed", 1), 0);
  });
  it("fixed backoff returns the same delay every time", function () {
    assert.equal(computeRetryDelay(1000, "fixed", 0), 1000);
    assert.equal(computeRetryDelay(1000, "fixed", 1), 1000);
    assert.equal(computeRetryDelay(1000, "fixed", 5), 1000);
  });
  it("exponential backoff doubles per retry index", function () {
    assert.equal(computeRetryDelay(1000, "exponential", 0), 1000);
    assert.equal(computeRetryDelay(1000, "exponential", 1), 2000);
    assert.equal(computeRetryDelay(1000, "exponential", 2), 4000);
  });
  it("caps the computed delay at 3,600,000 ms (avoids setTimeout overflow->1ms)", function () {
    // Without a cap, delay * 2^idx can exceed 2^31-1 ms, which setTimeout
    // clamps to 1ms — silently turning long waits into near-instant re-runs.
    assert.equal(computeRetryDelay(3_600_000, "exponential", 20), 3_600_000);
    assert.equal(computeRetryDelay(3_600_000, "fixed", 0), 3_600_000);
  });
});
