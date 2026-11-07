// ADR 01165: one boolean grammar for every DOC_DETECTIVE_* variable.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
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

  it("can sit beside DOC_DETECTIVE_DEBUG when both are off", function () {
    expect(() => checkEnvAliases({ DOC_DETECTIVE_DEBUG: "0", DOC_DETECTIVE_RUNTIME_DEBUG: "0" })).to.not.throw();
  });

  it("can't be set alongside DOC_DETECTIVE_DEBUG when either is on, and says which is on", function () {
    const both = "set `DOC_DETECTIVE_DEBUG` or `DOC_DETECTIVE_RUNTIME_DEBUG`, not both.";
    for (const [env, on] of [
      [{ DOC_DETECTIVE_DEBUG: "1", DOC_DETECTIVE_RUNTIME_DEBUG: "1" }, "Both are on."],
      [{ DOC_DETECTIVE_DEBUG: "0", DOC_DETECTIVE_RUNTIME_DEBUG: "1" }, "`DOC_DETECTIVE_RUNTIME_DEBUG` is on."],
      [{ DOC_DETECTIVE_DEBUG: "1", DOC_DETECTIVE_RUNTIME_DEBUG: "0" }, "`DOC_DETECTIVE_DEBUG` is on."],
    ]) {
      expect(() => checkEnvAliases(env)).to.throw(`${both} ${on}`);
    }
  });
});

describe("importing the runtime modules", function () {
  this.timeout(30000);
  // A fresh process, so no earlier import already read the environment.
  it("reads no environment flag, so it queues no warning", function () {
    const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist");
    const url = (file) => pathToFileURL(path.join(dist, file)).href;
    const script = [
      ...["runtime/browsers.js", "runtime/installer.js", "runtime/loader.js", "runtime/selfUpdate.js"].map(
        (file) => `await import(${JSON.stringify(url(file))});`
      ),
      `const { setEnvWarningSink } = await import(${JSON.stringify(url("envFlag.js"))});`,
      "const queued = [];",
      "setEnvWarningSink((message) => queued.push(message));",
      "process.stdout.write(JSON.stringify(queued));",
    ].join("\n");
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      env: { ...process.env, DOC_DETECTIVE_DEBUG: "maybe" },
    });
    expect(r.status, r.stderr).to.equal(0);
    expect(JSON.parse(r.stdout)).to.deep.equal([]);
  });
});

describe("repeated runTests calls in one process", function () {
  afterEach(() => resetEnvFlagWarnings());

  it("don't pile up warnings an earlier run queued and never sent", async function () {
    const { setConfig } = await import("../dist/core/config.js");
    resetEnvFlagWarnings();
    // Each run queues a warning, then fails validation before it has a sink.
    for (const name of ["DOC_DETECTIVE_TEST_ONE", "DOC_DETECTIVE_TEST_TWO"]) {
      envFlag(name, { [name]: "maybe" });
      await setConfig({ config: { logLevel: "silent", notAKey: true } }).catch(() => {});
    }
    const flushed = [];
    setEnvWarningSink((message) => flushed.push(message));
    expect(flushed).to.deep.equal([]);
  });
});
