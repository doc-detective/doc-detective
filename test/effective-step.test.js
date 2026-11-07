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

  // The runner executes the coerced effective step, so coercion must keep an
  // authored boolean a boolean (ADR 01161).
  it("keeps authored booleans", function () {
    const wait = { wait: false };
    const find = { find: { elementText: "Save", click: false, elementAttribute: { disabled: false } } };
    useEffectiveStep(wait);
    useEffectiveStep(find);
    expect(wait.wait).to.equal(false);
    expect(find.find.click).to.equal(false);
    expect(find.find.elementAttribute.disabled).to.equal(false);
  });

  // validate() leaves a whole-variable action as authored, because the variable
  // can hold an object. The runner's pass after substitution normalizes it.
  for (const [action, value, filled] of [
    ["goTo", { url: "https://example.com/x", timeout: 5000 }, "waitUntil"],
    ["httpRequest", { url: "https://example.com/api", timeout: 5000 }, "method"],
    ["find", { selector: "#a", timeout: 50 }, "moveTo"],
    ["type", { keys: ["a"], inputDelay: 0 }, "timeout"],
    ["swipe", { direction: "up", duration: 100 }, "distance"],
  ]) {
    it(`normalizes a whole-variable ${action} after substitution`, function () {
      process.env.DD_EFFECTIVE_STEP = JSON.stringify(value);
      try {
        const step = { [action]: "$DD_EFFECTIVE_STEP" };
        useEffectiveStep(step);
        expect(step[action]).to.equal("$DD_EFFECTIVE_STEP");
        replaceEnvs(step);
        useEffectiveStep(step, { substituted: true });
        expect(step[action]).to.deep.include(value);
        expect(step[action]).to.have.property(filled);
      } finally {
        delete process.env.DD_EFFECTIVE_STEP;
      }
    });
  }

  // A whole variable inside an action can hold a list too, so the pass before
  // substitution doesn't wrap it in one (ADR 01175).
  for (const [name, step, list, at, read] of [
    ["type.keys", { type: { keys: "$DD_EFFECTIVE_LIST" } }, ["a", "$ENTER$"], (s) => s.type.keys, (s) => s.type.keys],
    ["find.elementClass", { find: { selector: "#a", elementClass: "$DD_EFFECTIVE_LIST" } }, ["x", "y"], (s) => s.find.elementClass, (s) => s.find.elementClass],
    ["find.type", { find: { selector: "#a", type: "$DD_EFFECTIVE_LIST" } }, ["a"], (s) => s.find.type, (s) => s.find.type.keys],
  ]) {
    it(`keeps a whole-variable ${name} for a list until substitution`, function () {
      process.env.DD_EFFECTIVE_LIST = JSON.stringify(list);
      try {
        useEffectiveStep(step);
        expect(at(step)).to.equal("$DD_EFFECTIVE_LIST");
        replaceEnvs(step);
        useEffectiveStep(step, { substituted: true });
        expect(read(step)).to.deep.equal(list);
      } finally {
        delete process.env.DD_EFFECTIVE_LIST;
      }
    });
  }

  // An unset variable stays "$NAME" through substitution. The handler gets it as
  // text, in the object form, as it did before handlers stopped expanding shorthand.
  it("normalizes a whole-variable action that's unset after substitution", function () {
    const step = { goTo: "$DD_EFFECTIVE_STEP_UNSET" };
    useEffectiveStep(step);
    replaceEnvs(step);
    useEffectiveStep(step, { substituted: true });
    expect(step.goTo).to.include({ url: "$DD_EFFECTIVE_STEP_UNSET", timeout: 30000 });
  });

  it("lists an unset whole-variable type.keys as text after substitution", function () {
    const step = { type: { keys: "$DD_EFFECTIVE_LIST_UNSET" } };
    useEffectiveStep(step);
    replaceEnvs(step);
    useEffectiveStep(step, { substituted: true });
    expect(step.type.keys).to.deep.equal(["$DD_EFFECTIVE_LIST_UNSET"]);
  });

  it("leaves an invalid step for its handler to report", function () {
    const step = { goTo: "nope" };
    useEffectiveStep(step);
    expect(step).to.deep.equal({ goTo: "nope" });
  });
});
