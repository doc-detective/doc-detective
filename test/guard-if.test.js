import assert from "node:assert/strict";
import {
  buildConditionContext,
  evaluateGuard,
  guardReferencesSteps,
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
    // Intentionally passes values outside the GuardCondition (string|string[])
    // type to exercise the defensive non-string filter in normalization.
    assert.equal(await evaluateGuard([{}, 1], ctx), true);
  });
  it("empty string -> true (guard absent)", async function () {
    assert.equal(await evaluateGuard("", ctx), true);
  });
  it("whitespace-only string -> true (guard absent)", async function () {
    assert.equal(await evaluateGuard("   ", ctx), true);
  });
  it("array of only empty/whitespace strings -> true (no usable conditions)", async function () {
    assert.equal(await evaluateGuard(["", "   "], ctx), true);
  });
  it("array with empty entries dropped -> AND of the rest", async function () {
    // The empty/whitespace entries are dropped; only the real condition counts.
    assert.equal(
      await evaluateGuard(["", "$$platform == windows", "  "], ctx),
      true
    );
    assert.equal(
      await evaluateGuard(["", "$$platform == linux"], ctx),
      false
    );
  });

  // --- guard referencing a guard-skipped prior step (fail closed) ---
  it("$$steps.<id> for a guard-skipped step -> false (fail closed)", async function () {
    // A guard-skipped step never writes its stepId into stepOutputsById, so a
    // downstream guard referencing it resolves against an empty steps map and
    // fails closed (the downstream step is also skipped).
    const emptyCtx = buildConditionContext({ platform: "windows", steps: {} });
    assert.equal(
      await evaluateGuard("$$steps.a.outputs.exitCode == 0", emptyCtx),
      false
    );
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

// guardReferencesSteps: authoring-time detector for spec/test `if` that
// reference `$$steps.*` (only available at step scope) — used to warn that the
// guard will always fail closed at spec/test scope.
describe("routing: guardReferencesSteps", function () {
  it("string referencing $$steps. -> true", function () {
    assert.equal(
      guardReferencesSteps("$$steps.a.outputs.exitCode == 0"),
      true
    );
  });
  it("array with a $$steps. entry -> true", function () {
    assert.equal(
      guardReferencesSteps(["$$platform == windows", "$$steps.a.outputs.x == 1"]),
      true
    );
  });
  it("string without $$steps. -> false", function () {
    assert.equal(guardReferencesSteps("$$platform == windows"), false);
  });
  it("array without $$steps. -> false", function () {
    assert.equal(
      guardReferencesSteps(["$$platform == windows", "$$outputs.x == 1"]),
      false
    );
  });
  it("undefined / non-string entries -> false", function () {
    assert.equal(guardReferencesSteps(undefined), false);
    assert.equal(guardReferencesSteps([{}, 1]), false);
  });
});
