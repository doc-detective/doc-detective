import assert from "node:assert/strict";
import Mocha from "mocha";
import {
  freezeAllowanceMs,
  installFreezeAllowance,
} from "./freeze-allowance.js";

// ADR 01105. Each case installs onto a fresh subclass, so these assertions hold
// whether or not test/hooks.js already installed the allowance on mocha's own
// prototypes (it does on Windows CI).
function patchedTest(allowanceMs) {
  class T extends Mocha.Test {}
  installFreezeAllowance({ Runnable: T, Test: T }, allowanceMs);
  return T;
}

function run(runnable) {
  return new Promise((resolve) => runnable.run((err) => resolve(err)));
}

function busyWait(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    // Deliberately synchronous: mirrors a test the runner freezes mid-flight.
  }
}

describe("freeze allowance: when it applies", function () {
  it("applies 60s on Windows CI", function () {
    assert.equal(freezeAllowanceMs("win32", { CI: "true" }), 60000);
  });

  it("does not apply off Windows", function () {
    assert.equal(freezeAllowanceMs("linux", { CI: "true" }), 0);
    assert.equal(freezeAllowanceMs("darwin", { CI: "true" }), 0);
  });

  it("does not apply on a Windows machine outside CI", function () {
    assert.equal(freezeAllowanceMs("win32", {}), 0);
  });

  it("DD_TEST_FREEZE_ALLOWANCE_MS overrides the default on any platform", function () {
    assert.equal(freezeAllowanceMs("linux", { DD_TEST_FREEZE_ALLOWANCE_MS: "5000" }), 5000);
    assert.equal(
      freezeAllowanceMs("win32", { CI: "true", DD_TEST_FREEZE_ALLOWANCE_MS: "0" }),
      0
    );
  });

  it("ignores an override that isn't a non-negative number", function () {
    assert.equal(freezeAllowanceMs("linux", { DD_TEST_FREEZE_ALLOWANCE_MS: "soon" }), 0);
    assert.equal(
      freezeAllowanceMs("win32", { CI: "true", DD_TEST_FREEZE_ALLOWANCE_MS: "-1" }),
      60000
    );
  });
});

describe("freeze allowance: how it changes enforcement", function () {
  it("adds the allowance to the enforced timeout", function () {
    const T = patchedTest(1000);
    const t = new T("x", () => {});
    t.timeout(10000);
    assert.equal(t.timeout(), 11000);
  });

  it("leaves a disabled timeout disabled", function () {
    const T = patchedTest(1000);
    const t = new T("x", () => {});
    t.timeout(0);
    assert.equal(t.timeout(), 0);
  });

  it("does not stack the allowance when a retry clones the test", function () {
    const T = patchedTest(1000);
    const t = new T("x", () => {});
    t.timeout(10000);
    const retry = t.clone();
    // The clone is a base mocha Test, so read the declared value it carries:
    // the allowance is added at enforcement, never baked into the declared one.
    assert.equal(retry._timeout, 10000);
  });

  it("an async test that overruns its timeout by less than the allowance passes", async function () {
    const T = patchedTest(1000);
    const t = new T("x", (done) => setTimeout(done, 100));
    t.timeout(20);
    assert.equal(await run(t), undefined);
  });

  it("a synchronous test that overruns its timeout by less than the allowance passes", async function () {
    const T = patchedTest(1000);
    const t = new T("x", () => busyWait(100));
    t.timeout(20);
    assert.equal(await run(t), undefined);
  });

  it("a test that overruns timeout plus allowance still times out", async function () {
    const T = patchedTest(30);
    const t = new T("x", () => busyWait(150));
    t.timeout(20);
    const err = await run(t);
    assert.match(String(err?.message), /Timeout of 50ms exceeded/);
  });

  it("is installed on mocha's own Runnable for this run (via test/hooks.js)", function () {
    const t = new Mocha.Test("x", () => {});
    t.timeout(1000);
    assert.equal(t.timeout(), 1000 + freezeAllowanceMs(process.platform, process.env));
  });

  it("an allowance of 0 changes nothing", function () {
    // Installing 0 is a no-op, so it behaves exactly like plain mocha (which
    // itself carries this run's allowance, if any).
    const T = patchedTest(0);
    const t = new T("x", () => {});
    const plain = new Mocha.Test("x", () => {});
    t.timeout(10000);
    plain.timeout(10000);
    assert.equal(t.timeout(), plain.timeout());
  });
});
