import { getRunOutputDir } from "../dist/core/utils.js";
import { resolveTests, detectTests } from "../dist/core/index.js";
import { generateSpecId } from "../dist/core/detectTests.js";
import { resolveAutoScreenshot } from "../dist/core/tests.js";
import { reporters } from "../dist/utils.js";
import { buildHtml } from "../dist/reporters/htmlReporter.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("getRunOutputDir", function () {
  let tempBase;

  beforeEach(function () {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "dd-run-artifacts-"));
  });

  afterEach(function () {
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  // run folder uses the same ISO instant token as the debug dump's filenames.
  const RUN_ID_RE = /^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z$/;

  it("creates a .doc-detective/run-<runId> folder under config.output", function () {
    const config = { output: tempBase };
    const dir = getRunOutputDir(config);
    expect(path.dirname(dir)).to.equal(
      path.resolve(tempBase, ".doc-detective")
    );
    expect(path.basename(dir)).to.match(RUN_ID_RE);
    expect(fs.existsSync(dir)).to.equal(true);
  });

  it("memoizes the run folder on the config object", function () {
    const config = { output: tempBase };
    const first = getRunOutputDir(config);
    const second = getRunOutputDir(config);
    expect(second).to.equal(first);
  });

  it("suffixes the folder when a same-instant run already created it", function () {
    const stamp = "2026-06-12T12-00-00-000Z";
    const first = getRunOutputDir({ output: tempBase, __runTimestamp: stamp });
    const second = getRunOutputDir({ output: tempBase, __runTimestamp: stamp });
    expect(path.basename(first)).to.equal(`run-${stamp}`);
    expect(path.basename(second)).to.equal(`run-${stamp}-2`);
  });

  it("creates the run folder next to a report-file output path", function () {
    const config = { output: path.join(tempBase, "results.json") };
    const dir = getRunOutputDir(config);
    expect(path.dirname(dir)).to.equal(
      path.resolve(tempBase, ".doc-detective")
    );
  });

  it("coerces a non-string output instead of throwing", function () {
    // A programmatic caller could hand a PathLike; the extension check and
    // path ops assume a string, so it must be coerced defensively.
    const config = { output: { toString: () => tempBase } };
    const dir = getRunOutputDir(config);
    expect(path.dirname(dir)).to.equal(
      path.resolve(tempBase, ".doc-detective")
    );
    expect(fs.existsSync(dir)).to.equal(true);
  });
});

