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

  it("makes wait: true wait 5000 ms, not 1", function () {
    const step = { wait: true };
    useEffectiveStep(step);
    expect(step.wait).to.equal(5000);
  });

  it("expands runShell, leaving workingDirectory unset so the command runs in the current folder", function () {
    const step = { runShell: "echo hi" };
    useEffectiveStep(step);
    expect(step.runShell).to.include({ command: "echo hi", timeout: 60000 });
    expect(step.runShell).to.not.have.property("workingDirectory");
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
    ["runShell", { command: "echo hi" }, "exitCodes"],
    ["runCode", { language: "javascript", code: "console.log(1)" }, "exitCodes"],
    ["click", { selector: "#a" }, "button"],
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
