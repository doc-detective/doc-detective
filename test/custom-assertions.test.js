import assert from "node:assert/strict";
import {
  buildConditionContext,
  evaluateImplicitAssertions,
  evaluateCustomAssertions,
} from "../dist/core/routing.js";

// Generalization of the shared evaluator: a `source` stamp and a `startFailed`
// short-circuit so custom assertions can reuse the SAME engine as implicit ones
// without touching the 8 implicit call sites.
describe("routing: evaluateImplicitAssertions (generalized)", function () {
  const ctx = buildConditionContext({
    outputs: { exitCode: 0, stdioMatched: true },
  });

  it("defaults: source 'implicit', no short-circuit (unchanged)", async function () {
    const specs = [{ statement: "$$outputs.exitCode == 0", severity: "fail" }];
    const { assertions, status } = await evaluateImplicitAssertions(specs, ctx);
    assert.equal(status, "PASS");
    assert.equal(assertions[0].source, "implicit");
    assert.equal(assertions[0].result, "PASS");
  });

  it("source option stamps the record source", async function () {
    const specs = [{ statement: "$$outputs.exitCode == 0", severity: "fail" }];
    const { assertions } = await evaluateImplicitAssertions(specs, ctx, {
      source: "custom",
    });
    assert.equal(assertions[0].source, "custom");
  });

  it("startFailed=true forces every spec to SKIPPED (no evaluation)", async function () {
    const specs = [
      { statement: "$$outputs.exitCode == 0", severity: "fail" },
      { statement: "$$outputs.stdioMatched == true", severity: "fail" },
    ];
    const { assertions, status } = await evaluateImplicitAssertions(specs, ctx, {
      source: "custom",
      startFailed: true,
    });
    assert.equal(status, "SKIPPED");
    assert.ok(assertions.every((a) => a.result === "SKIPPED"));
    assert.ok(assertions.every((a) => a.source === "custom"));
  });
});

