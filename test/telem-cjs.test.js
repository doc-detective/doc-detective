// Telemetry through the CommonJS build (dist/index.cjs). The bundle runs every
// module from dist/, so a lookup relative to the source file's own folder
// (dist/core/ in the ESM build) lands one level too high. Offline: PostHog's
// capture and shutdown are stubbed on the same CommonJS module the bundle loads.

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import sinon from "sinon";

const require = createRequire(import.meta.url);

describe("telemetry from the CommonJS build", function () {
  this.timeout(30000);

  let tmpDir;
  afterEach(function () {
    sinon.restore();
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("sends doc-detective's version when loaded with require()", async function () {
    const { PostHog } = require("posthog-node");
    const capture = sinon.stub(PostHog.prototype, "capture");
    sinon.stub(PostHog.prototype, "shutdown").resolves();

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-telem-cjs-"));
    const specPath = path.join(tmpDir, "test.spec.json");
    fs.writeFileSync(specPath, JSON.stringify({ tests: [{ steps: [{ wait: 1 }] }] }));

    // The package's own `require` export, as a CommonJS consumer gets it.
    const { runTests } = require("doc-detective");
    sinon.stub(console, "log"); // a dry run prints the resolved tests
    await runTests({
      input: [specPath],
      output: tmpDir,
      logLevel: "silent",
      dryRun: true,
      telemetry: { send: true },
    });
    console.log.restore();

    assert.equal(capture.callCount, 1);
    assert.equal(
      capture.firstCall.args[0].properties.core_version,
      require("../package.json").version
    );
  });
});
