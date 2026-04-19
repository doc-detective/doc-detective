import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { runTests } from "../dist/core/index.js";

describe("Screenshot sourceIntegration preservation", function () {
  this.timeout(300000); // 5 minutes per test

  const tempDir = path.resolve("./test/temp-screenshot-tests");

  beforeEach(function () {
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  });

  afterEach(function () {
    // Cleanup temp files
    if (fs.existsSync(tempDir)) {
      const files = fs.readdirSync(tempDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tempDir, file));
      }
      fs.rmdirSync(tempDir);
    }
  });

  it("preserves sourceIntegration for new screenshots", async function () {
    const screenshotPath = path.join(tempDir, "new-screenshot.png");
    const tempFilePath = path.join(tempDir, "test-spec.json");

    const testSpec = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092",
            },
            {
              screenshot: {
                path: screenshotPath,
                sourceIntegration: {
                  type: "heretto",
                  integrationName: "test-integration",
                  filePath: "new-screenshot.png",
                  contentPath: "/content/topic.dita",
                },
              },
            },
          ],
        },
      ],
    };

    try {
      fs.writeFileSync(tempFilePath, JSON.stringify(testSpec, null, 2));

      const result = await runTests({ input: tempFilePath, logLevel: "silent" });

      // Find the screenshot step
      const screenshotStep = result.specs[0].tests[0].contexts[0].steps[1];

      // Verify sourceIntegration is preserved
      assert.ok(screenshotStep.outputs.sourceIntegration, "sourceIntegration should be present");
      assert.equal(screenshotStep.outputs.sourceIntegration.type, "heretto");
      assert.equal(screenshotStep.outputs.sourceIntegration.integrationName, "test-integration");
      assert.equal(screenshotStep.outputs.sourceIntegration.filePath, "new-screenshot.png");
      assert.equal(screenshotStep.outputs.sourceIntegration.contentPath, "/content/topic.dita");

      // Verify changed is true for new screenshots
      assert.equal(screenshotStep.outputs.changed, true, "changed should be true for new screenshots");
    } finally {
      // Cleanup temp files
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
    }
  });

  it("preserves sourceIntegration when variation exceeds threshold", async function () {
    const screenshotPath = path.join(tempDir, "variation-screenshot.png");
    const initialFilePath = path.join(tempDir, "initial-spec.json");
    const variationFilePath = path.join(tempDir, "variation-spec.json");

    // First, create an initial screenshot
    const initialSpec = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092",
            },
            {
              screenshot: {
                path: screenshotPath,
                maxVariation: 0,
                overwrite: "false",
              },
            },
          ],
        },
      ],
    };

    // Variation spec to trigger warning
    const variationSpec = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092/drag-drop-test.html", // Different page
            },
            {
              screenshot: {
                path: screenshotPath,
                maxVariation: 0,
                overwrite: "aboveVariation",
                sourceIntegration: {
                  type: "heretto",
                  integrationName: "variation-test",
                  filePath: "variation-screenshot.png",
                  contentPath: "/content/variation-topic.dita",
                },
              },
            },
          ],
        },
      ],
    };

    try {
      fs.writeFileSync(initialFilePath, JSON.stringify(initialSpec, null, 2));
      const initialResult = await runTests({ input: initialFilePath, logLevel: "silent" });
      assert.ok(initialResult, "Initial screenshot run should produce a result");
      assert.ok(fs.existsSync(screenshotPath), "Initial screenshot file should have been created");

      // Now run with a different page to trigger variation warning
      fs.writeFileSync(variationFilePath, JSON.stringify(variationSpec, null, 2));

      const result = await runTests({ input: variationFilePath, logLevel: "silent" });

      const screenshotStep = result.specs[0].tests[0].contexts[0].steps[1];

      // Verify the step is a WARNING (variation exceeded)
      assert.equal(screenshotStep.result, "WARNING");

      // Verify sourceIntegration is preserved
      assert.ok(screenshotStep.outputs.sourceIntegration, "sourceIntegration should be present");
      assert.equal(screenshotStep.outputs.sourceIntegration.type, "heretto");
      assert.equal(screenshotStep.outputs.sourceIntegration.integrationName, "variation-test");

      // Verify changed is true
      assert.equal(screenshotStep.outputs.changed, true, "changed should be true when variation exceeds threshold");
    } finally {
      // Cleanup temp files
      if (fs.existsSync(initialFilePath)) fs.unlinkSync(initialFilePath);
      if (fs.existsSync(variationFilePath)) fs.unlinkSync(variationFilePath);
      if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
    }
  });

  it("preserves sourceIntegration when screenshot is within variation", async function () {
    const screenshotPath = path.join(tempDir, "same-screenshot.png");
    const initialFilePath = path.join(tempDir, "initial-spec.json");
    const sameFilePath = path.join(tempDir, "same-spec.json");

    // First, create an initial screenshot
    const initialSpec = {
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

    // Same page spec to test within variation
    const samePageSpec = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092", // Same page
            },
            {
              screenshot: {
                path: screenshotPath,
                maxVariation: 0.95, // High threshold to ensure within variation
                overwrite: "aboveVariation",
                sourceIntegration: {
                  type: "heretto",
                  integrationName: "same-page-test",
                  filePath: "same-screenshot.png",
                  contentPath: "/content/same-topic.dita",
                },
              },
            },
          ],
        },
      ],
    };

    try {
      fs.writeFileSync(initialFilePath, JSON.stringify(initialSpec, null, 2));
      await runTests({ input: initialFilePath, logLevel: "silent" });

      // Now run with the same page (should be within variation)
      fs.writeFileSync(sameFilePath, JSON.stringify(samePageSpec, null, 2));

      const result = await runTests({ input: sameFilePath, logLevel: "silent" });

      const screenshotStep = result.specs[0].tests[0].contexts[0].steps[1];

      // Verify the step passed (within variation)
      assert.equal(screenshotStep.result, "PASS");

      // Verify sourceIntegration is preserved
      assert.ok(screenshotStep.outputs.sourceIntegration, "sourceIntegration should be present");
      assert.equal(screenshotStep.outputs.sourceIntegration.type, "heretto");
      assert.equal(screenshotStep.outputs.sourceIntegration.integrationName, "same-page-test");

      // Verify changed is false (within variation, no update)
      assert.equal(screenshotStep.outputs.changed, false, "changed should be false when within variation");
    } finally {
      // Cleanup temp files
      if (fs.existsSync(initialFilePath)) fs.unlinkSync(initialFilePath);
      if (fs.existsSync(sameFilePath)) fs.unlinkSync(sameFilePath);
      if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
    }
  });

  it("does not set sourceIntegration when not provided", async function () {
    const screenshotPath = path.join(tempDir, "no-integration-screenshot.png");
    const tempFilePath = path.join(tempDir, "test-spec.json");

    const testSpec = {
      tests: [
        {
          steps: [
            {
              goTo: "http://localhost:8092",
            },
            {
              screenshot: {
                path: screenshotPath,
              },
            },
          ],
        },
      ],
    };

    try {
      fs.writeFileSync(tempFilePath, JSON.stringify(testSpec, null, 2));

      const result = await runTests({ input: tempFilePath, logLevel: "silent" });

      const screenshotStep = result.specs[0].tests[0].contexts[0].steps[1];

      // Verify sourceIntegration is NOT set
      assert.equal(screenshotStep.outputs.sourceIntegration, undefined, "sourceIntegration should not be set when not provided");
    } finally {
      // Cleanup temp files
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      if (fs.existsSync(screenshotPath)) fs.unlinkSync(screenshotPath);
    }
  });
});

