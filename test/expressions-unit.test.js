import assert from "node:assert/strict";
import {
  evaluateAssertion,
  resolveExpression,
} from "../dist/core/expressions.js";

describe("expressions: evaluateAssertion (condition path, allowOperators)", function () {
  const ctx = {
    platform: "windows",
    outputs: {
      exitCode: 0,
      count: 10,
      small: 5,
      ratio: 0.6,
      text: "hello world",
      list: ["a", "b", "c"],
      name: "abc",
    },
  };

  // --- equality / inequality, string ---
  it("$$platform == windows -> true", async function () {
    assert.equal(await evaluateAssertion("$$platform == windows", ctx), true);
  });
  it("$$platform == windows -> false on linux", async function () {
    assert.equal(
      await evaluateAssertion("$$platform == windows", {
        ...ctx,
        platform: "linux",
      }),
      false
    );
  });
  it("$$platform != linux -> true", async function () {
    assert.equal(await evaluateAssertion("$$platform != linux", ctx), true);
  });
  it("$$platform != windows -> false", async function () {
    assert.equal(await evaluateAssertion("$$platform != windows", ctx), false);
  });

  // --- numeric equality ---
  it("$$outputs.exitCode == 0 -> true", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.exitCode == 0", ctx),
      true
    );
  });
  it("$$outputs.exitCode == 0 -> false when 1", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.exitCode == 0", {
        ...ctx,
        outputs: { ...ctx.outputs, exitCode: 1 },
      }),
      false
    );
  });

  // --- greater / greater-equal ---
  it("$$outputs.count > 0 -> true", async function () {
    assert.equal(await evaluateAssertion("$$outputs.count > 0", ctx), true);
  });
  it("$$outputs.exitCode > 0 -> false", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.exitCode > 0", ctx),
      false
    );
  });
  it("$$outputs.count >= 10 (two digits) -> true", async function () {
    assert.equal(await evaluateAssertion("$$outputs.count >= 10", ctx), true);
  });
  it("$$outputs.count >= 10 -> false when 9", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.count >= 10", {
        ...ctx,
        outputs: { ...ctx.outputs, count: 9 },
      }),
      false
    );
  });

  // --- less / less-equal ---
  it("$$outputs.small <= 5 -> true", async function () {
    assert.equal(await evaluateAssertion("$$outputs.small <= 5", ctx), true);
  });
  it("$$outputs.count <= 5 -> false", async function () {
    assert.equal(await evaluateAssertion("$$outputs.count <= 5", ctx), false);
  });
  it("$$outputs.small < 10 -> true", async function () {
    assert.equal(await evaluateAssertion("$$outputs.small < 10", ctx), true);
  });

  // --- decimal regression (dot-escape removal) ---
  it("$$outputs.ratio < 0.5 -> false when 0.6", async function () {
    assert.equal(await evaluateAssertion("$$outputs.ratio < 0.5", ctx), false);
  });
  it("$$outputs.ratio > 0.5 -> true when 0.6", async function () {
    assert.equal(await evaluateAssertion("$$outputs.ratio > 0.5", ctx), true);
  });
  it("$$outputs.ratio > 0.5 -> false when 0.4", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.ratio > 0.5", {
        ...ctx,
        outputs: { ...ctx.outputs, ratio: 0.4 },
      }),
      false
    );
  });

  // --- contains (string + array) ---
  it("string contains substring -> true", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.text contains world", ctx),
      true
    );
  });
  it("string contains substring -> false", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.text contains zzz", ctx),
      false
    );
  });
  it("array contains element -> true", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.list contains b", ctx),
      true
    );
  });
  it("array contains element -> false", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.list contains z", ctx),
      false
    );
  });

  // --- oneOf ---
  it("oneOf -> true", async function () {
    assert.equal(
      await evaluateAssertion('$$platform oneOf ["windows", "linux"]', ctx),
      true
    );
  });
  it("oneOf -> false", async function () {
    assert.equal(
      await evaluateAssertion('$$platform oneOf ["linux", "darwin"]', ctx),
      false
    );
  });

  // --- matches (regex with a dot) ---
  it("matches /a.c/ -> true", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.name matches /a.c/", ctx),
      true
    );
  });
  it("matches /a.c/ -> false", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.text matches /a.c/", {
        ...ctx,
        outputs: { ...ctx.outputs, text: "xyz" },
      }),
      false
    );
  });

  // --- CodeQL alert 63: a /regex/ literal containing a backslash escape must
  //     survive into the compiled pattern. The old code escaped quotes but NOT
  //     backslashes, so `\d` collapsed to `d` and `\.` to a wildcard `.`. ---
  it("matches /\\d/ -> true on a digit-bearing string with no literal 'd'", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.code matches /\\d/", {
        outputs: { code: "x5" },
      }),
      true
    );
  });
  it("matches /a\\.c/ -> false on 'axc' (escaped dot is a literal dot)", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.v matches /a\\.c/", {
        outputs: { v: "axc" },
      }),
      false
    );
  });
  it("matches /a\\.c/ -> true on 'a.c' (escaped dot matches a literal dot)", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.v matches /a\\.c/", {
        outputs: { v: "a.c" },
      }),
      true
    );
  });

  // --- CodeQL alerts 61/62: the ReDoS-safe (unrolled) rewrite of the
  //     string-literal masking regex must still mask a literal that contains
  //     escaped quotes as a single whole (exercises the \\. escape branch). ---
  it("masking preserves a literal containing escaped quotes", async function () {
    assert.equal(
      await evaluateAssertion('$$a == "he said \\"hi\\""', {
        a: 'he said "hi"',
      }),
      true
    );
  });

  // --- single string condition baseline ---
  it("plain boolean-ish meta value coerces", async function () {
    assert.equal(
      await evaluateAssertion("$$flag", { flag: true }),
      true
    );
  });

  // --- fail-closed ---
  it("fail-closed: unresolved $$ token in comparison -> false", async function () {
    assert.equal(
      await evaluateAssertion("$$outputs.missing == 0", ctx),
      false
    );
  });
  it("fail-closed: bare unresolved $$typo -> false", async function () {
    assert.equal(await evaluateAssertion("$$typo", ctx), false);
  });

  // --- DEFECT A: preprocessExpression must be quote-aware ---
  it("Defect A: $$msg == \"a > b\" -> true when msg='a > b'", async function () {
    assert.equal(
      await evaluateAssertion('$$msg == "a > b"', { msg: "a > b" }),
      true
    );
  });
  it("Defect A: $$out contains \"hello world\" -> true", async function () {
    assert.equal(
      await evaluateAssertion('$$out contains "hello world"', {
        out: "say hello world now",
      }),
      true
    );
  });
  it("Defect A: $$out contains \"hello world\" -> false", async function () {
    assert.equal(
      await evaluateAssertion('$$out contains "hello world"', { out: "nope" }),
      false
    );
  });
  it("Defect A: $$a == \"x contains y\" -> true (operator word inside literal)", async function () {
    assert.equal(
      await evaluateAssertion('$$a == "x contains y"', { a: "x contains y" }),
      true
    );
  });
  it("Defect A: matches with a quoted spaced subject -> true", async function () {
    assert.equal(
      await evaluateAssertion('$$out matches /hello world/', {
        out: "say hello world now",
      }),
      true
    );
  });
  it("Defect A: $$a == \"x matches y\" -> true (matches word inside literal)", async function () {
    assert.equal(
      await evaluateAssertion('$$a == "x matches y"', { a: "x matches y" }),
      true
    );
  });

  // --- DEFECT B: fail-closed must not false-positive on $$ inside a resolved value ---
  it("Defect B: $$a resolving to a value containing $$foo is NOT failed-closed (real eval -> true)", async function () {
    // $$a resolves to the string "has $$foo here"; comparing it to the same
    // literal must evaluate on the real value (true), not get force-failed by
    // an output scan that sees the literal $$foo in the resolved string.
    assert.equal(
      await evaluateAssertion('$$a == "has $$foo here"', {
        a: "has $$foo here",
      }),
      true
    );
  });
  it("Defect B: $$a resolving to a value containing $$foo, mismatch -> false (real eval)", async function () {
    assert.equal(
      await evaluateAssertion('$$a == "has $$foo here"', { a: "other value" }),
      false
    );
  });
});

