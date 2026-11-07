// ADR 01167: the runner runs, and the report echoes, the effective step.
import path from "node:path";
import { expect } from "chai";
import { useEffectiveStep, placeCapturePaths } from "../dist/core/tests.js";
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

  // validate() leaves a whole-variable action as authored, because the variable
  // can hold an object. The runner's pass after substitution normalizes it.
  for (const [action, value] of [
    ["goTo", { url: "https://example.com/x", timeout: 5000 }],
    ["httpRequest", { url: "https://example.com/api", timeout: 5000 }],
  ]) {
    it(`normalizes a whole-variable ${action} after substitution`, function () {
      process.env.DD_EFFECTIVE_STEP = JSON.stringify(value);
      try {
        const step = { [action]: "$DD_EFFECTIVE_STEP" };
        useEffectiveStep(step);
        expect(step[action]).to.equal("$DD_EFFECTIVE_STEP");
        replaceEnvs(step);
        useEffectiveStep(step, { substituted: true });
        expect(step[action]).to.include(value);
        expect(step[action]).to.have.property(action === "goTo" ? "waitUntil" : "method");
      } finally {
        delete process.env.DD_EFFECTIVE_STEP;
      }
    });
  }

  it("names and places a whole-variable screenshot after substitution (ADR 01173)", function () {
    process.env.DD_EFFECTIVE_STEP = JSON.stringify({ directory: "shots" });
    try {
      const step = { stepId: "s", screenshot: "$DD_EFFECTIVE_STEP" };
      useEffectiveStep(step);
      expect(step.screenshot).to.equal("$DD_EFFECTIVE_STEP");
      replaceEnvs(step);
      useEffectiveStep(step, { substituted: true });
      placeCapturePaths(step, { outputDir: "out" });
      expect(step.screenshot).to.deep.equal({
        directory: "shots",
        path: path.resolve("out", "shots", "s.png"),
        maxVariation: 0.05,
        overwrite: "aboveVariation",
      });
    } finally {
      delete process.env.DD_EFFECTIVE_STEP;
    }
  });

  // An unset variable stays "$NAME" through substitution. The handler gets it as
  // text, in the object form, as it did before handlers stopped expanding shorthand.
  it("normalizes a whole-variable action that's unset after substitution", function () {
    const step = { goTo: "$DD_EFFECTIVE_STEP_UNSET" };
    useEffectiveStep(step);
    replaceEnvs(step);
    useEffectiveStep(step, { substituted: true });
    expect(step.goTo).to.include({ url: "$DD_EFFECTIVE_STEP_UNSET", timeout: 30000 });
  });

  it("leaves an invalid step for its handler to report", function () {
    const step = { goTo: "nope" };
    useEffectiveStep(step);
    expect(step).to.deep.equal({ goTo: "nope" });
  });
});

// ADR 01173: the runner places a capture the normalizer named under outputDir.
describe("placeCapturePaths", function () {
  const outputDir = path.resolve("out");
  const placed = (step) => {
    useEffectiveStep(step);
    placeCapturePaths(step, { outputDir });
    return step;
  };

  it("places screenshot: true and record: true in outputDir", function () {
    expect(placed({ stepId: "s", screenshot: true }).screenshot.path).to.equal(path.join(outputDir, "s.png"));
    expect(placed({ stepId: "r", record: true }).record.path).to.equal(path.join(outputDir, "r.mp4"));
  });

  it("places a relative directory in outputDir", function () {
    expect(placed({ stepId: "s", screenshot: { directory: "shots" } }).screenshot.path).to.equal(
      path.join(outputDir, "shots", "s.png")
    );
  });

  // A getRunner() step's `directory` can hold a variable. The pass before
  // substitution must wait: placing it then would bake `$NAME` into an
  // absolute path, which the pass after substitution skips.
  for (const [name, action, directory, value, expected] of [
    ["an absolute screenshot directory", "screenshot", "$DD_SHOTS_DIR", path.resolve("shots"), path.resolve("shots", "s.png")],
    ["a relative record directory", "record", "$DD_SHOTS_DIR", "shots", path.join(outputDir, "shots", "s.mp4")],
    ["an embedded variable", "record", "$DD_SHOTS_DIR/sub", "shots", path.join(outputDir, "shots", "sub", "s.mp4")],
  ]) {
    it(`waits for a variable directory, then places it: ${name}`, function () {
      const step = { stepId: "s", [action]: { directory } };
      placed(step);
      expect(path.isAbsolute(step[action].path)).to.equal(false);
      process.env.DD_SHOTS_DIR = value;
      try {
        replaceEnvs(step);
        useEffectiveStep(step, { substituted: true });
        placeCapturePaths(step, { outputDir });
        expect(step[action].path).to.equal(expected);
      } finally {
        delete process.env.DD_SHOTS_DIR;
      }
    });
  }

  it("leaves absolute paths, URLs, variables, and false alone", function () {
    const absolute = path.resolve("elsewhere", "a.png");
    expect(placed({ screenshot: absolute }).screenshot.path).to.equal(absolute);
    expect(placed({ screenshot: "https://example.com/a.png" }).screenshot.path).to.equal("https://example.com/a.png");
    expect(placed({ screenshot: { path: "$SHOT" } }).screenshot.path).to.equal("$SHOT");
    expect(placed({ stepId: "s", screenshot: false }).screenshot).to.equal(false);
  });
});
