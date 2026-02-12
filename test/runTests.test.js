import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnCommand } from "../dist/utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(`${artifactPath}/testResults.json`);

describe("Run tests successfully", function () {
  // Set indefinite timeout
  this.timeout(0);
  it("All specs pass", async () => {
    await spawnCommand(
      `node ./bin/doc-detective.js -c ${artifactPath}/config.json -i ${artifactPath} -o ${outputFile}`
    );
    // Wait until the file is written
    while (!fs.existsSync(outputFile)) {}
    const result = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    console.log(JSON.stringify(result, null, 2));
    fs.unlinkSync(outputFile);
    assert.equal(result.summary.specs.fail, 0);
  });
});