describe("Screenshot with URL `path` (remote reference)", function () {
  this.timeout(300000);

  const tempDir = path.resolve("./test/temp-screenshot-url-tests");
  const publicDir = path.resolve("./test/server/public");
  const referenceFixture = path.join(publicDir, "url-reference-fixture.png");
  const notAPngFixture = path.join(publicDir, "not-a-real.png");
  const runsDir = path.resolve("./doc-detective-runs");
  const url = "http://localhost:8092/url-reference-fixture.png";

  // Seed the fixture by taking a real screenshot of the test page, then copy
  // it into the static-served dir so the URL and a subsequent local capture
  // share dimensions / aspect ratio.
  before(async function () {
    this.timeout(300000);
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    const seedShot = path.join(tempDir, "seed-screenshot.png");
    const seedSpecPath = path.join(tempDir, "seed-spec.json");
    fs.writeFileSync(
      seedSpecPath,
      JSON.stringify({
        tests: [
          {
            steps: [
              { goTo: "http://localhost:8092" },
              { screenshot: { path: seedShot, overwrite: "true" } },
            ],
          },
        ],
      })
    );
    await runTests({ input: seedSpecPath, logLevel: "silent" });
    assert.ok(fs.existsSync(seedShot), "seed screenshot must have been captured");
    fs.copyFileSync(seedShot, referenceFixture);
    // A fixture served under a .png URL but whose bytes are clearly not a PNG,
    // used to verify PNG.sync.read failures turn into a clean step FAIL.
    fs.writeFileSync(notAPngFixture, "<!DOCTYPE html><p>not a png</p>");
  });

  after(function () {
    if (fs.existsSync(referenceFixture)) fs.unlinkSync(referenceFixture);
    if (fs.existsSync(notAPngFixture)) fs.unlinkSync(notAPngFixture);
    if (fs.existsSync(tempDir)) {
      for (const f of fs.readdirSync(tempDir)) fs.unlinkSync(path.join(tempDir, f));
      fs.rmdirSync(tempDir);
    }
    // Best-effort cleanup of the run-specific folder the feature creates.
    if (fs.existsSync(runsDir)) {
      fs.rmSync(runsDir, { recursive: true, force: true });
    }
  });

  it("fetches the URL reference, writes the new capture to a run-specific local folder, and leaves the remote fixture on disk untouched", async function () {
    const specPath = path.join(tempDir, "url-spec.json");
    const mtimeBefore = fs.statSync(referenceFixture).mtimeMs;

    const spec = {
      tests: [
        {
          steps: [
            { goTo: "http://localhost:8092" },
            {
              screenshot: {
                path: url,
                maxVariation: 0.95,
                overwrite: "aboveVariation",
              },
            },
          ],
        },
      ],
    };
    fs.writeFileSync(specPath, JSON.stringify(spec));

    try {
      const result = await runTests({ input: specPath, logLevel: "silent" });
      const step = result.specs[0].tests[0].contexts[0].steps[1];

      // The step may PASS (within tolerance) or WARNING (exceeded tolerance)
      // depending on page rendering — but it must NEVER FAIL on this path,
      // and the output must point at the local run folder, not the URL.
      assert.ok(
        step.result === "PASS" || step.result === "WARNING",
        `expected PASS or WARNING, got ${step.result}: ${step.resultDescription}`
      );
      assert.equal(step.outputs.referenceUrl, url);
      assert.ok(
        step.outputs.screenshotPath &&
          step.outputs.screenshotPath.includes("doc-detective-runs"),
        `screenshotPath should live under doc-detective-runs/, got ${step.outputs.screenshotPath}`
      );
      assert.ok(
        fs.existsSync(step.outputs.screenshotPath),
        "new capture should exist on disk for inspection"
      );
      // Remote fixture must not have been overwritten.
      assert.equal(
        fs.statSync(referenceFixture).mtimeMs,
        mtimeBefore,
        "served reference file should be untouched"
      );
    } finally {
      if (fs.existsSync(specPath)) fs.unlinkSync(specPath);
    }
  });

  it("ignores overwrite=true for URL paths (never writes back to the remote reference)", async function () {
    const specPath = path.join(tempDir, "url-overwrite-spec.json");
    const bytesBefore = fs.readFileSync(referenceFixture);

    const spec = {
      tests: [
        {
          steps: [
            { goTo: "http://localhost:8092" },
            {
              screenshot: {
                path: url,
                maxVariation: 0.95,
                overwrite: "true", // would normally replace the reference
              },
            },
          ],
        },
      ],
    };
    fs.writeFileSync(specPath, JSON.stringify(spec));

    try {
      const result = await runTests({ input: specPath, logLevel: "silent" });
      const step = result.specs[0].tests[0].contexts[0].steps[1];

      // Strong assertions — without these, a regression that FAILs the step
      // before the overwrite branch would still leave the bytes untouched
      // and silently "pass" this test.
      assert.ok(
        step.result === "PASS" || step.result === "WARNING",
        `expected PASS or WARNING, got ${step.result}: ${step.resultDescription}`
      );
      assert.equal(step.outputs.referenceUrl, url);
      assert.ok(
        step.outputs.screenshotPath &&
          step.outputs.screenshotPath.includes("doc-detective-runs"),
        `screenshotPath should live under doc-detective-runs/, got ${step.outputs.screenshotPath}`
      );

      const bytesAfter = fs.readFileSync(referenceFixture);
      assert.ok(
        bytesBefore.equals(bytesAfter),
        "overwrite=true with URL path must not mutate the remote reference file"
      );
    } finally {
      if (fs.existsSync(specPath)) fs.unlinkSync(specPath);
    }
  });

  it("FAILs gracefully when the URL body is not a valid PNG", async function () {
    const specPath = path.join(tempDir, "url-notpng-spec.json");
    const notPngUrl = "http://localhost:8092/not-a-real.png";

    const spec = {
      tests: [
        {
          steps: [
            { goTo: "http://localhost:8092" },
            { screenshot: { path: notPngUrl, maxVariation: 0.05 } },
          ],
        },
      ],
    };
    fs.writeFileSync(specPath, JSON.stringify(spec));

    try {
      const result = await runTests({ input: specPath, logLevel: "silent" });
      const step = result.specs[0].tests[0].contexts[0].steps[1];
      assert.equal(step.result, "FAIL");
      assert.match(step.resultDescription, /Couldn't decode PNG/);
    } finally {
      if (fs.existsSync(specPath)) fs.unlinkSync(specPath);
    }
  });

  it("contains the new capture inside the run folder even when the URL path tries to traverse out", async function () {
    const specPath = path.join(tempDir, "url-traversal-spec.json");
    // URL-encoded `..%2f` decodes to `../` after URL.pathname → a raw
    // `split("/").pop()` would surface it; our sanitization must neutralize it.
    const traversalUrl =
      "http://localhost:8092/foo/..%2Furl-reference-fixture.png";

    const spec = {
      tests: [
        {
          steps: [
            { goTo: "http://localhost:8092" },
            {
              screenshot: {
                path: traversalUrl,
                maxVariation: 0.95,
                overwrite: "aboveVariation",
              },
            },
          ],
        },
      ],
    };
    fs.writeFileSync(specPath, JSON.stringify(spec));

    try {
      const result = await runTests({ input: specPath, logLevel: "silent" });
      const step = result.specs[0].tests[0].contexts[0].steps[1];

      if (step.result === "FAIL") {
        // Acceptable: sanitization rejected the traversal outright.
        return;
      }
      assert.ok(
        step.outputs.screenshotPath,
        "screenshotPath should be set on non-FAIL outcomes"
      );
      const resolvedOut = path.resolve(step.outputs.screenshotPath);
      const resolvedRunsDir = path.resolve(runsDir);
      assert.ok(
        resolvedOut.startsWith(resolvedRunsDir + path.sep),
        `screenshot must live under ${resolvedRunsDir}; got ${resolvedOut}`
      );
    } finally {
      if (fs.existsSync(specPath)) fs.unlinkSync(specPath);
    }
  });

  it("FAILs the step with a clear message when the URL can't be fetched", async function () {
    const specPath = path.join(tempDir, "url-404-spec.json");
    const missingUrl = "http://localhost:8092/does-not-exist.png";

    const spec = {
      tests: [
        {
          steps: [
            { goTo: "http://localhost:8092" },
            { screenshot: { path: missingUrl, maxVariation: 0.05 } },
          ],
        },
      ],
    };
    fs.writeFileSync(specPath, JSON.stringify(spec));

    try {
      const result = await runTests({ input: specPath, logLevel: "silent" });
      const step = result.specs[0].tests[0].contexts[0].steps[1];
      assert.equal(step.result, "FAIL");
      assert.match(step.resultDescription, /Couldn't fetch remote reference image/);
    } finally {
      if (fs.existsSync(specPath)) fs.unlinkSync(specPath);
    }
  });
});
