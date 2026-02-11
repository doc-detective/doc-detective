const { runTests } = require("../src/core");

async function testEnhancedElementFinding() {
  console.log("Testing enhanced element finding...\n");

  const config = {
    input: "./test/core-artifacts/enhanced-element-finding.spec.json",
    logLevel: "info",
    runTests: {
      contexts: [
        {
          app: { name: "firefox", options: { headless: true } },
          platforms: ["linux"]
        }
      ]
    }
  };

  try {
    const result = await runTests(config);

    console.log("\n========== TEST RESULTS ==========");
    console.log("Specs - Pass:", result.summary.specs.pass, "Fail:", result.summary.specs.fail, "Skipped:", result.summary.specs.skipped);
    console.log("Tests - Pass:", result.summary.tests.pass, "Fail:", result.summary.tests.fail, "Skipped:", result.summary.tests.skipped);
    console.log("Steps - Pass:", result.summary.steps.pass, "Fail:", result.summary.steps.fail, "Skipped:", result.summary.steps.skipped);
    console.log("==================================\n");

    if (result.summary.specs.fail > 0 || result.summary.tests.fail > 0) {
      console.log("FAILED TESTS:");
      result.specs.forEach(spec => {
        spec.tests.forEach(test => {
          if (test.status === "FAIL") {
            console.log(`\n- Test: ${test.testId}`);
            test.contexts.forEach(context => {
              context.steps.forEach((step, idx) => {
                if (step.status === "FAIL") {
                  console.log(`  Step ${idx + 1}: ${step.status} - ${step.description}`);
                }
              });
            });
          }
        });
      });
    }

    process.exit(result.summary.specs.fail > 0 || result.summary.tests.fail > 0 ? 1 : 0);
  } catch (error) {
    console.error("Error running tests:", error);
    process.exit(1);
  }
}

testEnhancedElementFinding();
