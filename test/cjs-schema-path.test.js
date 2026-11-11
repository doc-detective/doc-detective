// Config and spec errors through the CommonJS build (dist/index.cjs). The error
// formatter loads the bundled schemas, and a path relative to the source file
// lands one level too high from the bundle, so the caller got "Cannot find
// module" instead of the validation message.

import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

describe("validation errors from the CommonJS build", function () {
  this.timeout(60000);

  it("rejects an invalid config with the validation message", async function () {
    // The package's own `require` export, as a CommonJS consumer gets it.
    const { runTests } = require("doc-detective");
    await assert.rejects(
      runTests({ input: ["missing.spec.json"], bogusKey: true, logLevel: "silent" }),
      (error) => {
        assert.doesNotMatch(error.message, /Cannot find module/);
        assert.match(error.message, /bogusKey/);
        return true;
      }
    );
  });
});
