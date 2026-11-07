// ADR 01167: the runner runs, and the report echoes, the effective step.
import { expect } from "chai";
import { useEffectiveStep } from "../dist/core/tests.js";
import { replaceEnvs } from "../dist/core/utils.js";

describe("useEffectiveStep", function () {
  it("normalizes the step in place, so the report echoes it", function () {
    const step = { stepId: "s", goTo: "https://example.com" };
    useEffectiveStep(step);
    expect(step.stepId).to.equal("s");
    expect(step.goTo).to.include({ url: "https://example.com", timeout: 30000 });
  });

  it("keeps the runner's markers", function () {
    const step = { record: { path: "x.mp4" }, __autoRecord: true };
    Object.defineProperty(step, "_fromAfter", { value: true, enumerable: false });
    useEffectiveStep(step);
    expect(step.__autoRecord).to.equal(true);
    expect(step._fromAfter).to.equal(true);
  });

  // The runner's first pass runs before $VAR substitution, and a whole-variable
  // action can hold an object. It must wait for the pass after substitution.
  for (const [action, value] of [
    ["goTo", { url: "https://example.com/x", timeout: 5000 }],
    ["httpRequest", { url: "https://example.com/api", timeout: 5000 }],
  ]) {
    it(`normalizes a whole-variable ${action} after substitution`, function () {
      process.env.DD_EFFECTIVE_STEP = JSON.stringify(value);
      try {
        const step = { [action]: "$DD_EFFECTIVE_STEP" };
        useEffectiveStep(step, { beforeSubstitution: true });
        expect(step[action]).to.equal("$DD_EFFECTIVE_STEP");
        replaceEnvs(step);
        useEffectiveStep(step);
        expect(step[action]).to.include(value);
        expect(step[action]).to.have.property(action === "goTo" ? "waitUntil" : "method");
      } finally {
        delete process.env.DD_EFFECTIVE_STEP;
      }
    });
  }

  it("normalizes a whole-variable action that's unset after substitution", function () {
    const step = { goTo: "$DD_EFFECTIVE_STEP_UNSET" };
    useEffectiveStep(step, { beforeSubstitution: true });
    replaceEnvs(step);
    useEffectiveStep(step);
    expect(step.goTo).to.include({ url: "$DD_EFFECTIVE_STEP_UNSET", timeout: 30000 });
  });

  it("leaves an invalid step for its handler to report", function () {
    const step = { goTo: "nope" };
    useEffectiveStep(step);
    expect(step).to.deep.equal({ goTo: "nope" });
  });
});
