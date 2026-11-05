import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

// ADR 01152: the public API is exactly these. Adding one is a commitment.
const PUBLIC_API = ["getRunner", "runTests"];
const require = createRequire(import.meta.url);

describe("doc-detective exports", function () {
  it("exports exactly the public API from ESM", async function () {
    const esm = await import("../dist/index.js");
    assert.deepEqual(Object.keys(esm).filter((key) => key !== "default").sort(), PUBLIC_API);
    for (const name of PUBLIC_API) assert.equal(typeof esm[name], "function");
  });

  it("exports exactly the public API from CommonJS", function () {
    const cjs = require("../dist/index.cjs");
    assert.deepEqual(Object.keys(cjs).filter((key) => key !== "default").sort(), PUBLIC_API);
    for (const name of PUBLIC_API) assert.equal(typeof cjs[name], "function");
  });

  it("only exposes the package root", function () {
    const manifest = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    assert.deepEqual(Object.keys(manifest.exports), ["."]);
    assert.equal(manifest.bin["doc-detective"], "bin/doc-detective.js");
  });
});
