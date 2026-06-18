import assert from "node:assert/strict";
import { evaluateAssertion } from "../dist/core/expressions.js";
import { buildConditionContext } from "../dist/core/routing.js";

// Phase 3: prove the locked $$ meta-value namespace ($$platform, $$outputs.*,
// $$steps.<id>.outputs.*) resolves through the REAL evaluateAssertion against a
// context produced by buildConditionContext. No runtime caller exists yet.
describe("routing: buildConditionContext + meta-value resolution", function () {
  // Real output shapes from the action code.
  const currentOutputs = {
    exitCode: 0,
    stdio: { stdout: "all ok here", stderr: "" },
    response: { statusCode: 200, body: { id: 1 }, headers: {} },
    element: { text: "Submit", enabled: true },
  };
  const steps = {
    build: { outputs: { exitCode: 0, stdio: { stdout: "built", stderr: "" } } },
    fetch: { outputs: { response: { statusCode: 200, body: {} } } },
  };

  function ctx(overrides = {}) {
    return buildConditionContext({
      platform: "windows",
      outputs: currentOutputs,
      steps,
      ...overrides,
    });
  }

  // --- shape / signature ---
  it("returns { platform, outputs, steps } with the passed values", function () {
    const c = buildConditionContext({
      platform: "linux",
      outputs: currentOutputs,
      steps,
    });
    assert.deepEqual(c, { platform: "linux", outputs: currentOutputs, steps });
  });

  it("no args / partial args do not throw and default missing to {}", function () {
    assert.deepEqual(buildConditionContext(), {
      platform: undefined,
      outputs: {},
      steps: {},
    });
    const c = buildConditionContext({ platform: "mac" });
    assert.deepEqual(c, { platform: "mac", outputs: {}, steps: {} });
  });

  // --- $$platform ---
  it("$$platform == windows -> true", async function () {
    assert.equal(await evaluateAssertion("$$platform == windows", ctx()), true);
  });
  it("$$platform == windows -> false on linux", async function () {
    assert.equal(
      await evaluateAssertion(
        "$$platform == windows",
        ctx({ platform: "linux" })
      ),
      false
    );
  });
  it("$$platform != linux -> true", async function () {
    assert.equal(await evaluateAssertion("$$platform != linux", ctx()), true);
  });

  // --- $$outputs.* (numeric) ---
  it("$$outputs.exitCode == 0 -> true", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.exitCode == 0", ctx()),
      true
    );
  });
  it("$$outputs.exitCode != 0 -> false", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.exitCode != 0", ctx()),
      false
    );
  });

  // --- $$outputs.* (nested) ---
  it('$$outputs.stdio.stdout contains "ok" -> true', async function () {
    assert.equal(
      await evaluateAssertion('$$outputs.stdio.stdout contains "ok"', ctx()),
      true
    );
  });
  it('$$outputs.stdio.stdout contains "nope" -> false', async function () {
    assert.equal(
      await evaluateAssertion('$$outputs.stdio.stdout contains "nope"', ctx()),
      false
    );
  });
  it("$$outputs.response.statusCode == 200 -> true", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.response.statusCode == 200", ctx()),
      true
    );
  });

  // --- find-style nested boolean ---
  it("$$outputs.element.enabled == true -> true", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.element.enabled == true", ctx()),
      true
    );
  });

  // --- $$steps.<id>.outputs.* (cross-step) ---
  it("$$steps.build.outputs.exitCode == 0 -> true", async function () {
    assert.equal(
      await evaluateAssertion("$$steps.build.outputs.exitCode == 0", ctx()),
      true
    );
  });
  it("$$steps.fetch.outputs.response.statusCode == 200 -> true", async function () {
    assert.equal(
      await evaluateAssertion(
        "$$steps.fetch.outputs.response.statusCode == 200",
        ctx()
      ),
      true
    );
  });

  // --- fail-closed (Phase 2 behavior) on missing refs ---
  it("$$steps.missing.outputs.x == 1 -> false (no throw)", async function () {
    assert.equal(
      await evaluateAssertion("$$steps.missing.outputs.x == 1", ctx()),
      false
    );
  });
  it("$$outputs.notThere == 1 -> false (no throw)", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.notThere == 1", ctx()),
      false
    );
  });
  it("unknown refs fail closed even with empty context", async function () {
    const empty = buildConditionContext();
    assert.equal(
      await evaluateAssertion("$$outputs.exitCode == 0", empty),
      false
    );
    assert.equal(
      await evaluateAssertion("$$steps.build.outputs.exitCode == 0", empty),
      false
    );
  });
});
