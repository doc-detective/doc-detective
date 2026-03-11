import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import assert from "node:assert/strict";
import { parseTests } from "../dist/core/detectTests.js";

const tmpDir = os.tmpdir();

function writeTempFile(name, content) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function cleanupFile(filePath) {
  try { fs.unlinkSync(filePath); } catch {}
}

describe("Spec file step location tracking", function () {
  this.timeout(30000);

  const minimalConfig = { logLevel: "silent" };

  describe("JSON spec files", function () {
    it("should attach location to steps in a JSON spec file", async function () {
      const content = JSON.stringify({
        tests: [
          {
            steps: [
              { goTo: "https://example.com" },
              { find: "hello" },
            ],
          },
        ],
      }, null, 2);
      const filePath = writeTempFile("test-location.json", content);
      try {
        const specs = await parseTests({ config: minimalConfig, files: [filePath] });
        assert.equal(specs.length, 1);
        const steps = specs[0].tests[0].steps;
        assert.equal(steps.length, 2);

        // Step 0 should have location
        assert.ok(steps[0].location, "Step 0 should have location");
        assert.equal(typeof steps[0].location.line, "number");
        assert.equal(typeof steps[0].location.startIndex, "number");
        assert.equal(typeof steps[0].location.endIndex, "number");
        assert.ok(steps[0].location.line >= 1, "Line should be >= 1");

        // Step 1 should have location with a later line
        assert.ok(steps[1].location, "Step 1 should have location");
        assert.ok(steps[1].location.line > steps[0].location.line, "Step 1 should be on a later line than step 0");
        assert.ok(steps[1].location.startIndex > steps[0].location.startIndex, "Step 1 startIndex should be after step 0");
      } finally {
        cleanupFile(filePath);
      }
    });

    it("should have correct startIndex and endIndex (exclusive) for JSON", async function () {
      const content = JSON.stringify({
        tests: [
          {
            steps: [
              { goTo: "https://example.com" },
            ],
          },
        ],
      }, null, 2);
      const filePath = writeTempFile("test-location-idx.json", content);
      try {
        const specs = await parseTests({ config: minimalConfig, files: [filePath] });
        const step = specs[0].tests[0].steps[0];
        // The substring of the raw content at [startIndex, endIndex) should contain the step's key
        const extracted = content.substring(step.location.startIndex, step.location.endIndex);
        assert.ok(extracted.includes("goTo"), `Extracted text should contain 'goTo': ${extracted}`);
      } finally {
        cleanupFile(filePath);
      }
    });

    it("should have correct line numbers for JSON", async function () {
      const content = JSON.stringify({
        tests: [
          {
            steps: [
              { goTo: "https://example.com" },
            ],
          },
        ],
      }, null, 2);
      const filePath = writeTempFile("test-location-line.json", content);
      try {
        const specs = await parseTests({ config: minimalConfig, files: [filePath] });
        const step = specs[0].tests[0].steps[0];
        // Count the actual line by finding the step text in the content
        const beforeStep = content.substring(0, step.location.startIndex);
        const expectedLine = beforeStep.split("\n").length;
        assert.equal(step.location.line, expectedLine);
      } finally {
        cleanupFile(filePath);
      }
    });
  });

  describe("YAML spec files", function () {
    it("should attach location to steps in a YAML spec file", async function () {
      const content = `tests:
  - steps:
      - goTo: https://example.com
      - find: hello
`;
      const filePath = writeTempFile("test-location.yaml", content);
      try {
        const specs = await parseTests({ config: minimalConfig, files: [filePath] });
        assert.equal(specs.length, 1);
        const steps = specs[0].tests[0].steps;
        assert.equal(steps.length, 2);

        assert.ok(steps[0].location, "Step 0 should have location");
        assert.equal(typeof steps[0].location.line, "number");
        assert.ok(steps[0].location.line >= 1);

        assert.ok(steps[1].location, "Step 1 should have location");
        assert.ok(steps[1].location.line > steps[0].location.line);
      } finally {
        cleanupFile(filePath);
      }
    });

    it("should have correct startIndex and endIndex (exclusive) for YAML", async function () {
      const content = `tests:
  - steps:
      - goTo: https://example.com
`;
      const filePath = writeTempFile("test-location-idx.yaml", content);
      try {
        const specs = await parseTests({ config: minimalConfig, files: [filePath] });
        const step = specs[0].tests[0].steps[0];
        const extracted = content.substring(step.location.startIndex, step.location.endIndex);
        assert.ok(extracted.includes("goTo"), `Extracted text should contain 'goTo': ${extracted}`);
      } finally {
        cleanupFile(filePath);
      }
    });
  });

  describe("Multiple tests with steps", function () {
    it("should track location across multiple tests in a spec", async function () {
      const content = JSON.stringify({
        tests: [
          { steps: [{ goTo: "https://first.com" }] },
          { steps: [{ find: "second" }] },
        ],
      }, null, 2);
      const filePath = writeTempFile("test-location-multi.json", content);
      try {
        const specs = await parseTests({ config: minimalConfig, files: [filePath] });
        assert.equal(specs.length, 1);
        const test0Step = specs[0].tests[0].steps[0];
        const test1Step = specs[0].tests[1].steps[0];

        assert.ok(test0Step.location, "Test 0 step should have location");
        assert.ok(test1Step.location, "Test 1 step should have location");
        assert.ok(test1Step.location.startIndex > test0Step.location.startIndex,
          "Test 1 step should be after test 0 step in the file");
      } finally {
        cleanupFile(filePath);
      }
    });
  });
});
