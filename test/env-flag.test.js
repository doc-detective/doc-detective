// ADR 01165: one boolean grammar for every DOC_DETECTIVE_* variable.
import { expect } from "chai";
import {
  checkEnvAliases,
  envFlag,
  isDebugRequested,
  resetEnvFlagWarnings,
  setEnvWarningSink,
} from "../dist/envFlag.js";

describe("envFlag", function () {
  let printed;
  beforeEach(function () {
    resetEnvFlagWarnings();
    printed = [];
    setEnvWarningSink((message) => printed.push(message));
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
      'Ignoring DOC_DETECTIVE_REUSE_APPIUM="maybe". Use 1, true, yes, or on, or 0, false, no, or off.',
    ]);
  });

  it("holds warnings until a sink takes them, so the log level applies", function () {
    resetEnvFlagWarnings();
    envFlag("DOC_DETECTIVE_REUSE_APPIUM", { DOC_DETECTIVE_REUSE_APPIUM: "maybe" });
    const later = [];
    setEnvWarningSink((message) => later.push(message));
    expect(later).to.have.lengthOf(1);
  });
});

describe("DOC_DETECTIVE_RUNTIME_DEBUG, the old name of DOC_DETECTIVE_DEBUG", function () {
  let printed;
  beforeEach(function () {
    resetEnvFlagWarnings();
    printed = [];
    setEnvWarningSink((message) => printed.push(message));
  });

  it("reads DOC_DETECTIVE_DEBUG with the shared grammar", function () {
    expect(isDebugRequested({ DOC_DETECTIVE_DEBUG: "on" })).to.equal(true);
    expect(isDebugRequested({ DOC_DETECTIVE_DEBUG: "0" })).to.equal(false);
  });

  it("still turns on debug output, without warning at every read", function () {
    expect(isDebugRequested({ DOC_DETECTIVE_RUNTIME_DEBUG: "1" })).to.equal(true);
    expect(printed).to.deep.equal([]);
  });

  it("says it's deprecated once, from config setup, when it's on", function () {
    checkEnvAliases({ DOC_DETECTIVE_RUNTIME_DEBUG: "1" });
    checkEnvAliases({ DOC_DETECTIVE_RUNTIME_DEBUG: "1" });
    expect(printed).to.deep.equal([
      "`DOC_DETECTIVE_RUNTIME_DEBUG` is deprecated. Rename it to `DOC_DETECTIVE_DEBUG`.",
    ]);
  });

  it("says nothing when it's off", function () {
    checkEnvAliases({ DOC_DETECTIVE_RUNTIME_DEBUG: "0" });
    expect(printed).to.deep.equal([]);
  });

  it("can't be set alongside DOC_DETECTIVE_DEBUG", function () {
    for (const env of [
      { DOC_DETECTIVE_DEBUG: "1", DOC_DETECTIVE_RUNTIME_DEBUG: "1" },
      { DOC_DETECTIVE_DEBUG: "0", DOC_DETECTIVE_RUNTIME_DEBUG: "1" },
    ]) {
      expect(() => checkEnvAliases(env)).to.throw(
        "set `DOC_DETECTIVE_DEBUG` or `DOC_DETECTIVE_RUNTIME_DEBUG`, not both."
      );
    }
  });
});
