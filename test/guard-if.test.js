import assert from "node:assert/strict";
import {
  buildConditionContext,
  evaluateGuard,
} from "../dist/core/routing.js";

// Step-level guard `if`: evaluated BEFORE a step runs. `string | string[]`
// (array = AND, all must be truthy). Fails CLOSED via evaluateAssertion (an
// unresolvable `$$` -> false). Empty/undefined -> true (guard absent).
describe("routing: evaluateGuard", function () {
  const ctx = buildConditionContext({
    platform: "windows",
    steps: {
      a: { outputs: { exitCode: 0 } },
      b: { outputs: { exitCode: 1 } },
    },
  });

  // --- single string ---
  it("single string, true -> true", async function () {
    assert.equal(await evaluateGuard("$$platform == windows", ctx), true);
  });
  it("single string, false -> false", async function () {
    assert.equal(await evaluateGuard("$$platform == linux", ctx), false);
  });

  // --- string[] AND ---
  it("string[] all-true -> true", async function () {
    assert.equal(
      await evaluateGuard(
        ["$$platform == windows", "$$steps.a.outputs.exitCode == 0"],
        ctx
      ),
      true
    );
  });
  it("string[] one-false -> false", async function () {
    assert.equal(
      await evaluateGuard(
        ["$$platform == windows", "$$steps.a.outputs.exitCode == 1"],
        ctx
      ),
      false
    );
  });

  // --- fail closed on unresolvable $$ ---
  it("unresolvable $$ -> false (fail closed)", async function () {
    assert.equal(
      await evaluateGuard("$$steps.missing.outputs.exitCode == 0", ctx),
      false
    );
  });
  it("array with an unresolvable entry -> false (fail closed)", async function () {
    assert.equal(
      await evaluateGuard(
        ["$$platform == windows", "$$outputs.notThere == 1"],
        ctx
      ),
      false
    );
  });

  // --- empty / undefined -> true (guard absent) ---
  it("undefined -> true", async function () {
    assert.equal(await evaluateGuard(undefined, ctx), true);
  });
  it("null -> true", async function () {
    assert.equal(await evaluateGuard(null, ctx), true);
  });
  it("empty array -> true", async function () {
    assert.equal(await evaluateGuard([], ctx), true);
  });
  it("array of only non-strings -> true (no usable conditions)", async function () {
    assert.equal(await evaluateGuard([{}, 1], ctx), true);
  });

  // --- cross-step accumulator semantics ---
  it("$$steps.a.outputs.exitCode == 0 -> true (prior step output)", async function () {
    assert.equal(
      await evaluateGuard("$$steps.a.outputs.exitCode == 0", ctx),
      true
    );
  });
  it("$$steps.b.outputs.exitCode == 0 -> false (prior step output)", async function () {
    assert.equal(
      await evaluateGuard("$$steps.b.outputs.exitCode == 0", ctx),
      false
    );
  });
});