// The runStep-facing helper: decides whether to evaluate or skip custom
// assertions, evaluates them, appends to actionResult.assertions, and re-rolls
// actionResult.status. Tested as a pure unit (no driver / HTTP).
describe("routing: evaluateCustomAssertions", function () {
  it("custom PASS on a passing action -> status PASS, source 'custom'", async function () {
    const actionResult = {
      status: "PASS",
      outputs: { exitCode: 0 },
      assertions: [
        { statement: "$$outputs.exitCode oneOf [0]", source: "implicit", result: "PASS" },
      ],
    };
    await evaluateCustomAssertions({
      step: { assertions: "$$outputs.exitCode == 0" },
      actionResult,
    });
    assert.equal(actionResult.status, "PASS");
    const custom = actionResult.assertions.filter((a) => a.source === "custom");
    assert.equal(custom.length, 1);
    assert.equal(custom[0].result, "PASS");
  });

  it("custom FAIL on a passing action -> status FAIL", async function () {
    const actionResult = {
      status: "PASS",
      outputs: { exitCode: 0 },
      assertions: [
        { statement: "$$outputs.exitCode oneOf [0]", source: "implicit", result: "PASS" },
      ],
    };
    await evaluateCustomAssertions({
      step: { assertions: "$$outputs.exitCode == 1" },
      actionResult,
    });
    assert.equal(actionResult.status, "FAIL");
    const custom = actionResult.assertions.filter((a) => a.source === "custom");
    assert.equal(custom[0].result, "FAIL");
  });

  it("string[] form is AND: all pass -> PASS", async function () {
    const actionResult = {
      status: "PASS",
      outputs: { exitCode: 0, value: 5 },
      assertions: [{ statement: "x", source: "implicit", result: "PASS" }],
    };
    await evaluateCustomAssertions({
      step: { assertions: ["$$outputs.exitCode == 0", "$$outputs.value == 5"] },
      actionResult,
    });
    assert.equal(actionResult.status, "PASS");
    const custom = actionResult.assertions.filter((a) => a.source === "custom");
    assert.equal(custom.length, 2);
    assert.ok(custom.every((a) => a.result === "PASS"));
  });

  it("string[] form is AND: one fails -> FAIL, and later short-circuits to SKIPPED", async function () {
    const actionResult = {
      status: "PASS",
      outputs: { exitCode: 0, value: 5 },
      assertions: [{ statement: "x", source: "implicit", result: "PASS" }],
    };
    await evaluateCustomAssertions({
      step: { assertions: ["$$outputs.exitCode == 1", "$$outputs.value == 5"] },
      actionResult,
    });
    assert.equal(actionResult.status, "FAIL");
    const custom = actionResult.assertions.filter((a) => a.source === "custom");
    assert.equal(custom[0].result, "FAIL");
    assert.equal(custom[1].result, "SKIPPED");
  });

  it("after an implicit FAIL: custom records are SKIPPED, status stays FAIL", async function () {
    const actionResult = {
      status: "FAIL",
      outputs: { exitCode: 1 },
      assertions: [
        { statement: "$$outputs.exitCode oneOf [0]", source: "implicit", result: "FAIL" },
      ],
    };
    await evaluateCustomAssertions({
      step: { assertions: "$$outputs.exitCode == 1" },
      actionResult,
    });
    assert.equal(actionResult.status, "FAIL");
    const custom = actionResult.assertions.filter((a) => a.source === "custom");
    assert.equal(custom.length, 1);
    assert.equal(custom[0].result, "SKIPPED");
  });

  it("execution-error action (FAIL, NO implicit records) + custom -> custom SKIPPED, not evaluated", async function () {
    const actionResult = {
      status: "FAIL",
      description: "boom",
      // no assertions array at all (early return before any implicit eval)
    };
    await evaluateCustomAssertions({
      step: { assertions: "$$outputs.exitCode == 0" },
      actionResult,
    });
    assert.equal(actionResult.status, "FAIL");
    const custom = actionResult.assertions.filter((a) => a.source === "custom");
    assert.equal(custom.length, 1);
    assert.equal(custom[0].result, "SKIPPED");
  });

  it("SKIPPED-status action (no records) + custom -> custom SKIPPED, status stays SKIPPED (not flipped)", async function () {
    // A deliberately-skipped step (e.g. `wait: false`) returns status SKIPPED
    // with no assertion records. Custom assertions must NOT be evaluated and
    // must NOT re-roll the status. Both a passing and a failing custom expr
    // stay SKIPPED, and the action stays SKIPPED.
    const passing = {
      status: "SKIPPED",
      description: "Wait skipped.",
      outputs: { x: 1 },
    };
    await evaluateCustomAssertions({
      step: { assertions: "$$outputs.x == 1" },
      actionResult: passing,
    });
    assert.equal(passing.status, "SKIPPED");
    let custom = passing.assertions.filter((a) => a.source === "custom");
    assert.equal(custom.length, 1);
    assert.equal(custom[0].result, "SKIPPED");

    const failing = {
      status: "SKIPPED",
      description: "Wait skipped.",
      outputs: { x: 1 },
    };
    await evaluateCustomAssertions({
      step: { assertions: "$$outputs.x == 2" },
      actionResult: failing,
    });
    assert.equal(failing.status, "SKIPPED");
    custom = failing.assertions.filter((a) => a.source === "custom");
    assert.equal(custom.length, 1);
    assert.equal(custom[0].result, "SKIPPED");
  });

  it("unresolvable $$ in a custom expr -> FAIL (fail closed)", async function () {
    const actionResult = {
      status: "PASS",
      outputs: { exitCode: 0 },
      assertions: [{ statement: "x", source: "implicit", result: "PASS" }],
    };
    await evaluateCustomAssertions({
      step: { assertions: "$$outputs.notThere == 1" },
      actionResult,
    });
    assert.equal(actionResult.status, "FAIL");
    const custom = actionResult.assertions.filter((a) => a.source === "custom");
    assert.equal(custom[0].result, "FAIL");
  });

  it("array-of-objects assertions form is IGNORED (report shape, not user input)", async function () {
    const actionResult = {
      status: "PASS",
      outputs: { exitCode: 0 },
      assertions: [{ statement: "x", source: "implicit", result: "PASS" }],
    };
    await evaluateCustomAssertions({
      step: { assertions: [{ statement: "$$outputs.exitCode == 1" }] },
      actionResult,
    });
    // unchanged: no custom records added, status still PASS
    assert.equal(actionResult.status, "PASS");
    assert.equal(
      actionResult.assertions.filter((a) => a.source === "custom").length,
      0
    );
  });

  it("no assertions field -> byte-identical (no-op)", async function () {
    const actionResult = {
      status: "PASS",
      outputs: { exitCode: 0 },
      assertions: [{ statement: "x", source: "implicit", result: "PASS" }],
    };
    const before = JSON.stringify(actionResult);
    await evaluateCustomAssertions({ step: {}, actionResult });
    assert.equal(JSON.stringify(actionResult), before);
  });
});
