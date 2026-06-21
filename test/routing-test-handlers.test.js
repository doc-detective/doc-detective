import assert from "node:assert/strict";
import {
  buildConditionContext,
  resolveTestRouting,
} from "../dist/core/routing.js";

// Test-level routing handlers: onPass/onFail/onWarning/onSkip on a TEST. Each is
// an array of routing entries ({ if?, <action> }); the FIRST entry whose `if`
// matches wins (no `if` => always matches). PR-A acts on `continue` and `stop`
// at TEST scope; `goToTest` is deferred (returns the status default), and
// `retry`/`goToStep` are not applicable at test scope (fall through to default).
// Defaults reproduce today's flat-pool behavior: FAIL -> stop(test) which is a
// no-op at test scope (the test already finished), so a FAILing test with no
// handler does NOT stop its siblings — byte-identical to the non-routed path.
// flow != verdict: routing never changes the test's rolled-up result.
describe("routing: resolveTestRouting", function () {
  const ctx = buildConditionContext({ platform: "windows" });

  // --- defaults (no handlers) ---
  it("PASS, no handlers -> continue", async function () {
    assert.deepEqual(
      await resolveTestRouting({ status: "PASS", test: {}, context: ctx }),
      { action: "continue" }
    );
  });
  it("WARNING, no handlers -> continue", async function () {
    assert.deepEqual(
      await resolveTestRouting({ status: "WARNING", test: {}, context: ctx }),
      { action: "continue" }
    );
  });
  it("SKIPPED, no handlers -> continue", async function () {
    assert.deepEqual(
      await resolveTestRouting({ status: "SKIPPED", test: {}, context: ctx }),
      { action: "continue" }
    );
  });
  it("FAIL, no handlers -> stop(test) [no-op at test scope]", async function () {
    assert.deepEqual(
      await resolveTestRouting({ status: "FAIL", test: {}, context: ctx }),
      { action: "stop", scope: "test" }
    );
  });

  // --- explicit overrides ---
  it("onFail [{continue:true}] -> continue", async function () {
    assert.deepEqual(
      await resolveTestRouting({
        status: "FAIL",
        test: { onFail: [{ continue: true }] },
        context: ctx,
      }),
      { action: "continue" }
    );
  });
  it("onPass [{stop:'spec'}] -> stop spec", async function () {
    assert.deepEqual(
      await resolveTestRouting({
        status: "PASS",
        test: { onPass: [{ stop: "spec" }] },
        context: ctx,
      }),
      { action: "stop", scope: "spec" }
    );
  });
  it("onPass [{stop:'run'}] -> stop run", async function () {
    assert.deepEqual(
      await resolveTestRouting({
        status: "PASS",
        test: { onPass: [{ stop: "run" }] },
        context: ctx,
      }),
      { action: "stop", scope: "run" }
    );
  });
  it("onPass [{stop:'test'}] -> stop test", async function () {
    assert.deepEqual(
      await resolveTestRouting({
        status: "PASS",
        test: { onPass: [{ stop: "test" }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });

  // --- if-selector matching: first match wins ---
  it("first entry whose `if` matches wins (on $$platform)", async function () {
    // platform is windows, so the linux entry is skipped; the second matches.
    assert.deepEqual(
      await resolveTestRouting({
        status: "FAIL",
        test: {
          onFail: [
            { if: "$$platform == linux", stop: "spec" },
            { continue: true },
          ],
        },
        context: ctx,
      }),
      { action: "continue" }
    );
  });
  it("no entry matches -> falls back to default for the status", async function () {
    assert.deepEqual(
      await resolveTestRouting({
        status: "FAIL",
        test: { onFail: [{ if: "$$platform == linux", continue: true }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });
  it("empty handler array -> default", async function () {
    assert.deepEqual(
      await resolveTestRouting({
        status: "PASS",
        test: { onPass: [] },
        context: ctx,
      }),
      { action: "continue" }
    );
  });

  // --- deferred / inapplicable actions -> status default (stop scanning) ---
  it("goToTest entry -> goToTest decision (trimmed)", async function () {
    assert.deepEqual(
      await resolveTestRouting({
        status: "PASS",
        test: { onPass: [{ goToTest: "cleanup" }] },
        context: ctx,
      }),
      { action: "goToTest", testId: "cleanup" }
    );
    // Trailing/leading whitespace is trimmed.
    assert.deepEqual(
      await resolveTestRouting({
        status: "FAIL",
        test: { onFail: [{ goToTest: "  cleanup  " }] },
        context: ctx,
      }),
      { action: "goToTest", testId: "cleanup" }
    );
  });
  it("whitespace-only goToTest falls through to the default", async function () {
    assert.deepEqual(
      await resolveTestRouting({
        status: "FAIL",
        test: { onFail: [{ goToTest: "   " }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });
  it("a matched goToTest stops scanning (a later entry can't override it)", async function () {
    // First entry matches (no `if`) -> goToTest, so the trailing {stop:'spec'}
    // must NOT take effect.
    assert.deepEqual(
      await resolveTestRouting({
        status: "PASS",
        test: { onPass: [{ goToTest: "x" }, { stop: "spec" }] },
        context: ctx,
      }),
      { action: "goToTest", testId: "x" }
    );
  });
  it("retry at test scope -> not applicable, falls to default", async function () {
    assert.deepEqual(
      await resolveTestRouting({
        status: "FAIL",
        test: { onFail: [{ retry: { limit: 2 } }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });
  it("goToStep at test scope -> not applicable, falls to default", async function () {
    assert.deepEqual(
      await resolveTestRouting({
        status: "FAIL",
        test: { onFail: [{ goToStep: "x" }] },
        context: ctx,
      }),
      { action: "stop", scope: "test" }
    );
  });
});
