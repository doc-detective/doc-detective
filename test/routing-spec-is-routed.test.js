import assert from "node:assert/strict";
import { specIsRouted } from "../dist/core/tests.js";

// specIsRouted(spec): true iff ANY test in the spec carries a non-empty
// test-level routing handler (onPass/onFail/onWarning/onSkip array). This is the
// predicate that splits the runner's two paths: a NON-routed spec (every
// existing spec) takes the unchanged flat-pool path and produces byte-identical
// reports; only a ROUTED spec enters the sequential routed sequencer. So the
// predicate must NOT be tripped by step-level handlers or a guard `if`.
describe("routing: specIsRouted", function () {
  it("a test with a non-empty onFail handler -> true", function () {
    assert.equal(
      specIsRouted({
        tests: [{ steps: [{ wait: 1 }], onFail: [{ stop: "spec" }] }],
      }),
      true
    );
  });
  it("a non-empty handler on any of the four families -> true", function () {
    for (const key of ["onPass", "onFail", "onWarning", "onSkip"]) {
      assert.equal(
        specIsRouted({ tests: [{ [key]: [{ continue: true }] }] }),
        true,
        `${key} should mark the spec routed`
      );
    }
  });
  it("only step-level on* handlers -> false (step routing is not test routing)", function () {
    assert.equal(
      specIsRouted({
        tests: [{ steps: [{ wait: 1, onFail: [{ goToStep: "x" }] }] }],
      }),
      false
    );
  });
  it("an empty handler array -> false", function () {
    assert.equal(specIsRouted({ tests: [{ onFail: [] }] }), false);
  });
  it("only a guard `if` -> false", function () {
    assert.equal(
      specIsRouted({ tests: [{ if: "$$platform == windows", steps: [{ wait: 1 }] }] }),
      false
    );
  });
  it("no tests / missing tests -> false", function () {
    assert.equal(specIsRouted({ tests: [] }), false);
    assert.equal(specIsRouted({}), false);
    assert.equal(specIsRouted(null), false);
  });
  it("at least one routed test among several -> true", function () {
    assert.equal(
      specIsRouted({
        tests: [
          { steps: [{ wait: 1 }] },
          { onPass: [{ stop: "spec" }] },
        ],
      }),
      true
    );
  });
});
