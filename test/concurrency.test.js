import { runConcurrent, rollUpResults } from "../dist/core/utils.js";

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
