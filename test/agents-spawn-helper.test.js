import assert from "node:assert/strict";

describe("winCommandLine (CommandLineToArgvW escaping)", function () {
  let winCommandLine;
  before(async function () {
    ({ winCommandLine } = await import("../dist/agents/spawn-helper.js"));
  });

  it("wraps simple tokens in double quotes", function () {
    assert.equal(winCommandLine("qwen", ["--version"]), '"qwen" "--version"');
  });

  it("preserves URL args without quote/backslash handling", function () {
    const line = winCommandLine("qwen", [
      "extensions",
      "install",
      "https://github.com/doc-detective/agent-tools:doc-detective",
    ]);
    assert.equal(
      line,
      '"qwen" "extensions" "install" "https://github.com/doc-detective/agent-tools:doc-detective"'
    );
  });

  it("escapes embedded double quotes as \\\"", function () {
    assert.equal(winCommandLine("x", ['a"b']), '"x" "a\\"b"');
  });

  it("doubles backslashes that precede a quote", function () {
    // `a\"b` — the backslash must be doubled so cmd.exe doesn't treat our
    // escape as part of the input's literal backslash run.
    assert.equal(winCommandLine("x", ['a\\"b']), '"x" "a\\\\\\"b"');
    // `a\\"b` — two backslashes then a quote → four backslashes + \"
    assert.equal(winCommandLine("x", ['a\\\\"b']), '"x" "a\\\\\\\\\\"b"');
  });

  it("doubles trailing backslashes so the closing quote isn't escaped", function () {
    // `a\` → must become `"a\\"` or the closing `"` would be eaten.
    assert.equal(winCommandLine("x", ["a\\"]), '"x" "a\\\\"');
    assert.equal(winCommandLine("x", ["a\\\\"]), '"x" "a\\\\\\\\"');
  });

  it("leaves interior backslashes alone", function () {
    // Not followed by `"` or end-of-string → no doubling.
    assert.equal(winCommandLine("x", ["a\\b\\c"]), '"x" "a\\b\\c"');
  });

  it("handles empty-arg edge case", function () {
    assert.equal(winCommandLine("x", [""]), '"x" ""');
  });
});