describe("runFolder reporter", function () {
  let tempBase;

  beforeEach(function () {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "dd-run-folder-"));
  });

  afterEach(function () {
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  it("writes testResults.json into the run folder stamped on the results", async function () {
    const runDir = path.join(tempBase, ".doc-detective", "run-20260612-130000");
    // runSpecs creates the run folder before the reporter runs; the reporter's
    // confinement check resolves real paths, so the folder must exist on disk.
    fs.mkdirSync(runDir, { recursive: true });
    const results = { runId: "20260612-130000", runDir, summary: {}, specs: [] };
    const written = await reporters.runFolderReporter({}, tempBase, results, {
      command: "runTests",
    });
    expect(written).to.equal(path.resolve(runDir, "testResults.json"));
    const parsed = JSON.parse(fs.readFileSync(written, "utf8"));
    expect(parsed.runId).to.equal("20260612-130000");
  });

  it("rejects a stamped runDir that symlinks outside the .doc-detective root", async function () {
    // A runDir that lives under .doc-detective/ but is a symlink resolving
    // outside the output tree must not slip past the confinement check.
    const runsRoot = path.resolve(tempBase, ".doc-detective");
    fs.mkdirSync(runsRoot, { recursive: true });
    const outsideTarget = fs.mkdtempSync(path.join(os.tmpdir(), "dd-escape-"));
    const linkPath = path.join(runsRoot, "run-escape");
    let symlinkSupported = true;
    try {
      fs.symlinkSync(outsideTarget, linkPath, "junction");
    } catch {
      // Symlink creation can require privileges on some Windows setups; skip
      // rather than fail the suite where the OS won't allow it.
      symlinkSupported = false;
    }
    if (!symlinkSupported) {
      fs.rmSync(outsideTarget, { recursive: true, force: true });
      this.skip();
      return;
    }
    try {
      const written = await reporters.runFolderReporter(
        {},
        tempBase,
        { runDir: linkPath, summary: {}, specs: [] },
        { command: "runTests" }
      );
      // Wrote into a fresh in-tree folder, not the escaping symlink target.
      expect(fs.realpathSync(path.dirname(written))).to.not.equal(
        fs.realpathSync(outsideTarget)
      );
      expect(fs.readdirSync(outsideTarget)).to.have.lengthOf(0);
    } finally {
      fs.rmSync(outsideTarget, { recursive: true, force: true });
    }
  });

  it("ignores a results.runDir outside the output's .doc-detective root", async function () {
    // Results can originate outside the local process (API runs); a garbled
    // or malicious runDir must not redirect the write outside the output.
    const evilDir = path.join(tempBase, "elsewhere", "run-x");
    const written = await reporters.runFolderReporter(
      {},
      tempBase,
      { runDir: evilDir, summary: {}, specs: [] },
      { command: "runTests" }
    );
    expect(written).to.not.include(path.join("elsewhere", "run-x"));
    expect(
      path.relative(path.resolve(tempBase, ".doc-detective"), written)
    ).to.match(/^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z[\\/]/);
    expect(fs.existsSync(evilDir)).to.equal(false);
  });

  it("derives a run folder from the output path when results carry none", async function () {
    const written = await reporters.runFolderReporter(
      {},
      tempBase,
      { summary: {}, specs: [] },
      { command: "runTests" }
    );
    expect(written).to.match(/testResults\.json$/);
    expect(
      path.relative(path.resolve(tempBase, ".doc-detective"), written)
    ).to.match(/^run-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z[\\/]/);
  });

  it("also writes an HTML report beside the JSON in the run folder", async function () {
    const runDir = path.join(tempBase, ".doc-detective", "run-20260612-140000");
    fs.mkdirSync(runDir, { recursive: true });
    const results = { runId: "20260612-140000", runDir, summary: {}, specs: [] };
    const written = await reporters.runFolderReporter({}, tempBase, results, {
      command: "runTests",
    });
    // Return value stays the JSON path; HTML is a side artifact.
    expect(written).to.equal(path.resolve(runDir, "testResults.json"));
    const htmlFile = path.resolve(runDir, "testResults.html");
    expect(fs.existsSync(htmlFile)).to.equal(true);
    const html = fs.readFileSync(htmlFile, "utf8");
    expect(html).to.include("<!DOCTYPE html>");
    expect(html).to.include("20260612-140000");
  });

  it("names the HTML file to match the command's JSON report type", async function () {
    const runDir = path.join(tempBase, ".doc-detective", "run-20260612-150000");
    fs.mkdirSync(runDir, { recursive: true });
    const results = { runId: "20260612-150000", runDir, summary: {}, specs: [] };
    await reporters.runFolderReporter({}, tempBase, results, {
      command: "runCoverage",
    });
    expect(fs.existsSync(path.resolve(runDir, "coverageResults.json"))).to.equal(
      true
    );
    const htmlFile = path.resolve(runDir, "coverageResults.html");
    expect(fs.existsSync(htmlFile)).to.equal(true);
    const html = fs.readFileSync(htmlFile, "utf8");
    expect(html).to.include("<!DOCTYPE html>");
    expect(html).to.include("20260612-150000");
  });

  it("writes the HTML beside the JSON when the stamped runDir is rejected", async function () {
    // When the stamped runDir is outside the output tree, both artifacts must
    // land together in the fresh in-tree run folder.
    const evilDir = path.join(tempBase, "elsewhere", "run-x");
    const written = await reporters.runFolderReporter(
      {},
      tempBase,
      { runDir: evilDir, summary: {}, specs: [] },
      { command: "runTests" }
    );
    const htmlFile = path.resolve(path.dirname(written), "testResults.html");
    expect(fs.existsSync(htmlFile)).to.equal(true);
    expect(fs.existsSync(evilDir)).to.equal(false);
  });

  it("exports buildHtml that embeds the report data", function () {
    const html = buildHtml({ runId: "abc123", summary: {}, specs: [] });
    expect(html).to.be.a("string");
    expect(html).to.include("<!DOCTYPE html>");
    expect(html).to.include("abc123");
  });
});

describe("resolveAutoScreenshot precedence", function () {
  it("defers down the chain when levels are unset (test > spec > config)", function () {
    // Config only.
    expect(
      resolveAutoScreenshot({ config: { autoScreenshot: true }, spec: {}, test: {} })
    ).to.equal(true);
    expect(resolveAutoScreenshot({ config: {}, spec: {}, test: {} })).to.equal(
      false
    );
    // Spec overrides config.
    expect(
      resolveAutoScreenshot({
        config: { autoScreenshot: false },
        spec: { autoScreenshot: true },
        test: {},
      })
    ).to.equal(true);
    expect(
      resolveAutoScreenshot({
        config: { autoScreenshot: true },
        spec: { autoScreenshot: false },
        test: {},
      })
    ).to.equal(false);
    // Test overrides spec and config.
    expect(
      resolveAutoScreenshot({
        config: { autoScreenshot: false },
        spec: { autoScreenshot: false },
        test: { autoScreenshot: true },
      })
    ).to.equal(true);
    expect(
      resolveAutoScreenshot({
        config: { autoScreenshot: true },
        spec: { autoScreenshot: true },
        test: { autoScreenshot: false },
      })
    ).to.equal(false);
  });
});

