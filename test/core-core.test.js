import fs from "node:fs";
import { runTests } from "../dist/core/index.js";
import assert from "node:assert/strict";
import path from "node:path";
import os from "node:os";

const artifactPath = path.resolve("./test/core-artifacts");
const config_base = JSON.parse(fs.readFileSync(`${artifactPath}/config.json`, "utf8"));

describe("Run tests successfully", function () {
  // 30 minutes for the combined core test suite (runs all specs in one Appium session)
  this.timeout(1800000);
  describe("Core test suite", function () {
    // Run all spec files in a single runTests() call to avoid repeated Appium restarts.
    // This starts Appium once and runs all specs within that session.
    it("All core spec files pass", async () => {
      const config_tests = JSON.parse(JSON.stringify(config_base));
      config_tests.runTests.input = artifactPath;
      const result = await runTests(config_tests);
      if (result === null) assert.fail("Expected result to be non-null");
      const failedSpecs = result.specs.filter((s) => s.result === "FAIL");
      assert.equal(
        result.summary.specs.fail,
        0,
        `${failedSpecs.length} spec(s) failed: ${failedSpecs.map((s) => s.specId).join(", ")}`
      );
    });
  });

  it("Tests skip steps after a failure", async () => {
    const failureTest = {
      tests: [
        {
          steps: [
            {
              runShell: "exit 1", // This step will fail
            },
            {
              runShell:
                "echo 'This step should be skipped if the previous fails'",
            },
          ],
        },
      ],
    };
    // Write the failure test to a temporary file
    const tempFilePath = path.resolve("./test/temp-failure-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(failureTest, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.steps.fail, 1);
      assert.equal(result.summary.steps.skipped, 1);
    } finally {
      // Ensure cleanup even on failure
      fs.unlinkSync(tempFilePath);
    }
  });

  it("A guard `if` false skips the step (with the guard reason) and does NOT skip the following non-guarded step", async () => {
    // Step 1 has an always-false guard -> SKIPPED with the guard reason, action
    // NOT run, stepExecutionFailed NOT tripped. Step 2 has no guard -> still
    // runs and PASSes (proving a guard-skip doesn't cascade like a FAIL).
    const guardTest = {
      tests: [
        {
          steps: [
            {
              if: "$$platform == nonexistentos",
              runShell: "node -e \"process.exit(0)\"",
            },
            {
              runShell: "node -e \"process.exit(0)\"",
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-guard-if-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(guardTest, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps.length, 2);
      // Step 1: SKIPPED for the guard reason, action not run.
      assert.equal(steps[0].result, "SKIPPED");
      assert.match(
        steps[0].resultDescription,
        /guard `if` condition not met/
      );
      // Step 2: ran (not affected by the guard-skip) and PASSed.
      assert.equal(steps[1].result, "PASS");
      assert.equal(result.summary.steps.skipped, 1);
      assert.equal(result.summary.steps.pass, 1);
      assert.equal(result.summary.steps.fail, 0);
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("Custom assertion FAIL fails the step and skips the rest of the test", async () => {
    // An action that EXECUTES fine (exit 0) but whose custom assertion is false.
    // The custom-assertion FAIL must fail the step, and the existing step-loop
    // FAIL handling must then skip the remaining step.
    const customFailTest = {
      tests: [
        {
          steps: [
            {
              runShell: "node -e \"process.exit(0)\"",
              assertions: "$$outputs.exitCode == 1",
            },
            {
              runShell: "node -e \"process.exit(0)\"",
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-custom-fail-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(customFailTest, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.steps.fail, 1);
      assert.equal(result.summary.steps.skipped, 1);
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("Custom assertion records are SKIPPED when an implicit check already FAILed", async () => {
    // Exit code 1 with exitCodes [0] makes the IMPLICIT check FAIL. The custom
    // assertion must then be SKIPPED (not evaluated), and the step stays FAIL.
    const implicitFailTest = {
      tests: [
        {
          steps: [
            {
              runShell: { command: "node -e \"process.exit(1)\"", exitCodes: [0] },
              assertions: "$$outputs.exitCode == 1",
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-implicit-fail-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(implicitFailTest, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.steps.fail, 1);
      const step = result.specs[0].tests[0].contexts[0].steps[0];
      const custom = (step.assertions || []).filter((a) => a.source === "custom");
      assert.equal(custom.length, 1);
      assert.equal(custom[0].result, "SKIPPED");
      const implicit = (step.assertions || []).filter(
        (a) => a.source === "implicit"
      );
      assert.ok(implicit.some((a) => a.result === "FAIL"));
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("A spec-level guard `if` false skips every test/context in the spec (SKIPPED, 0 fail)", async () => {
    // Spec-level guard is false everywhere ($$platform is never nonexistentos).
    // Every test in the spec must be SKIPPED across all contexts, no job runs,
    // and nothing fails.
    const guardSpec = {
      if: "$$platform == nonexistentos",
      tests: [
        { steps: [{ runShell: "node -e \"process.exit(0)\"" }] },
        { steps: [{ runShell: "node -e \"process.exit(0)\"" }] },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-guard-if-spec-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(guardSpec, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      const tests = result.specs[0].tests;
      assert.equal(tests.length, 2);
      for (const test of tests) {
        assert.ok(test.contexts.length >= 1);
        for (const ctx of test.contexts) {
          assert.equal(ctx.result, "SKIPPED");
          assert.match(ctx.resultDescription, /spec guard `if` condition not met/);
          assert.deepEqual(ctx.steps, []);
        }
      }
      // No steps ran (every context was skipped before enqueue).
      assert.equal(result.summary.steps.fail, 0);
      assert.equal(result.summary.steps.pass, 0);
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("A test-level guard `if` false skips that test while its sibling runs", async () => {
    // First test has an always-false test guard -> SKIPPED across contexts.
    // Sibling test has no guard -> runs and PASSes. Proves test-level isolation.
    const guardSpec = {
      tests: [
        {
          if: "$$platform == nonexistentos",
          steps: [{ runShell: "node -e \"process.exit(0)\"" }],
        },
        { steps: [{ runShell: "node -e \"process.exit(0)\"" }] },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-guard-if-test-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(guardSpec, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      const tests = result.specs[0].tests;
      assert.equal(tests.length, 2);
      // First test: every context SKIPPED for the test-guard reason, no steps.
      for (const ctx of tests[0].contexts) {
        assert.equal(ctx.result, "SKIPPED");
        assert.match(ctx.resultDescription, /test guard `if` condition not met/);
        assert.deepEqual(ctx.steps, []);
      }
      // Sibling test: ran and PASSed.
      assert.ok(tests[1].contexts.some((c) => c.result === "PASS"));
      assert.ok(tests[1].contexts.some((c) => (c.steps || []).length > 0));
      assert.equal(result.summary.steps.fail, 0);
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("Test skips when unsafe and unsafe is disallowed", async () => {
    const unsafeTest = {
      tests: [
        {
          steps: [
            {
              runShell: "echo 'This step is unsafe'",
              unsafe: true, // Marked as potentially unsafe
            },
          ],
        },
      ],
    };
    // Write the unsafe test to a temporary file
    const tempFilePath = path.resolve("./test/temp-unsafe-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(unsafeTest, null, 2));
    const config = {
      input: tempFilePath,
      logLevel: "debug",
      allowUnsafeSteps: false,
    };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      assert.equal(result.summary.specs.skipped, 1);
    } finally {
      // Ensure cleanup even on failure
      fs.unlinkSync(tempFilePath);
    }
  });

  it("Test is marked as skipped when all contexts are skipped", async () => {
    // Create a spec with a context for a different platform than the current one.
    // The resolver will generate a context that doesn't match the current platform,
    // which will cause it to be skipped.
    const currentPlatform = os.platform();
    const targetPlatform = currentPlatform === "win32" ? "linux" : "windows";

    const allContextsSkippedTest = {
      id: "test-all-contexts-skipped",
      contexts: [
        {
          app: { name: "firefox" },
          platforms: [targetPlatform], // Will be skipped on current platform
        },
      ],
      tests: [
        {
          id: "test-1",
          steps: [
            {
              action: "runShell",
              command: "echo 'This should not run'",
            },
          ],
        },
      ],
    };

    // Write the test to a temporary file
    const tempFilePath = path.resolve("./test/temp-all-contexts-skipped.json");
    fs.writeFileSync(
      tempFilePath,
      JSON.stringify(allContextsSkippedTest, null, 2)
    );
    const config = {
      input: tempFilePath,
      logLevel: "silent",
    };
    let result;
    try {
      result = await runTests(config);
      // Verify that the test is marked as skipped, not passed
      assert.equal(result.summary.tests.skipped, 1);
      assert.equal(result.summary.tests.pass, 0);
      assert.equal(result.summary.specs.skipped, 1);
      assert.equal(result.summary.specs.pass, 0);
      assert.equal(result.summary.contexts.skipped, 1);
      // Also verify the actual test result
      assert.equal(result.specs[0].result, "SKIPPED");
      assert.equal(result.specs[0].tests[0].result, "SKIPPED");
      assert.equal(result.specs[0].tests[0].contexts[0].result, "SKIPPED");
    } finally {
      // Ensure cleanup even on failure
      fs.unlinkSync(tempFilePath);
    }
  });

  it("autoRecord/record name conflict skips the whole test before any step runs", async function () {
    // A `record` step that reuses a recording `name` while one with that name
    // is still active is caught by the static Phase-1 preflight, which skips
    // the test (all contexts) with a clear reason — no driver is started, so
    // this is deterministic on every platform.
    const conflictSpec = {
      tests: [
        {
          testId: "dup-name-conflict",
          steps: [
            { goTo: "http://localhost:8092" },
            { record: { path: "dup-1.mp4", name: "dup", engine: "ffmpeg", overwrite: "true" } },
            { record: { path: "dup-2.mp4", name: "dup", engine: "ffmpeg", overwrite: "true" } },
            { stopRecord: "dup" },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-record-name-conflict.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(conflictSpec, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0, "conflict must not fail the spec");
      assert.equal(result.summary.tests.skipped, 1, "exactly the one conflicting test should be skipped");
      assert.equal(result.summary.tests.pass, 0, "the conflicting test must not pass");
      const ctx = result.specs[0].tests[0].contexts[0];
      assert.equal(ctx.result, "SKIPPED");
      assert.match(
        ctx.resultDescription,
        /recording name 'dup'/,
        `expected the skip reason to name the conflict, got: ${ctx.resultDescription}`
      );
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  // autoRecord precedence (config > spec > test) end-to-end through runTests.
  // The synthetic full-context recording carries this exact description, so its
  // presence/absence in the executed steps proves whether autoRecord resolved
  // true for the context. Headless here: the ffmpeg capture itself SKIPs without
  // a display, but the synthetic step is still injected and reported, which is
  // all these assertions need.
  const AUTO_RECORD_DESC = "Automatic full-context recording";
  const hasSyntheticRecord = (result) => {
    const steps = result?.specs?.[0]?.tests?.[0]?.contexts?.[0]?.steps || [];
    return steps.some(
      (s) => s.description === AUTO_RECORD_DESC && typeof s.record !== "undefined"
    );
  };

  it("autoRecord config-level injects a synthetic recording end-to-end", async function () {
    this.retries(2); // browser startup between sequential runTests calls can be flaky
    const spec = {
      tests: [
        {
          steps: [
            { goTo: "http://localhost:8092" },
            { find: { selector: "body", timeout: 5000 } },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-autorecord-config.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(spec, null, 2));
    // autoRecord set ONLY at the config level (no spec/test fields).
    const config = { input: tempFilePath, logLevel: "silent", autoRecord: true };
    try {
      const result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      assert.ok(
        hasSyntheticRecord(result),
        "config-level autoRecord should inject the synthetic recording step"
      );
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("autoRecord test-level false overrides spec-level true end-to-end", async function () {
    this.retries(2);
    const spec = {
      autoRecord: true, // spec level on
      tests: [
        {
          autoRecord: false, // test level wins → no synthetic recording
          steps: [
            { goTo: "http://localhost:8092" },
            { find: { selector: "body", timeout: 5000 } },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-autorecord-precedence.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(spec, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    try {
      const result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      assert.ok(
        !hasSyntheticRecord(result),
        "test-level autoRecord:false should override spec-level true (no synthetic recording)"
      );
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("runShell regression test returns WARNING when variation exceeds threshold", async () => {
    // Create a test file path
    const outputFilePath = path.resolve("./test/temp-regression-output.txt");

    // Create initial file with content
    fs.writeFileSync(outputFilePath, "initial content");

    const regressionTest = {
      tests: [
        {
          steps: [
            {
              runShell: {
                command: "echo",
                args: ["completely different content"],
                path: outputFilePath,
                maxVariation: 0.1,
                overwrite: "aboveVariation",
              },
            },
          ],
        },
      ],
    };

    const tempFilePath = path.resolve("./test/temp-regression-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(regressionTest, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    let result;
    try {
      result = await runTests(config);
      // Verify that the step is marked as WARNING, not FAIL
      assert.equal(result.summary.steps.warning, 1);
      assert.equal(result.summary.steps.fail, 0);
      assert.equal(
        result.specs[0].tests[0].contexts[0].steps[0].result,
        "WARNING"
      );
    } finally {
      // Ensure cleanup even on failure
      fs.unlinkSync(tempFilePath);
      if (fs.existsSync(outputFilePath)) {
        fs.unlinkSync(outputFilePath);
      }
    }
  });

  it("runShell carries articulated assertion records into the report", async function () {
    // Phase 4a.1: a successful runShell step emits implicit assertion records
    // (exitCode, stdio) that the runner rolls up into the step result and the
    // existing report spread carries through under `step.assertions`.
    const assertionSpec = {
      tests: [
        {
          steps: [
            {
              runShell: {
                command: "echo",
                args: ["needle-in-haystack"],
                exitCodes: [0],
                stdio: "needle",
              },
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-runshell-assertions.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(assertionSpec, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.steps.fail, 0);
      assert.equal(result.summary.steps.pass, 1);
      const step = result.specs[0].tests[0].contexts[0].steps[0];
      assert.equal(step.result, "PASS");
      assert.ok(Array.isArray(step.assertions), "step should carry assertions");
      // Unified model: statements are runtime $$ expressions evaluated by the
      // shared engine; expected/actual are vestigial and omitted.
      const exit = step.assertions.find((a) =>
        a.statement.includes("exitCode")
      );
      assert.ok(exit, "expected an exitCode assertion record");
      assert.equal(exit.source, "implicit");
      assert.equal(exit.result, "PASS");
      assert.equal(exit.statement, "$$outputs.exitCode oneOf [0]");
      const stdio = step.assertions.find((a) =>
        a.statement.includes("stdioMatched")
      );
      assert.ok(stdio, "expected a stdio assertion record");
      assert.equal(stdio.result, "PASS");
      assert.equal(stdio.statement, "$$outputs.stdioMatched == true");
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("screenshot regression test returns WARNING when variation exceeds threshold", async function () {
    this.retries(2); // Browser driver startup can be flaky between sequential runTests calls
    // Create a test screenshot path
    const screenshotPath = path.resolve(
      "./test/temp-regression-screenshot.png"
    );
    const screenshotDir = path.dirname(screenshotPath);

    // Ensure directory exists
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }

    // First, create an initial screenshot
    const initialTest = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092",
            },
            {
              screenshot: {
                path: screenshotPath,
                maxVariation: 0.05,
                overwrite: "false",
              },
            },
          ],
        },
      ],
    };

    const tempInitialFilePath = path.resolve(
      "./test/temp-initial-screenshot-test.json"
    );
    fs.writeFileSync(tempInitialFilePath, JSON.stringify(initialTest, null, 2));
    const initialConfig = { input: tempInitialFilePath, logLevel: "silent" };

    try {
      // Run initial test to create the baseline screenshot
      await runTests(initialConfig);

      // Now create a test that navigates to a different page to create variation
      const regressionTest = {
        tests: [
          {
            steps: [
              {
                goTo: "http://localhost:8092/drag-drop-test.html",
              },
              {
                screenshot: {
                  path: screenshotPath,
                  maxVariation: 0.05,
                  overwrite: "aboveVariation",
                },
              },
            ],
          },
        ],
      };

      const tempFilePath = path.resolve(
        "./test/temp-screenshot-regression-test.json"
      );
      fs.writeFileSync(tempFilePath, JSON.stringify(regressionTest, null, 2));
      const config = { input: tempFilePath, logLevel: "silent" };

      const result = await runTests(config);

      // Verify that the step is marked as WARNING, not FAIL
      assert.equal(result.summary.steps.warning, 1);
      assert.equal(result.summary.steps.fail, 0);
      assert.equal(
        result.specs[0].tests[0].contexts[0].steps[1].result,
        "WARNING"
      );

      // Cleanup test files
      fs.unlinkSync(tempFilePath);
      fs.unlinkSync(tempInitialFilePath);
    } finally {
      // Ensure cleanup even on failure
      if (fs.existsSync(tempInitialFilePath)) {
        fs.unlinkSync(tempInitialFilePath);
      }
      if (fs.existsSync(screenshotPath)) {
        fs.unlinkSync(screenshotPath);
      }
    }
  });

  it("runBrowserScript: unsafe step runs when allowed, output mismatch FAILs, timeout FAILs", async function () {
    this.retries(2); // Browser driver startup can be flaky between sequential runTests calls
    const spec = {
      tests: [
        {
          // Test 0: an unsafe runBrowserScript runs when allowUnsafeSteps is true.
          steps: [
            { goTo: "http://localhost:8092" },
            { unsafe: true, runBrowserScript: { script: "return 1 + 1;", output: "2" } },
          ],
        },
        {
          // Test 1: an output assertion that can't match -> FAIL.
          steps: [
            { goTo: "http://localhost:8092" },
            { runBrowserScript: { script: "return 'actual';", output: "expected-but-absent" } },
          ],
        },
        {
          // Test 2: a script that runs past its timeout -> FAIL.
          steps: [
            { goTo: "http://localhost:8092" },
            {
              runBrowserScript: {
                script: "const start = Date.now(); while (Date.now() - start < 4000) {} return true;",
                timeout: 1000,
              },
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-runbrowserscript-edge.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(spec, null, 2));
    const config = { input: tempFilePath, logLevel: "silent", allowUnsafeSteps: true };
    try {
      const result = await runTests(config);
      const tests = result.specs[0].tests;
      // Unsafe step ran (not skipped) and passed.
      assert.equal(tests[0].contexts[0].steps[1].result, "PASS");
      // Output mismatch failed.
      assert.equal(tests[1].contexts[0].steps[1].result, "FAIL");
      // Timeout failed.
      assert.equal(tests[2].contexts[0].steps[1].result, "FAIL");
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("runBrowserScript honors `directory` for the snapshot path", async function () {
    this.retries(2); // Browser driver startup can be flaky between sequential runTests calls
    const dir = path.resolve("./test/temp-rbs-dir");
    fs.rmSync(dir, { recursive: true, force: true });
    const strayAtCwd = path.resolve("./rbs-dir-output.txt");
    const spec = {
      tests: [
        {
          steps: [
            { goTo: "http://localhost:8092" },
            {
              runBrowserScript: {
                script: "return 'dir-test-value';",
                path: "rbs-dir-output.txt",
                directory: dir,
              },
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-rbs-dir-spec.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(spec, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    try {
      const result = await runTests(config);
      assert.equal(result.summary.steps.fail, 0);
      // The output lands under `directory` (resolved upstream in files.ts), not cwd.
      assert.equal(
        fs.existsSync(path.join(dir, "rbs-dir-output.txt")),
        true,
        "snapshot should be written under `directory`"
      );
      assert.equal(
        fs.existsSync(strayAtCwd),
        false,
        "snapshot should not be written to the working directory"
      );
    } finally {
      fs.rmSync(tempFilePath, { force: true });
      fs.rmSync(dir, { recursive: true, force: true });
      fs.rmSync(strayAtCwd, { force: true });
    }
  });

  it("runBrowserScript snapshot returns WARNING when variation exceeds threshold and rewrites the file", async function () {
    this.retries(2); // Browser driver startup can be flaky between sequential runTests calls
    const outputFilePath = path.resolve("./test/temp-rbs-snapshot.txt");
    fs.writeFileSync(outputFilePath, "initial content");

    const spec = {
      tests: [
        {
          steps: [
            { goTo: "http://localhost:8092" },
            {
              runBrowserScript: {
                script: "return 'completely different return value';",
                path: outputFilePath,
                maxVariation: 0.1,
                overwrite: "aboveVariation",
              },
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-rbs-snapshot-test.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(spec, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    try {
      const result = await runTests(config);
      assert.equal(result.summary.steps.warning, 1);
      assert.equal(result.summary.steps.fail, 0);
      assert.equal(
        result.specs[0].tests[0].contexts[0].steps[1].result,
        "WARNING"
      );
      // overwrite: "aboveVariation" should have rewritten the file.
      assert.equal(
        fs.readFileSync(outputFilePath, "utf8"),
        "completely different return value"
      );
    } finally {
      fs.unlinkSync(tempFilePath);
      if (fs.existsSync(outputFilePath)) {
        fs.unlinkSync(outputFilePath);
      }
    }
  });
});

describe("Intelligent goTo behavior", function () {
  // 10 minutes for all goTo timeout tests combined
  this.timeout(600000);
  it("goTo fails with timeout on network idle, DOM idle, and element finding checks", async () => {
    const goToTimeoutSpec = {
      tests: [
        {
          steps: [
            {
              goTo: {
                url: "http://localhost:8092/waitUntil-test-network-forever.html",
                timeout: 5000,
                waitUntil: { networkIdleTime: 500 },
              },
            },
          ],
        },
        {
          steps: [
            {
              goTo: {
                url: "http://localhost:8092/waitUntil-test-dom-mutations-forever.html",
                timeout: 5000,
                waitUntil: { domIdleTime: 500 },
              },
            },
          ],
        },
        {
          steps: [
            {
              goTo: {
                url: "http://localhost:8092/index.html",
                timeout: 5000,
                waitUntil: {
                  find: { selector: ".nonexistent-element-that-will-never-appear" },
                },
              },
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-goto-timeout-tests.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(goToTimeoutSpec, null, 2));
    const config = { input: tempFilePath, logLevel: "silent" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.steps.fail, 3, "All 3 goTo timeout steps should fail");
      assert.equal(result.summary.tests.fail, 3, "All 3 goTo timeout tests should fail");
    } finally {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
    }
  });
});

describe("getRunner() function", function () {
  // 5 minutes per test
  this.timeout(300000);

  let getRunner;

  before(async function () {
    const testsModule = await import("../dist/core/tests.js");
    getRunner = testsModule.getRunner;
  });

  it("should create a runner with correct defaults, structure, and state", async function () {
    let cleanup;
    try {
      const result = await getRunner();
      cleanup = result.cleanup;

      // Verify returned object structure
      assert.ok(result.runner, "runner should be defined");
      assert.ok(result.appium, "appium should be defined");
      assert.ok(result.cleanup, "cleanup should be defined");
      assert.ok(result.runStep, "runStep should be defined");
      assert.equal(typeof result.runStep, "function", "runStep should be a function");
      assert.equal(typeof result.cleanup, "function", "cleanup should be a function");

      // Verify runner is functional
      assert.ok(typeof result.runner.url === "function", "runner should have url method");
      assert.ok(typeof result.runner.deleteSession === "function", "runner should have deleteSession method");

      // Verify appium process
      assert.ok(result.appium.pid, "appium should have a PID");
      assert.ok(!result.appium.killed, "appium should be running");

      // Check runner state object initialization
      assert.ok(result.runner.state !== undefined, "runner should have state object");
      assert.strictEqual(result.runner.state.url, "", "initial url should be empty string");
      assert.strictEqual(result.runner.state.x, null, "initial x should be null");
      assert.strictEqual(result.runner.state.y, null, "initial y should be null");

      // Verify default window size (1200x800)
      const size = await result.runner.getWindowSize();
      assert.ok(
        Math.abs(size.width - 1200) <= 10,
        `default width should be close to 1200, got ${size.width}`
      );
      assert.ok(
        Math.abs(size.height - 800) <= 10,
        `default height should be close to 800, got ${size.height}`
      );
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should support headless navigation and multiple page operations", async function () {
    let cleanup;
    try {
      const result = await getRunner({ headless: true });
      cleanup = result.cleanup;

      // Verify session is ready
      await result.runner.getTitle();

      // Navigate to test page
      await result.runner.url("http://localhost:8092/index.html");
      const title = await result.runner.getTitle();
      assert.ok(title, "should get page title in headless mode");

      // Find elements
      const element = await result.runner.$("body");
      assert.ok(element, "should be able to find elements");

      // Navigate to a second page
      await result.runner.url("http://localhost:8092/drag-drop-test.html");
      const title2 = await result.runner.getTitle();
      assert.ok(title2, "should navigate to second page");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should create a non-headless runner when headless=false", async function () {
    let cleanup;
    try {
      const result = await getRunner({ headless: false });
      cleanup = result.cleanup;

      await result.runner.url("http://localhost:8092/index.html");
      const title = await result.runner.getTitle();
      assert.ok(title, "should be able to navigate and get title in non-headless mode");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should respect custom width and height", async function () {
    let cleanup;
    try {
      const width = 1024;
      const height = 768;
      const result = await getRunner({ width, height });
      cleanup = result.cleanup;

      const size = await result.runner.getWindowSize();
      assert.ok(
        Math.abs(size.width - width) <= 10,
        `width should be close to ${width}, got ${size.width}`
      );
      assert.ok(
        Math.abs(size.height - height) <= 10,
        `height should be close to ${height}, got ${size.height}`
      );
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should accept custom config options", async function () {
    let cleanup;
    try {
      const result = await getRunner({ config: { logLevel: "silent" } });
      cleanup = result.cleanup;

      assert.ok(result.runner, "runner should be created with custom config");
      await result.runner.url("http://localhost:8092/index.html");
      assert.ok(await result.runner.getTitle(), "should work with custom config");
    } finally {
      if (cleanup) await cleanup();
    }
  });

  it("should throw error if Chrome is not available", async function () {
    // Requires mocking getAvailableApps - skipping
    this.skip();
  });

  it("cleanup should close session and be idempotent", async function () {
    const result = await getRunner();
    const { runner, appium, cleanup } = result;

    // Verify runner is active
    assert.ok(appium.pid, "Appium should have a PID");
    await runner.url("http://localhost:8092/index.html");

    // First cleanup
    await cleanup();

    // Verify session is closed
    try {
      await runner.getTitle();
      assert.fail("Should have thrown error after cleanup");
    } catch (error) {
      assert.ok(error, "Should throw error when using runner after cleanup");
    }

    // Idempotent: subsequent cleanups should not throw
    await assert.doesNotReject(
      async () => await cleanup(),
      "second cleanup call should not throw"
    );
    await assert.doesNotReject(
      async () => await cleanup(),
      "third cleanup call should not throw"
    );
  });

  it("cleanup should handle already-closed session gracefully", async function () {
    const result = await getRunner();
    const { runner, cleanup } = result;

    // Manually close the session
    await runner.deleteSession();

    // Cleanup should not throw even though session is already closed
    await assert.doesNotReject(
      async () => await cleanup(),
      "cleanup should not throw when session already closed"
    );
  });

  it("should handle multiple sequential runners", async function () {
    // Create first runner
    const result1 = await getRunner();
    await result1.runner.url("http://localhost:8092/index.html");
    const title1 = await result1.runner.getTitle();
    assert.ok(title1, "first runner should work");
    await result1.cleanup();

    // Create second runner after first cleanup
    const result2 = await getRunner();
    await result2.runner.url("http://localhost:8092/index.html");
    const title2 = await result2.runner.getTitle();
    assert.ok(title2, "second runner should work after first cleanup");
    await result2.cleanup();
  });

  it("should handle errors during runner initialization", async function () {
    // Requires mocking driverStart - skipping
    this.skip();
  });

  // --- Routing handlers: onPass/onFail/onWarning/onSkip + continue/stop ---
  // These exercise FAIL/stop control-flow paths the "no spec fails" gate can't
  // express as PASS/SKIPPED fixtures. flow != verdict throughout.

  it("onFail [{continue:true}] runs the next step after a failure (verdict still FAIL)", async () => {
    // Step 1 fails but routes continue -> step 2 still runs and passes. The
    // step stays FAILed, so the test verdict rolls up to FAIL (routing changes
    // flow, never the result).
    const routingTest = {
      tests: [
        {
          steps: [
            {
              runShell: "node -e \"process.exit(1)\"", // fails (exitCode 1)
              onFail: [{ continue: true }],
            },
            { runShell: "node -e \"process.exit(0)\"" }, // should still run
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-onfail-continue.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(routingTest, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps.length, 2);
      assert.equal(steps[0].result, "FAIL");
      assert.equal(steps[1].result, "PASS"); // ran despite the prior failure
      assert.equal(result.summary.steps.fail, 1);
      assert.equal(result.summary.steps.pass, 1);
      assert.equal(result.summary.steps.skipped, 0);
      // flow != verdict: the test still FAILs.
      assert.equal(result.specs[0].tests[0].result, "FAIL");
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("onPass [{stop:'test'}] halts the test after a passing step", async () => {
    // Step 1 passes but routes stop -> step 2 is SKIPPED with the routing
    // reason (not a failure reason). With a PASS present the test rolls up PASS.
    const routingTest = {
      tests: [
        {
          steps: [
            {
              runShell: "node -e \"process.exit(0)\"",
              onPass: [{ stop: "test" }],
            },
            { runShell: "node -e \"process.exit(0)\"" }, // should be skipped
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-onpass-stop.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(routingTest, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps.length, 2);
      assert.equal(steps[0].result, "PASS");
      assert.equal(steps[1].result, "SKIPPED");
      assert.match(steps[1].resultDescription, /routing/);
      assert.equal(result.summary.steps.skipped, 1);
      assert.equal(result.summary.steps.fail, 0);
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("onSkip [{stop:'test'}] after a guard-skipped step halts the rest", async () => {
    // Step 1 is guard-`if` false -> SKIPPED, and its onSkip routes stop -> step
    // 2 is SKIPPED for the routing reason (not the guard reason). All steps
    // SKIPPED -> the test rolls up SKIPPED. Proves a reached-but-skipped step's
    // onSkip handler fires.
    const routingTest = {
      tests: [
        {
          steps: [
            {
              if: "$$platform == nonexistentos", // always false -> SKIPPED
              runShell: "node -e \"process.exit(0)\"",
              onSkip: [{ stop: "test" }],
            },
            { runShell: "node -e \"process.exit(0)\"" }, // should be skipped
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-onskip-stop.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(routingTest, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps.length, 2);
      assert.equal(steps[0].result, "SKIPPED");
      assert.match(steps[0].resultDescription, /guard `if` condition not met/);
      assert.equal(steps[1].result, "SKIPPED");
      assert.match(steps[1].resultDescription, /routing/);
      assert.equal(result.summary.steps.fail, 0);
      assert.equal(result.summary.steps.pass, 0);
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("an unsafe step DOWNSTREAM of a stop does NOT fire its onSkip routing", async () => {
    // Invariant: a step that is not reached (downstream of a prior stop) fires
    // NO routing. Step 1 fails -> the test stops (default onFail). Step 2 is
    // unsafe AND carries onSkip:[{stop:'test'}]; because it is downstream of the
    // stop its onSkip must NOT fire. Proof: step 3's skip reason stays the
    // original failure reason ("previous failure"), not the routing reason — if
    // step 2's onSkip had fired it would have overwritten the stop reason.
    const t = {
      tests: [
        {
          steps: [
            { runShell: "node -e \"process.exit(1)\"" }, // FAIL -> stop
            {
              unsafe: true,
              runShell: "node -e \"process.exit(0)\"",
              onSkip: [{ stop: "test" }],
            },
            { runShell: "node -e \"process.exit(0)\"" },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-unsafe-after-stop.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(t, null, 2));
    const config = {
      input: tempFilePath,
      logLevel: "debug",
      allowUnsafeSteps: false,
    };
    let result;
    try {
      result = await runTests(config);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps.length, 3);
      assert.equal(steps[0].result, "FAIL");
      // Step 2: skipped for being unsafe (its pre-existing reason), NOT routing.
      assert.equal(steps[1].result, "SKIPPED");
      assert.match(steps[1].resultDescription, /unsafe/);
      // Step 3: still carries the ORIGINAL failure stop reason — proving step 2's
      // onSkip never fired (it would have rewritten the reason to "...routing").
      assert.equal(steps[2].result, "SKIPPED");
      assert.match(steps[2].resultDescription, /previous failure/);
      assert.doesNotMatch(steps[2].resultDescription, /routing/);
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  // --- Routing: retry action ---

  it("onFail retry recovers a transient failure (fails once, passes on retry)", async () => {
    // A counter-file step exits 1 on its first run and 0 on the second.
    // onFail:[{retry:{limit:2}}] re-runs it; the retry passes, so the step is
    // PASS with attempts === 2 (verdict reflects the final attempt).
    const counterFile = path
      .join(os.tmpdir(), `dd-retry-counter-${process.pid}-${Math.floor(performance.now())}.txt`)
      .replace(/\\/g, "/");
    if (fs.existsSync(counterFile)) fs.unlinkSync(counterFile);
    const cmd =
      `node -e "const fs=require('fs');const f='${counterFile}';` +
      `let n=fs.existsSync(f)?Number(fs.readFileSync(f,'utf8')):0;n++;` +
      `fs.writeFileSync(f,String(n));process.exit(n>=2?0:1)"`;
    const t = {
      tests: [
        { steps: [{ runShell: cmd, onFail: [{ retry: { limit: 2 } }] }] },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-retry-recover.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(t, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      const step = result.specs[0].tests[0].contexts[0].steps[0];
      assert.equal(step.result, "PASS");
      assert.equal(step.attempts, 2); // 1 initial + 1 retry
    } finally {
      fs.unlinkSync(tempFilePath);
      if (fs.existsSync(counterFile)) fs.unlinkSync(counterFile);
    }
  });

  it("onFail retry exhausted -> the default (stop) applies", async () => {
    // An always-failing step with retry:{limit:2} runs 3 times total (1 + 2
    // retries), stays FAIL, then the exhausted retry falls to the onFail
    // default (stop) -> the next step is SKIPPED.
    const t = {
      tests: [
        {
          steps: [
            {
              runShell: "node -e \"process.exit(1)\"",
              onFail: [{ retry: { limit: 2 } }],
            },
            { runShell: "node -e \"process.exit(0)\"" },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-retry-exhaust.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(t, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps[0].result, "FAIL");
      assert.equal(steps[0].attempts, 3); // 1 initial + 2 retries
      assert.equal(steps[1].result, "SKIPPED"); // default stop after exhaustion
      assert.match(steps[1].resultDescription, /previous failure/);
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("onFail [{retry},{continue}] retries then continues when still failing", async () => {
    // After retries are exhausted and the step still FAILs, the trailing
    // {continue:true} entry applies -> the next step still runs.
    const t = {
      tests: [
        {
          steps: [
            {
              runShell: "node -e \"process.exit(1)\"",
              onFail: [{ retry: { limit: 1 } }, { continue: true }],
            },
            { runShell: "node -e \"process.exit(0)\"" },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-retry-continue.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(t, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps[0].result, "FAIL");
      assert.equal(steps[0].attempts, 2); // 1 initial + 1 retry
      assert.equal(steps[1].result, "PASS"); // continued past the failure
      // flow != verdict: the test still FAILs.
      assert.equal(result.specs[0].tests[0].result, "FAIL");
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  // --- Routing: goToStep action ---

  it("goToStep forward jump skips an intermediate step", async () => {
    // Step a PASSes and routes goToStep "c" -> step b is never run; step c runs.
    // The report contains a then c (not b), and the verdict is PASS.
    const t = {
      tests: [
        {
          steps: [
            {
              stepId: "a",
              runShell: "node -e \"process.exit(0)\"",
              onPass: [{ goToStep: "c" }],
            },
            { stepId: "b", runShell: "node -e \"process.exit(0)\"" },
            { stepId: "c", runShell: "node -e \"process.exit(0)\"" },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-gotostep-forward.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(t, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      // Only a and c produced reports — b was jumped over and never reported.
      assert.equal(steps.length, 2);
      assert.equal(steps[0].stepId, "a");
      assert.equal(steps[0].result, "PASS");
      assert.equal(steps[1].stepId, "c");
      assert.equal(steps[1].result, "PASS");
      assert.equal(result.specs[0].tests[0].result, "PASS");
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("goToStep backward jump re-runs a step (records visit===2)", async () => {
    // Step b jumps back to a only on its first visit (a counter file gates it),
    // so a runs twice then execution proceeds forward. The revisited stepId "a"
    // appears >=2 times, and the 2nd report carries visit===2.
    const counterFile = path
      .join(os.tmpdir(), `dd-goto-counter-${process.pid}-${Math.floor(performance.now())}.txt`)
      .replace(/\\/g, "/");
    if (fs.existsSync(counterFile)) fs.unlinkSync(counterFile);
    // b: on first run create the marker file and exit 1 (FAIL -> jump back to a);
    // on the second run the file exists, so exit 0 (PASS -> continue).
    const bCmd = `node -e "const f='${counterFile}';const fs=require('fs');if(fs.existsSync(f)){process.exit(0)}else{fs.writeFileSync(f,'1');process.exit(1)}"`;
    const t = {
      tests: [
        {
          steps: [
            { stepId: "a", runShell: "node -e \"process.exit(0)\"" },
            {
              stepId: "b",
              runShell: bCmd,
              onFail: [{ goToStep: "a" }],
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-gotostep-backward.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(t, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      const aReports = steps.filter((s) => s.stepId === "a");
      assert.ok(aReports.length >= 2, `expected a to run >=2 times, got ${aReports.length}`);
      // First visit of a omits `visit`; the 2nd visit records visit===2.
      assert.equal(aReports[0].visit, undefined);
      assert.equal(aReports[1].visit, 2);
      // The final visit of b PASSes, but b's first (recorded) visit FAILed —
      // flow != verdict: the recorded FAIL keeps the test FAILed.
      const bReports = steps.filter((s) => s.stepId === "b");
      assert.equal(bReports[0].result, "FAIL");
      assert.equal(bReports[bReports.length - 1].result, "PASS");
      assert.equal(result.specs[0].tests[0].result, "FAIL");
    } finally {
      fs.unlinkSync(tempFilePath);
      if (fs.existsSync(counterFile)) fs.unlinkSync(counterFile);
    }
  });

  it("goToStep unknown target -> remaining steps SKIPPED with a 'does not exist' reason (no hang)", async () => {
    // Step a routes goToStep to a nonexistent stepId -> fail-safe stop. Step b
    // is SKIPPED with the unknown-target reason. Verdict rolls up FAIL.
    const t = {
      tests: [
        {
          steps: [
            {
              stepId: "a",
              runShell: "node -e \"process.exit(0)\"",
              onPass: [{ goToStep: "nope" }],
            },
            { stepId: "b", runShell: "node -e \"process.exit(0)\"" },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-gotostep-unknown.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(t, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      assert.equal(steps.length, 2);
      assert.equal(steps[0].result, "PASS");
      assert.equal(steps[1].result, "SKIPPED");
      assert.match(steps[1].resultDescription, /does not exist/);
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("goToStep infinite loop is bounded by the visit cap (terminates)", async () => {
    // A single step that unconditionally jumps to itself. The fail-safe cap
    // (steps.length * 1000 + 1000 = 2000 for one step) stops it rather than
    // hanging; the last produced report is SKIPPED with the loop reason.
    const t = {
      tests: [
        {
          steps: [
            {
              // `wait: 1` (1ms, no process spawn) keeps the 2000-visit cap test
              // fast — a per-visit `runShell` would spawn 2000 node processes.
              stepId: "s",
              wait: 1,
              onPass: [{ goToStep: "s" }],
            },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-gotostep-loop.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(t, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      // The cap (steps.length * 1000 + 1000 = 2000 for one step) bounds the
      // executed visits. The cap-exceed check breaks at the top of the next
      // iteration BEFORE running/reporting, so exactly MAX_TOTAL_VISITS reports
      // are produced (no extra SKIPPED report) — the point is that it
      // terminates rather than hanging.
      assert.equal(steps.length, 2000);
      assert.ok(
        steps.every((s) => s.result === "PASS"),
        "every executed visit PASSes"
      );
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });

  it("onSkip goToStep jumps from a guard-`if`-false step", async () => {
    // Step a is guard-skipped and its onSkip routes goToStep "c" -> step b is
    // never run; step c runs and PASSes.
    const t = {
      tests: [
        {
          steps: [
            {
              stepId: "a",
              if: "$$platform == nonexistentos", // always false -> SKIPPED
              runShell: "node -e \"process.exit(0)\"",
              onSkip: [{ goToStep: "c" }],
            },
            { stepId: "b", runShell: "node -e \"process.exit(0)\"" },
            { stepId: "c", runShell: "node -e \"process.exit(0)\"" },
          ],
        },
      ],
    };
    const tempFilePath = path.resolve("./test/temp-routing-gotostep-onskip.json");
    fs.writeFileSync(tempFilePath, JSON.stringify(t, null, 2));
    const config = { input: tempFilePath, logLevel: "debug" };
    let result;
    try {
      result = await runTests(config);
      assert.equal(result.summary.specs.fail, 0);
      const steps = result.specs[0].tests[0].contexts[0].steps;
      // a (SKIPPED, guard) then c (PASS) — b jumped over.
      assert.equal(steps.length, 2);
      assert.equal(steps[0].stepId, "a");
      assert.equal(steps[0].result, "SKIPPED");
      assert.match(steps[0].resultDescription, /guard `if` condition not met/);
      assert.equal(steps[1].stepId, "c");
      assert.equal(steps[1].result, "PASS");
    } finally {
      fs.unlinkSync(tempFilePath);
    }
  });
});
