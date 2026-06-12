import { runConcurrent, rollUpResults } from "../dist/core/utils.js";
import { runSpecs } from "../dist/core/tests.js";
import { getEnvironment } from "../dist/core/config.js";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

describe("runConcurrent", function () {
  it("processes every item exactly once", async function () {
    const seen = [];
    await runConcurrent([1, 2, 3, 4, 5], 2, async (item) => {
      seen.push(item);
    });
    expect(seen.sort()).to.deep.equal([1, 2, 3, 4, 5]);
  });

  it("never exceeds the concurrency limit", async function () {
    let inFlight = 0;
    let highWater = 0;
    await runConcurrent([10, 10, 10, 10, 10, 10], 2, async (ms) => {
      inFlight++;
      highWater = Math.max(highWater, inFlight);
      await sleep(ms);
      inFlight--;
    });
    expect(highWater).to.equal(2);
  });

  it("runs strictly sequentially in input order at limit 1", async function () {
    const completed = [];
    // Decreasing durations would invert completion order if anything ran
    // concurrently.
    await runConcurrent([30, 20, 10], 1, async (ms) => {
      await sleep(ms);
      completed.push(ms);
    });
    expect(completed).to.deep.equal([30, 20, 10]);
  });

  it("does not over-spawn when limit exceeds item count", async function () {
    let inFlight = 0;
    let highWater = 0;
    await runConcurrent([10, 10], 8, async (ms) => {
      inFlight++;
      highWater = Math.max(highWater, inFlight);
      await sleep(ms);
      inFlight--;
    });
    expect(highWater).to.equal(2);
  });

  it("treats a limit below 1 as sequential", async function () {
    const completed = [];
    await runConcurrent([20, 10], 0, async (ms) => {
      await sleep(ms);
      completed.push(ms);
    });
    expect(completed).to.deep.equal([20, 10]);
  });

  it("propagates a rejection from fn", async function () {
    let threw = false;
    try {
      await runConcurrent([1], 2, async () => {
        throw new Error("boom");
      });
    } catch (error) {
      threw = true;
      expect(error.message).to.equal("boom");
    }
    expect(threw).to.equal(true);
  });

  it("resolves immediately for an empty item list", async function () {
    let calls = 0;
    await runConcurrent([], 4, async () => {
      calls++;
    });
    expect(calls).to.equal(0);
  });
});

describe("rollUpResults", function () {
  it("FAIL beats everything", function () {
    expect(
      rollUpResults([
        { result: "PASS" },
        { result: "FAIL" },
        { result: "WARNING" },
        { result: "SKIPPED" },
      ])
    ).to.equal("FAIL");
  });

  it("WARNING beats PASS and SKIPPED", function () {
    expect(
      rollUpResults([
        { result: "PASS" },
        { result: "WARNING" },
        { result: "SKIPPED" },
      ])
    ).to.equal("WARNING");
  });

  it("all SKIPPED rolls up to SKIPPED", function () {
    expect(
      rollUpResults([{ result: "SKIPPED" }, { result: "SKIPPED" }])
    ).to.equal("SKIPPED");
  });

  it("mixed SKIPPED and PASS rolls up to PASS", function () {
    expect(
      rollUpResults([{ result: "SKIPPED" }, { result: "PASS" }])
    ).to.equal("PASS");
  });

  it("all PASS rolls up to PASS", function () {
    expect(rollUpResults([{ result: "PASS" }, { result: "PASS" }])).to.equal(
      "PASS"
    );
  });

  it("empty input rolls up to SKIPPED", function () {
    // Matches the previous inline logic: zero children means
    // length === filter(SKIPPED).length.
    expect(rollUpResults([])).to.equal("SKIPPED");
  });
});

