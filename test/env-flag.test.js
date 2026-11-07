// ADR 01165: one boolean grammar for every DOC_DETECTIVE_* variable.
import { expect } from "chai";
import { envFlag, isDebugRequested } from "../dist/envFlag.js";

describe("envFlag", function () {
  let printed;
  let original;
  beforeEach(function () {
    printed = [];
    original = console.error;
    console.error = (line) => printed.push(line);
  });
  afterEach(function () {
    console.error = original;
  });

  const table = [
    ["1", true],
    ["TRUE", true],
    [" yes ", true],
    ["on", true],
    ["0", false],
    ["false", false],
    ["No", false],
    ["off", false],
    ["", false],
    [undefined, false],
  ];
  for (const [value, expected] of table) {
    it(`reads ${JSON.stringify(value)} as ${expected}`, function () {
      expect(envFlag("DOC_DETECTIVE_TEST_FLAG", { DOC_DETECTIVE_TEST_FLAG: value })).to.equal(expected);
      expect(printed).to.deep.equal([]);
    });
  }

  it("treats anything else as off, and warns once", function () {
    const env = { DOC_DETECTIVE_REUSE_APPIUM: "maybe" };
    expect(envFlag("DOC_DETECTIVE_REUSE_APPIUM", env)).to.equal(false);
    expect(envFlag("DOC_DETECTIVE_REUSE_APPIUM", env)).to.equal(false);
    expect(printed).to.deep.equal([
      'Warning: Ignoring DOC_DETECTIVE_REUSE_APPIUM="maybe". Use 1, true, yes, or on, or 0, false, no, or off.',
    ]);
  });
});

describe("isDebugRequested", function () {
  let printed;
  let original;
  beforeEach(function () {
    printed = [];
    original = console.error;
    console.error = (line) => printed.push(line);
  });
  afterEach(function () {
    console.error = original;
  });

  it("reads DOC_DETECTIVE_DEBUG with the shared grammar", function () {
    expect(isDebugRequested({ DOC_DETECTIVE_DEBUG: "on" })).to.equal(true);
    expect(isDebugRequested({ DOC_DETECTIVE_DEBUG: "0" })).to.equal(false);
  });

  it("still reads DOC_DETECTIVE_RUNTIME_DEBUG, and says it's deprecated", function () {
    expect(isDebugRequested({ DOC_DETECTIVE_RUNTIME_DEBUG: "1" })).to.equal(true);
    expect(printed).to.deep.equal([
      "Warning: `DOC_DETECTIVE_RUNTIME_DEBUG` is deprecated. Rename it to `DOC_DETECTIVE_DEBUG`.",
    ]);
  });
});
