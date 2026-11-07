// ADR 01167: the runner runs, and the report echoes, the effective step.
import { expect } from "chai";
import { useEffectiveStep } from "../dist/core/tests.js";

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

  it("leaves an invalid step for its handler to report", function () {
    const step = { goTo: "nope" };
    useEffectiveStep(step);
    expect(step).to.deep.equal({ goTo: "nope" });
  });
});