// Integration tests against runSpecs with non-driver steps only (wait,
// runShell), so no Appium server or browser is needed. Explicit ids
// everywhere so reports are deep-comparable across runs.
describe("runSpecs concurrency", function () {
  this.timeout(120000);

  // Build a resolvedTests bundle: 2 specs x 2 tests x 2 contexts. Wait
  // durations decrease across the flat job order, so with more than one
  // runner the completion order inverts relative to the input order.
  function buildFixture({ concurrentRunners, failContextIndex = -1 } = {}) {
    let jobIndex = 0;
    const specs = [1, 2].map((s) => ({
      specId: `spec-${s}`,
      tests: [1, 2].map((t) => ({
        testId: `spec-${s}-test-${t}`,
        contexts: [1, 2].map((c) => {
          const i = jobIndex++;
          const steps = [
            { stepId: `s${s}-t${t}-c${c}-wait`, wait: 800 - i * 100 },
            {
              stepId: `s${s}-t${t}-c${c}-shell`,
              runShell: i === failContextIndex ? "exit 1" : `echo job-${i}`,
            },
          ];
          return { contextId: `spec-${s}-test-${t}-context-${c}`, steps };
        }),
      })),
    }));
    return {
      config: {
        logLevel: "silent",
        telemetry: { send: false },
        environment: getEnvironment(),
        concurrentRunners,
      },
      specs,
    };
  }

  it("produces an identical report with 1 and 2 runners", async function () {
    const sequential = await runSpecs({
      resolvedTests: buildFixture({ concurrentRunners: 1 }),
    });
    const concurrent = await runSpecs({
      resolvedTests: buildFixture({ concurrentRunners: 2 }),
    });
    expect(concurrent).to.deep.equal(sequential);
  });

  it("keeps report order identical to input order with 3 runners", async function () {
    const report = await runSpecs({
      resolvedTests: buildFixture({ concurrentRunners: 3 }),
    });
    const contextIds = report.specs.flatMap((spec) =>
      spec.tests.flatMap((test) =>
        test.contexts.map((context) => context.contextId)
      )
    );
    expect(contextIds).to.deep.equal([
      "spec-1-test-1-context-1",
      "spec-1-test-1-context-2",
      "spec-1-test-2-context-1",
      "spec-1-test-2-context-2",
      "spec-2-test-1-context-1",
      "spec-2-test-1-context-2",
      "spec-2-test-2-context-1",
      "spec-2-test-2-context-2",
    ]);
  });

  it("isolates a failing context from its siblings", async function () {
    const report = await runSpecs({
      resolvedTests: buildFixture({ concurrentRunners: 2, failContextIndex: 2 }),
    });
    const contexts = report.specs.flatMap((spec) =>
      spec.tests.flatMap((test) => test.contexts)
    );
    expect(contexts.map((context) => context.result)).to.deep.equal([
      "PASS",
      "PASS",
      "FAIL",
      "PASS",
      "PASS",
      "PASS",
      "PASS",
      "PASS",
    ]);
    expect(report.summary.contexts).to.deep.equal({
      pass: 7,
      fail: 1,
      warning: 0,
      skipped: 0,
    });
    // The failing context belongs to spec-1-test-2; that test and spec FAIL,
    // everything else PASSes.
    expect(report.specs[0].result).to.equal("FAIL");
    expect(report.specs[0].tests[1].result).to.equal("FAIL");
    expect(report.specs[0].tests[0].result).to.equal("PASS");
    expect(report.specs[1].result).to.equal("PASS");
  });

  it("actually runs contexts concurrently", async function () {
    // Two contexts that each wait 1500ms: sequential needs >=3000ms; two
    // runners should finish well under that (generous bound for slow CI).
    const resolvedTests = {
      config: {
        logLevel: "silent",
        telemetry: { send: false },
        environment: getEnvironment(),
        concurrentRunners: 2,
      },
      specs: [
        {
          specId: "timing",
          tests: [
            {
              testId: "timing-test",
              contexts: [1, 2].map((c) => ({
                contextId: `timing-context-${c}`,
                steps: [{ stepId: `timing-wait-${c}`, wait: 1500 }],
              })),
            },
          ],
        },
      ],
    };
    const start = Date.now();
    const report = await runSpecs({ resolvedTests });
    const elapsed = Date.now() - start;
    expect(report.summary.contexts.pass).to.equal(2);
    expect(elapsed).to.be.below(2800);
  });
});
