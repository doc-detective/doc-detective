// Unit cover for the container smoke test's pass/fail rule
// (src/container/test/runOutcome.cjs), per ADR 01096.
//
// The published image is built for linux/amd64 AND linux/arm64, and the two
// arches do not have the same browser support: upstream publishes no native
// linux-arm64 chromedriver, so on arm64 every browser-backed spec resolves to
// SKIPPED while the shell / HTTP / link-checking specs still run for real.
// The gate therefore can't demand "everything passed" — but it also must not
// degrade into "nothing failed", which an image that runs *nothing* would
// satisfy. The rule is: no failures, and at least one spec actually passed.

import assert from "node:assert/strict";
import { assertRunOutcome } from "../src/container/test/runOutcome.cjs";

const summary = (specs) => ({ summary: { specs } });

describe("container smoke test: assertRunOutcome", function () {
  it("accepts a run where browser specs skipped but others passed (arm64)", function () {
    assert.doesNotThrow(() =>
      assertRunOutcome(summary({ pass: 5, fail: 0, warning: 0, skipped: 8 }))
    );
  });

  it("accepts a fully passing run (amd64)", function () {
    assert.doesNotThrow(() =>
      assertRunOutcome(summary({ pass: 13, fail: 0, warning: 0, skipped: 0 }))
    );
  });

  it("rejects any failed spec", function () {
    assert.throws(
      () => assertRunOutcome(summary({ pass: 5, fail: 1, warning: 0, skipped: 8 })),
      /1 spec\(s\) failed/
    );
  });

  it("rejects a vacuous run where every spec skipped", function () {
    // The failure mode the tolerance could otherwise hide: an image so broken
    // that nothing runs still reports fail === 0.
    assert.throws(
      () => assertRunOutcome(summary({ pass: 0, fail: 0, warning: 0, skipped: 13 })),
      /no spec passed/i
    );
  });

  it("rejects a results file with no spec summary at all", function () {
    assert.throws(() => assertRunOutcome({}), /summary/i);
    assert.throws(() => assertRunOutcome(null), /summary/i);
  });
});

describe("container smoke test: assertRunOutcome rejects an untrustworthy summary", function () {
  // The gate decides whether an image ships, and it reads a JSON file written by
  // a process that just crashed in every scenario it exists to catch. A `fail`
  // count it can't trust must not be coerced to 0 — with any passing spec that
  // would turn a broken run green.
  const withFail = (fail) => ({ summary: { specs: { pass: 1, fail, skipped: 0 } } });

  it("rejects a missing fail count", function () {
    assert.throws(() => assertRunOutcome(withFail(undefined)), /fail count/i);
  });

  it("rejects a non-numeric fail count", function () {
    assert.throws(() => assertRunOutcome(withFail("some")), /fail count/i);
    assert.throws(() => assertRunOutcome(withFail(NaN)), /fail count/i);
  });

  it("rejects a negative or fractional fail count", function () {
    assert.throws(() => assertRunOutcome(withFail(-1)), /fail count/i);
    assert.throws(() => assertRunOutcome(withFail(1.5)), /fail count/i);
  });

  it("still accepts a well-formed zero", function () {
    assert.doesNotThrow(() => assertRunOutcome(withFail(0)));
  });
});
