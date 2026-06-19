import assert from "node:assert/strict";
import { evaluateAssertion } from "../dist/core/expressions.js";
import {
  buildConditionContext,
  evaluateImplicitAssertions,
} from "../dist/core/routing.js";

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

// Shared mechanism: evaluate an ordered list of applicable implicit-assertion
// specs against a condition context, in order, with FAIL short-circuit and a
// FAIL>WARNING>SKIPPED>PASS roll-up.
describe("routing: evaluateImplicitAssertions", function () {
  const ctx = buildConditionContext({
    outputs: {
      exitCode: 0,
      stdioMatched: true,
      variation: 0.02,
    },
  });

  it("empty specs -> [] and status PASS", async function () {
    const { assertions, status } = await evaluateImplicitAssertions([], ctx);
    assert.deepEqual(assertions, []);
    assert.equal(status, "PASS");
  });

  it("a passing chain -> all PASS, status PASS", async function () {
    const specs = [
      { statement: "$$outputs.exitCode oneOf [0]", severity: "fail" },
      { statement: "$$outputs.stdioMatched == true", severity: "fail" },
      { statement: "$$outputs.variation <= 0.05", severity: "warning" },
    ];
    const { assertions, status } = await evaluateImplicitAssertions(specs, ctx);
    assert.equal(status, "PASS");
    assert.equal(assertions.length, 3);
    assert.ok(assertions.every((a) => a.result === "PASS"));
    assert.ok(assertions.every((a) => a.source === "implicit"));
    assert.equal(assertions[0].statement, "$$outputs.exitCode oneOf [0]");
  });

  it("a FAIL then a later applicable check -> [FAIL, SKIPPED], status FAIL", async function () {
    const specs = [
      { statement: "$$outputs.exitCode oneOf [1]", severity: "fail" },
      { statement: "$$outputs.stdioMatched == true", severity: "fail" },
    ];
    const { assertions, status } = await evaluateImplicitAssertions(specs, ctx);
    assert.equal(status, "FAIL");
    assert.equal(assertions.length, 2);
    assert.equal(assertions[0].result, "FAIL");
    assert.equal(assertions[1].result, "SKIPPED");
  });

  it("a WARNING-severity false -> WARNING, does not short-circuit a later PASS", async function () {
    const specs = [
      { statement: "$$outputs.variation <= 0.01", severity: "warning" },
      { statement: "$$outputs.exitCode oneOf [0]", severity: "fail" },
    ];
    const { assertions, status } = await evaluateImplicitAssertions(specs, ctx);
    assert.equal(status, "WARNING");
    assert.equal(assertions.length, 2);
    assert.equal(assertions[0].result, "WARNING");
    assert.equal(assertions[1].result, "PASS");
  });

  it("severity defaults to fail when omitted", async function () {
    const specs = [{ statement: "$$outputs.exitCode oneOf [1]" }];
    const { assertions, status } = await evaluateImplicitAssertions(specs, ctx);
    assert.equal(status, "FAIL");
    assert.equal(assertions[0].result, "FAIL");
  });
});
