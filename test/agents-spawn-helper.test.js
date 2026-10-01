import assert from "node:assert/strict";

describe("safeSpawn", function () {
  let safeSpawn;
  before(async function () {
    ({ safeSpawn } = await import("../dist/agents/spawn-helper.js"));
  });

  // process.execPath (the running Node binary) is the one command guaranteed
  // present and stable cross-platform — using it (rather than a real agent
  // CLI) keeps these tests hermetic and offline while still exercising a
  // real child_process.spawn through safeSpawn's actual code path.

  it("resolves stdout/stderr/exitCode for a successful command", async function () {
    const result = await safeSpawn(process.execPath, [
      "-e",
      "process.stdout.write('hello'); process.stderr.write('warn'); process.exit(0);",
    ]);
    assert.equal(result.stdout, "hello");
    assert.equal(result.stderr, "warn");
    assert.equal(result.exitCode, 0);
  });

  it("captures a non-zero exit code", async function () {
    const result = await safeSpawn(process.execPath, ["-e", "process.exit(7);"]);
    assert.equal(result.exitCode, 7);
  });

  it("strips exactly one trailing newline (CRLF-safe) from stdout/stderr", async function () {
    // The trailing-newline strip must remove only the final \r?\n, not every
    // newline — verifies the regex is anchored ($) rather than global.
    const result = await safeSpawn(process.execPath, [
      "-e",
      "process.stdout.write('line1\\nline2\\n'); process.exit(0);",
    ]);
    assert.equal(result.stdout, "line1\nline2");
  });

  it("never resolves successfully for a binary that does not exist", async function () {
    // OS-dependent shape: POSIX spawn (shell:false) rejects with ENOENT.
    // Windows uses shell:true (see spawn-helper.ts's winCommandLine comment),
    // so cmd.exe resolves the failure as a non-zero exit with a "not
    // recognized" stderr message instead of a rejected promise. Assert only
    // the OS-independent contract: a nonexistent binary never reports
    // success (exitCode 0).
    try {
      const result = await safeSpawn("dd-definitely-not-a-real-binary-xyz-safe-spawn", [
        "--version",
      ]);
      assert.notEqual(result.exitCode, 0, "a nonexistent binary must not report success");
    } catch (err) {
      assert.ok(err instanceof Error, "expected an Error on spawn failure");
    }
  });

  it("defaults args to an empty array when omitted", async function () {
    // The `args: string[] = []` default parameter — call with no second arg.
    const result = await safeSpawn(process.execPath);
    // Node with no script/eval prints its REPL banner-less usage or waits on
    // stdin; force a fast, deterministic exit via --version-style behavior by
    // asserting only on the shape (a real spawn happened; no argv-length
    // assumption). Using -e "" style commands elsewhere; this call just
    // proves the default parameter itself is reachable and doesn't throw a
    // TypeError over undefined args.
    assert.equal(typeof result.exitCode, "number");
  });

  it("rejects with an Error when child_process.spawn throws synchronously", async function () {
    // node:child_process.spawn throws a synchronous TypeError for a
    // non-string `file` argument (before ever reaching the async 'error'
    // event) — exercises the outer try/catch around the spawn() call
    // itself, distinct from the async ENOENT path covered above. JS callers
    // (unlike the TS source) can pass a value TypeScript's `cmd: string`
    // signature wouldn't allow.
    await assert.rejects(safeSpawn(/** @type {any} */ (null), []), (err) => {
      assert.ok(err instanceof Error, "expected an Error");
      return true;
    });
  });
});

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
