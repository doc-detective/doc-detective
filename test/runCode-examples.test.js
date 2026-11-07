// Each runCode example in the schema ships to users through the docs and the
// editor, so each must run as written: through the real handler, it PASSes.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { schemas } from "../dist/common/src/schemas/index.js";
import { runCode } from "../dist/core/tests/runCode.js";
import { closeSurface } from "../dist/core/tests/closeSurface.js";

const config = { logLevel: "silent" };
const hasPython = spawnSync("python --version", { shell: true }).status === 0;

describe("runCode schema examples", function () {
  this.timeout(60000);
  let dir;
  before(function () {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-runcode-examples-"));
  });
  after(function () {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  schemas.runCode_v3.examples.forEach((example, i) => {
    it(`example ${i} (${example.language}) PASSes`, async function () {
      if (["python", "py"].includes(example.language) && !hasPython) this.skip();
      // Saved output goes to a scratch folder, not the repo.
      const step = { runCode: example.directory ? { ...example, directory: dir } : example };
      const processRegistry = new Map();
      const result = await runCode({ config, step, processRegistry });
      if (example.background) await closeSurface({ config, step: { closeSurface: example.background.name }, processRegistry });
      assert.equal(result.status, "PASS", result.description);
    });
  });
});
