import assert from "node:assert/strict";

describe("cli/index.js exports", function () {
  let cliExports;

  before(async function () {
    cliExports = await import("../dist/index.js");
  });

  it("should export runTests as a function", function () {
    assert.equal(typeof cliExports.runTests, "function");
  });

  it("should export getRunner as a function", function () {
    assert.equal(typeof cliExports.getRunner, "function");
  });

  it("should export detectTests as a function", function () {
    assert.equal(typeof cliExports.detectTests, "function");
  });

  it("should export detectAndResolveTests as a function", function () {
    assert.equal(typeof cliExports.detectAndResolveTests, "function");
  });

  it("should export resolveTests as a function", function () {
    assert.equal(typeof cliExports.resolveTests, "function");
  });

  it("should export readFile as a function", function () {
    assert.equal(typeof cliExports.readFile, "function");
  });

  it("should export resolvePaths as a function", function () {
    assert.equal(typeof cliExports.resolvePaths, "function");
  });

  it("should export exactly 7 functions", function () {
    const exportKeys = Object.keys(cliExports).filter(k => k !== 'default');
    assert.equal(exportKeys.length, 7);
  });
});
