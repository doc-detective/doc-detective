import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnCommand } from "../dist/utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.resolve(__dirname, "./artifacts");
const specFile = path.resolve(artifactPath, "checkLink-statusCodes.spec.json");
const outputFile = path.resolve(
  artifactPath,
  "checkLink-statusCodes.results.json"
);

describe("checkLink with explicitly accepted status code (regression)", function () {
  this.timeout(120000);
  it("treats a 429 as PASS when 429 is in statusCodes", async () => {
    if (fs.existsSync(outputFile)) fs.unlinkSync(outputFile);
    await spawnCommand(
      `node ./bin/doc-detective.js -c ${artifactPath}/config.json -i ${specFile} -o ${outputFile}`
    );
    let waitCount = 0;
    while (!fs.existsSync(outputFile) && waitCount < 120) {
      await new Promise((r) => setTimeout(r, 1000));
      waitCount++;
    }
    assert.ok(fs.existsSync(outputFile), "Output file not written");
    const result = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    fs.unlinkSync(outputFile);

    assert.equal(result.summary.specs.fail, 0, "Spec failed");
    assert.equal(result.summary.steps.fail, 0, "At least one step failed");
    assert.ok(
      result.summary.steps.pass >= 3,
      "Expected all three checkLink steps to pass"
    );

    const steps = result.specs[0].tests[0].contexts[0].steps;
    assert.equal(steps.length, 3, "Expected 3 steps in the spec");
    for (const step of steps) {
      assert.equal(
        step.result,
        "PASS",
        `Step failed: ${step.resultDescription}`
      );
      assert.match(step.resultDescription, /429/);
    }
  });
});
