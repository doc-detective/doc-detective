import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnCommand } from "../dist/utils.js";
import assert from "node:assert/strict";
import fs from "node:fs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.resolve(__dirname, "./artifacts");
const outputFile = path.resolve(`${artifactPath}/testResults.json`);

describe("Run tests successfully", function () {
  // 10 minutes (runs all specs end-to-end via CLI)
  this.timeout(600000);
  it("All specs pass", async () => {
    await spawnCommand(
      `node ./bin/doc-detective.js -c ${artifactPath}/config.json -i ${artifactPath} -o ${outputFile}`
    );
    // Wait until the file is written (poll with async sleep to avoid blocking the event loop)
    let waitCount = 0;
    while (!fs.existsSync(outputFile) && waitCount < 600) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      waitCount++;
    }
    if (!fs.existsSync(outputFile)) {
      assert.fail("Output file was not created within the expected time");
    }
    const result = JSON.parse(fs.readFileSync(outputFile, "utf8"));
    console.log(JSON.stringify(result, null, 2));
    fs.unlinkSync(outputFile);
    assert.equal(result.summary.specs.fail, 0);
  });
});