describe("deterministic resolved-test IDs", function () {
  const config = { logLevel: "silent" };

  function makeDetectedSpec() {
    return {
      specId: "docs/example.md",
      contentPath: "docs/example.md",
      tests: [
        {
          steps: [{ goTo: { url: "https://example.com" } }],
        },
        {
          testId: "explicit-test",
          steps: [{ runShell: { command: "echo hi" } }],
        },
      ],
    };
  }

  it("assigns content-hash testIds and stable contextIds", async function () {
    const resolved = await resolveTests({
      config,
      detectedTests: [makeDetectedSpec()],
    });
    const spec = resolved.specs[0];
    expect(spec.specId).to.equal("docs/example.md");
    expect(spec.tests[0].testId).to.match(
      /^docs\/example\.md~[0-9a-f]{8}$/
    );
    expect(spec.tests[1].testId).to.equal("explicit-test");
    expect(spec.tests[0].contexts[0].contextId).to.equal("default");
  });

  it("produces identical IDs across two resolutions of the same input", async function () {
    const first = await resolveTests({
      config,
      detectedTests: [makeDetectedSpec()],
    });
    const second = await resolveTests({
      config,
      detectedTests: [makeDetectedSpec()],
    });
    const ids = (resolved) =>
      resolved.specs.map((spec) => ({
        specId: spec.specId,
        tests: spec.tests.map((test) => ({
          testId: test.testId,
          contextIds: test.contexts.map((context) => context.contextId),
        })),
      }));
    expect(ids(first)).to.deep.equal(ids(second));
  });

  it("generateSpecId does not misclassify sibling paths sharing a cwd prefix", function () {
    // /repo vs /repo-other: a bare startsWith(cwd) check would relativize
    // the sibling into an unstable `../`-laden ID.
    const sibling = `${process.cwd()}-other${path.sep}spec.json`;
    const specId = generateSpecId(sibling);
    expect(specId).to.not.include("..");
    // Inside-cwd paths still relativize.
    expect(generateSpecId(path.join(process.cwd(), "docs", "a.md"))).to.equal(
      "docs/a.md"
    );
  });

  it("derives a specId from contentPath when none is declared", async function () {
    const spec = makeDetectedSpec();
    delete spec.specId;
    spec.contentPath = path.join(process.cwd(), "docs", "example spec.json");
    const resolved = await resolveTests({ config, detectedTests: [spec] });
    expect(resolved.specs[0].specId).to.equal("docs/example_spec.json");
  });

  it("derives contextIds from platform and browser when declared via runOn", async function () {
    const spec = makeDetectedSpec();
    spec.runOn = [{ platforms: ["windows"], browsers: ["chrome"] }];
    const resolved = await resolveTests({ config, detectedTests: [spec] });
    // First test needs a browser → platform-browser context.
    expect(resolved.specs[0].tests[0].contexts[0].contextId).to.equal(
      "windows-chrome"
    );
    // Second test is shell-only → platform-only context.
    expect(resolved.specs[0].tests[1].contexts[0].contextId).to.equal(
      "windows"
    );
  });

  it("suffixes an explicit contextId that expands across platforms/browsers", async function () {
    // One authored context with an explicit contextId + multiple browsers
    // expands into several contexts; they can't all keep the same id or
    // they'd collide in contextId-keyed structures, so 2nd+ get suffixed.
    const spec = makeDetectedSpec();
    spec.runOn = [
      {
        contextId: "my-ctx",
        platforms: ["windows"],
        browsers: ["chrome", "firefox"],
      },
    ];
    const resolved = await resolveTests({ config, detectedTests: [spec] });
    const contextIds = resolved.specs[0].tests[0].contexts.map(
      (context) => context.contextId
    );
    expect(contextIds).to.deep.equal(["my-ctx", "my-ctx-2"]);
  });

  it("suffixes derived contextIds on platform/browser collisions", async function () {
    const spec = makeDetectedSpec();
    spec.runOn = [
      {
        platforms: ["windows"],
        browsers: [
          { name: "chrome", headless: true },
          { name: "chrome", headless: false },
        ],
      },
    ];
    const resolved = await resolveTests({ config, detectedTests: [spec] });
    const contextIds = resolved.specs[0].tests[0].contexts.map(
      (context) => context.contextId
    );
    expect(contextIds).to.deep.equal(["windows-chrome", "windows-chrome-2"]);
  });
});

describe("detected spec/test IDs from files", function () {
  let tempDir;

  beforeEach(function () {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "dd-detect-ids-"));
  });

  afterEach(function () {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("assigns path-derived specIds and hash testIds to JSON spec files", async function () {
    const specPath = path.join(tempDir, "sample.spec.json");
    fs.writeFileSync(
      specPath,
      JSON.stringify({
        tests: [{ steps: [{ runShell: { command: "echo hi" } }] }],
      })
    );
    const config = {
      input: [specPath],
      logLevel: "silent",
      recursive: false,
      fileTypes: [],
      relativePathBase: "file",
    };
    const detectOnce = async () => {
      const specs = await detectTests({ config: { ...config } });
      return specs[0];
    };
    const first = await detectOnce();
    const second = await detectOnce();
    expect(first.specId).to.be.a("string");
    expect(first.specId).to.not.match(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(first.tests[0].testId).to.match(/~[0-9a-f]{8}$/);
    expect(second.specId).to.equal(first.specId);
    expect(second.tests[0].testId).to.equal(first.tests[0].testId);
  });
});