describe("expressions: resolveExpression regressions (default flag, non-breaking)", function () {
  const ctx = {
    platform: "windows",
    outputs: { exitCode: 0, data: { a: { b: 5 } } },
  };

  it("plain $$platform returns raw string (not boolean)", async function () {
    const r = await resolveExpression({ expression: "$$platform", context: ctx });
    assert.equal(r, "windows");
  });

  it("operator-like string 'a > b' returned VERBATIM with default flag", async function () {
    const r = await resolveExpression({ expression: "a > b", context: ctx });
    assert.equal(r, "a > b");
  });

  it("operator-like string 'x contains y' returned VERBATIM with default flag", async function () {
    const r = await resolveExpression({
      expression: "x contains y",
      context: ctx,
    });
    assert.equal(r, "x contains y");
  });

  it("$$platform == windows returned VERBATIM (resolved) with default flag", async function () {
    const r = await resolveExpression({
      expression: "$$platform == windows",
      context: ctx,
    });
    // meta value resolved, but operator NOT evaluated -> remains a string
    assert.equal(typeof r, "string");
    assert.equal(r, "windows == windows");
  });

  it("{{ }} interpolation unchanged", async function () {
    const r = await resolveExpression({
      expression: "platform is {{$$platform}}!",
      context: ctx,
    });
    assert.equal(r, "platform is windows!");
  });

  it("extract(...) still works", async function () {
    const r = await resolveExpression({
      expression: 'extract("abc123", "[0-9]+")',
      context: ctx,
    });
    assert.equal(r, "123");
  });

  it("jq(...) still works", async function () {
    const r = await resolveExpression({
      expression: 'jq($$outputs.data, ".a.b")',
      context: ctx,
    });
    assert.equal(String(r), "5");
  });
});
