import { getRunOutputDir, runArchivesArtifacts } from "../dist/core/utils.js";
import { resolveTests, detectTests } from "../dist/core/index.js";
import { generateSpecId } from "../dist/core/detectTests.js";
import {
  resolveAutoScreenshot,
  resolveAutoRecord,
  buildAutoRecordStep,
  runSpecs,
} from "../dist/core/tests.js";
import { getEnvironment } from "../dist/core/config.js";
import { reporters } from "../dist/utils.js";
import { buildHtml } from "../dist/reporters/htmlReporter.js";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

// Run folder uses the same ISO instant token as the debug dump's filenames.
// REST layout: the run id is the folder name directly under `.doc-detective/runs/`
// (no `run-` prefix). The optional `-<n>` tail covers the ordinal suffix
// getRunOutputDir appends on a same-millisecond collision (`<id>-2`, `<id>-3`,
// …), so directory-scan assertions still match a collided run folder.
// Module-scoped so every describe block can share it.
const RUN_ID_RE = /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-\d+)?$/;

describe("getRunOutputDir", function () {
  let tempBase;

  beforeEach(function () {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "dd-run-artifacts-"));
  });

  afterEach(function () {
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  it("creates a .doc-detective/runs/<runId> folder under config.output", function () {
    const config = { output: tempBase };
    const dir = getRunOutputDir(config);
    expect(path.dirname(dir)).to.equal(
      path.resolve(tempBase, ".doc-detective", "runs")
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
    expect(path.basename(first)).to.equal(stamp);
    expect(path.basename(second)).to.equal(`${stamp}-2`);
  });

  it("creates the run folder next to a report-file output path", function () {
    const config = { output: path.join(tempBase, "results.json") };
    const dir = getRunOutputDir(config);
    expect(path.dirname(dir)).to.equal(
      path.resolve(tempBase, ".doc-detective", "runs")
    );
  });

  it("coerces a non-string output instead of throwing", function () {
    // A programmatic caller could hand a PathLike; the extension check and
    // path ops assume a string, so it must be coerced defensively.
    const config = { output: { toString: () => tempBase } };
    const dir = getRunOutputDir(config);
    expect(path.dirname(dir)).to.equal(
      path.resolve(tempBase, ".doc-detective", "runs")
    );
    expect(fs.existsSync(dir)).to.equal(true);
  });

  it("returns the run folder path without creating it when create is false", function () {
    const config = { output: tempBase };
    const dir = getRunOutputDir(config, { create: false });
    expect(path.dirname(dir)).to.equal(
      path.resolve(tempBase, ".doc-detective", "runs")
    );
    expect(path.basename(dir)).to.match(RUN_ID_RE);
    // No folder — not even the .doc-detective root — should touch disk.
    expect(fs.existsSync(path.resolve(tempBase, ".doc-detective"))).to.equal(
      false
    );
  });

  it("creates the memoized folder when a later create:true call writes", function () {
    const config = { output: tempBase };
    const lazy = getRunOutputDir(config, { create: false });
    expect(fs.existsSync(lazy)).to.equal(false);
    const eager = getRunOutputDir(config);
    expect(eager).to.equal(lazy);
    expect(fs.existsSync(eager)).to.equal(true);
  });
});

describe("runArchivesArtifacts", function () {
  it("is true when reporters include runFolder (case-insensitive)", function () {
    expect(runArchivesArtifacts({ reporters: ["terminal", "runFolder"] })).to.equal(
      true
    );
    expect(runArchivesArtifacts({ reporters: ["RUNFOLDER"] })).to.equal(true);
  });

  it("is false when reporters are set but exclude runFolder", function () {
    expect(
      runArchivesArtifacts({ reporters: ["terminal", "json", "html"] })
    ).to.equal(false);
  });

  it("is true for an empty reporters array (mirrors the default fallback)", function () {
    // outputResults falls back to the default reporter set (which includes
    // runFolder) when reporters is empty, so this helper must agree.
    expect(runArchivesArtifacts({ reporters: [] })).to.equal(true);
  });

  it("matches reporter tokens verbatim like outputResults (no trimming)", function () {
    // outputResults matches tokens as-is, so a padded `" runFolder "` runs no
    // reporter — the gate must agree, or it would reserve an empty folder.
    expect(runArchivesArtifacts({ reporters: [" runFolder "] })).to.equal(false);
    expect(runArchivesArtifacts({ reporters: ["runFolder"] })).to.equal(true);
    // A non-empty list with only blank/non-matching tokens is still an
    // override that excludes runFolder.
    expect(runArchivesArtifacts({ reporters: ["", "  "] })).to.equal(false);
  });

  it("does not treat a function reporter as the runFolder reporter", function () {
    // outputResults runs function reporters as-is; none of them is the
    // runFolder reporter, so a function-only override must not gate a folder.
    expect(runArchivesArtifacts({ reporters: [() => {}] })).to.equal(false);
  });

  it("recognizes the internal runFolderReporter key verbatim, not just the shorthand", function () {
    // outputResults resolves the exact `runFolderReporter` key via its default
    // branch, but only verbatim — a padded or mis-cased variant runs nothing.
    expect(runArchivesArtifacts({ reporters: ["runFolderReporter"] })).to.equal(
      true
    );
    expect(
      runArchivesArtifacts({ reporters: ["terminal", " runFolderReporter "] })
    ).to.equal(false);
  });

  it("is true when autoScreenshot is on even without the runFolder reporter", function () {
    expect(
      runArchivesArtifacts({ reporters: ["terminal"], autoScreenshot: true })
    ).to.equal(true);
  });

  it("is true when a spec enables autoScreenshot and runFolder is off", function () {
    expect(
      runArchivesArtifacts({ reporters: ["terminal"] }, [
        { autoScreenshot: true, tests: [{}] },
      ])
    ).to.equal(true);
  });

  it("is true when a test enables autoScreenshot and runFolder is off", function () {
    expect(
      runArchivesArtifacts({ reporters: ["terminal"] }, [
        { tests: [{ autoScreenshot: true }] },
      ])
    ).to.equal(true);
  });

  it("respects a test-level autoScreenshot:false override of a global true", function () {
    // resolveAutoScreenshot is test > spec > config, so a per-test false
    // disables screenshots even when config.autoScreenshot is true — the run
    // writes nothing, so it must not eagerly create the folder.
    expect(
      runArchivesArtifacts({ reporters: ["terminal"], autoScreenshot: true }, [
        { tests: [{ autoScreenshot: false }] },
      ])
    ).to.equal(false);
  });

  it("Boolean-coerces a truthy non-boolean autoScreenshot (API callers)", function () {
    expect(
      runArchivesArtifacts({ reporters: ["terminal"], autoScreenshot: "true" })
    ).to.equal(true);
    expect(
      runArchivesArtifacts({ reporters: ["terminal"] }, [
        { tests: [{ autoScreenshot: "yes" }] },
      ])
    ).to.equal(true);
  });

  it("is false when no spec/test enables autoScreenshot and runFolder is off", function () {
    expect(
      runArchivesArtifacts({ reporters: ["terminal"] }, [
        { tests: [{ autoScreenshot: false }, {}] },
      ])
    ).to.equal(false);
  });

  it("is true when autoRecord is on even without the runFolder reporter", function () {
    // autoRecord videos land in the run folder, so it must be archived too.
    expect(
      runArchivesArtifacts({ reporters: ["terminal"], autoRecord: true })
    ).to.equal(true);
    expect(
      runArchivesArtifacts({ reporters: ["terminal"] }, [
        { autoRecord: true, tests: [{}] },
      ])
    ).to.equal(true);
    expect(
      runArchivesArtifacts({ reporters: ["terminal"] }, [
        { tests: [{ autoRecord: true }] },
      ])
    ).to.equal(true);
  });

  it("respects a test-level autoRecord:false override of a global true", function () {
    expect(
      runArchivesArtifacts({ reporters: ["terminal"], autoRecord: true }, [
        { tests: [{ autoRecord: false }] },
      ])
    ).to.equal(false);
  });

  it("is true when reporters are unset (the default set includes runFolder)", function () {
    expect(runArchivesArtifacts({})).to.equal(true);
    expect(runArchivesArtifacts()).to.equal(true);
  });
});

describe("runSpecs run-folder creation", function () {
  this.timeout(120000);
  let tempBase;

  beforeEach(function () {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "dd-run-create-"));
  });

  afterEach(function () {
    fs.rmSync(tempBase, { recursive: true, force: true });
  });

  // One spec / test / context with a single non-driver step so no browser or
  // Appium server is needed.
  function fixture(extraConfig = {}) {
    return {
      config: {
        logLevel: "silent",
        telemetry: { send: false },
        environment: getEnvironment(),
        concurrentRunners: 1,
        output: tempBase,
        ...extraConfig,
      },
      specs: [
        {
          specId: "spec-1",
          tests: [
            {
              testId: "spec-1-test-1",
              contexts: [
                {
                  contextId: "spec-1-test-1-context-1",
                  steps: [{ stepId: "s1", runShell: "echo hi" }],
                },
              ],
            },
          ],
        },
      ],
    };
  }

  it("does not create a run folder when the runFolder reporter is deselected", async function () {
    await runSpecs({
      resolvedTests: fixture({ reporters: ["terminal", "json"] }),
    });
    expect(fs.existsSync(path.resolve(tempBase, ".doc-detective"))).to.equal(
      false
    );
  });

  it("creates a run folder when the runFolder reporter is active", async function () {
    await runSpecs({
      resolvedTests: fixture({ reporters: ["terminal", "json", "runFolder"] }),
    });
    const runsRoot = path.resolve(tempBase, ".doc-detective", "runs");
    expect(fs.existsSync(runsRoot)).to.equal(true);
    expect(
      fs.readdirSync(runsRoot).some((name) => RUN_ID_RE.test(name))
    ).to.equal(true);
  });

  it("does not create a run folder when a test disables autoScreenshot despite a global true", async function () {
    // config.autoScreenshot:true but the only test overrides to false → no
    // screenshots fire, and with runFolder off nothing should be archived.
    const resolved = fixture({
      reporters: ["terminal", "json"],
      autoScreenshot: true,
    });
    resolved.specs[0].tests[0].autoScreenshot = false;
    await runSpecs({ resolvedTests: resolved });
    expect(fs.existsSync(path.resolve(tempBase, ".doc-detective"))).to.equal(
      false
    );
  });

  it("creates the run folder when a test enables autoScreenshot but runFolder is off", async function () {
    // Per-spec/test autoScreenshot must still reserve the folder up front
    // (atomic creation), even when global config.autoScreenshot is unset and
    // the runFolder reporter is deselected.
    const resolved = fixture({ reporters: ["terminal", "json"] });
    resolved.specs[0].tests[0].autoScreenshot = true;
    await runSpecs({ resolvedTests: resolved });
    const runsRoot = path.resolve(tempBase, ".doc-detective", "runs");
    expect(fs.existsSync(runsRoot)).to.equal(true);
    expect(
      fs.readdirSync(runsRoot).some((name) => RUN_ID_RE.test(name))
    ).to.equal(true);
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
    const runDir = path.join(
      tempBase,
      ".doc-detective",
      "runs",
      "20260612-130000"
    );
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

  it("rejects a stamped runDir that symlinks outside the .doc-detective/runs/ root", async function () {
    // A runDir that lives under .doc-detective/runs/ but is a symlink resolving
    // outside the output tree must not slip past the confinement check.
    const runsRoot = path.resolve(tempBase, ".doc-detective", "runs");
    fs.mkdirSync(runsRoot, { recursive: true });
    const outsideTarget = fs.mkdtempSync(path.join(os.tmpdir(), "dd-escape-"));
    const linkPath = path.join(runsRoot, "2026-06-12T13-00-00-000Z");
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

  it("rejects a stamped runDir from the old run-<id>/ layout (under .doc-detective/ but not runs/)", async function () {
    // The confinement root tightened from `.doc-detective/` to
    // `.doc-detective/runs/`. A legacy runDir stamped in the old flat layout
    // (`.doc-detective/run-<id>/`, a sibling of `runs/`, not a child of it)
    // must now be rejected and re-derived to a fresh in-tree `runs/<id>` folder
    // rather than written to beside the report it no longer matches.
    const oldLayoutDir = path.join(
      tempBase,
      ".doc-detective",
      "run-20260612-130000"
    );
    fs.mkdirSync(oldLayoutDir, { recursive: true });
    const written = await reporters.runFolderReporter(
      {},
      tempBase,
      { runDir: oldLayoutDir, summary: {}, specs: [] },
      { command: "runTests" }
    );
    // Not written into the old-layout folder…
    expect(path.dirname(written)).to.not.equal(oldLayoutDir);
    expect(fs.readdirSync(oldLayoutDir)).to.have.lengthOf(0);
    // …but into a fresh folder under the new `runs/` collection.
    expect(
      path.relative(path.resolve(tempBase, ".doc-detective", "runs"), written)
    ).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z(-\d+)?[\\/]/);
  });

  it("rejects a stamped runDir equal to the runs/ collection root (must be a child)", async function () {
    // A stamped runDir that IS the `runs/` root (not a child run folder) would,
    // if accepted, archive to `.doc-detective/runs/testResults.json` and mix
    // every run's results into one file. The confinement requires a strict
    // child, so this is rejected and re-derived to a fresh `runs/<id>` folder.
    const runsRoot = path.resolve(tempBase, ".doc-detective", "runs");
    fs.mkdirSync(runsRoot, { recursive: true });
    const written = await reporters.runFolderReporter(
      {},
      tempBase,
      { runDir: runsRoot, summary: {}, specs: [] },
      { command: "runTests" }
    );
    // The archive is a child of runs/, never runs/testResults.json itself.
    expect(path.dirname(written)).to.not.equal(runsRoot);
    expect(path.basename(path.dirname(written))).to.match(RUN_ID_RE);
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
      path.relative(path.resolve(tempBase, ".doc-detective", "runs"), written)
    ).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z[\\/]/);
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
      path.relative(path.resolve(tempBase, ".doc-detective", "runs"), written)
    ).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z[\\/]/);
  });

  it("archives beside an existing file-path output, not inside it (any extension)", async function () {
    // The runFolder reporter accepts a file path — not just a directory — and
    // an existing file of any extension archives next to it, not inside a
    // directory named after it.
    const fileOutput = path.join(tempBase, "results.log");
    fs.writeFileSync(fileOutput, "x");
    const written = await reporters.runFolderReporter(
      {},
      fileOutput,
      { summary: {}, specs: [] },
      { command: "runTests" }
    );
    expect(
      path.relative(path.resolve(tempBase, ".doc-detective", "runs"), written)
    ).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z[\\/]/);
  });

  it("keeps a report-extension output beside its parent even if it exists as a directory", async function () {
    // A directory oddly named `reports.json` must resolve the same way
    // getRunOutputDir does (strip the extension → parent), so the reporter's
    // confinement root never diverges from the stamped runDir.
    const dirOutput = path.join(tempBase, "reports.json");
    fs.mkdirSync(dirOutput);
    const written = await reporters.runFolderReporter(
      {},
      dirOutput,
      { summary: {}, specs: [] },
      { command: "runTests" }
    );
    // Archived beside `reports.json`, i.e. under <tempBase>/.doc-detective.
    expect(
      path.relative(path.resolve(tempBase, ".doc-detective", "runs"), written)
    ).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z[\\/]/);
    expect(
      fs.existsSync(path.join(dirOutput, ".doc-detective"))
    ).to.equal(false);
  });

  it("treats a non-existent dotted output as a directory (matches getRunOutputDir)", async function () {
    // A not-yet-created path like `reports.v1` must stay a directory, so the
    // archive root agrees with the stamped runDir / autoScreenshot folder
    // instead of diverging to the parent.
    const dirOutput = path.join(tempBase, "reports.v1");
    const written = await reporters.runFolderReporter(
      {},
      dirOutput,
      { summary: {}, specs: [] },
      { command: "runTests" }
    );
    expect(
      path.relative(path.resolve(dirOutput, ".doc-detective", "runs"), written)
    ).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z[\\/]/);
  });

  it("also writes an HTML report beside the JSON in the run folder", async function () {
    const runDir = path.join(
      tempBase,
      ".doc-detective",
      "runs",
      "20260612-140000"
    );
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

  it("prints the per-run JSON path as the last 'results at' token", async function () {
    // The doc-detective GitHub Action resolves the results file by splitting
    // stdout on "results at " and `require()`-ing the trimmed last segment
    // (see github-action dist/index.js). The HTML-report line ("...report at
    // <html>") must therefore print *before* the per-run JSON line
    // ("...results at <json>") — otherwise the action folds the trailing HTML
    // line into the path and the require() fails the release smoke test.
    const runDir = path.join(
      tempBase,
      ".doc-detective",
      "runs",
      "20260612-170000"
    );
    fs.mkdirSync(runDir, { recursive: true });
    const results = { runId: "20260612-170000", runDir, summary: {}, specs: [] };

    const lines = [];
    const origLog = console.log;
    console.log = (...args) => {
      lines.push(args.join(" "));
    };
    let written;
    try {
      written = await reporters.runFolderReporter({}, tempBase, results, {
        command: "runTests",
      });
    } finally {
      console.log = origLog;
    }

    // Mirror the action's parser exactly.
    const stdout = lines.join("\n");
    const segments = stdout.split("results at ");
    const parsed = segments[segments.length - 1].trim();
    expect(parsed).to.equal(written);
  });

  it("names the HTML file to match the command's JSON report type", async function () {
    const runDir = path.join(
      tempBase,
      ".doc-detective",
      "runs",
      "20260612-150000"
    );
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

  it("keeps the JSON archive when the HTML write fails (best-effort)", async function () {
    const runDir = path.join(
      tempBase,
      ".doc-detective",
      "runs",
      "20260612-160000"
    );
    fs.mkdirSync(runDir, { recursive: true });
    // Force only the HTML write to fail without mocking internals: occupy the
    // HTML path with a directory so fs.writeFileSync throws (EISDIR/EPERM),
    // while the JSON write to a different filename still succeeds. Validates
    // the inner try/catch — an HTML failure must not break the JSON archive.
    fs.mkdirSync(path.join(runDir, "testResults.html"));
    const results = { runId: "20260612-160000", runDir, summary: {}, specs: [] };
    const written = await reporters.runFolderReporter({}, tempBase, results, {
      command: "runTests",
    });
    // JSON still written and returned; the call did not throw.
    expect(written).to.equal(path.resolve(runDir, "testResults.json"));
    expect(JSON.parse(fs.readFileSync(written, "utf8")).runId).to.equal(
      "20260612-160000"
    );
    // The HTML path remains the pre-existing directory (the write never ran).
    expect(
      fs.statSync(path.join(runDir, "testResults.html")).isDirectory()
    ).to.equal(true);
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

describe("resolveAutoRecord precedence", function () {
  it("defers down the chain when levels are unset (test > spec > config)", function () {
    expect(
      resolveAutoRecord({ config: { autoRecord: true }, spec: {}, test: {} })
    ).to.equal(true);
    expect(resolveAutoRecord({ config: {}, spec: {}, test: {} })).to.equal(false);
    // Spec overrides config.
    expect(
      resolveAutoRecord({
        config: { autoRecord: false },
        spec: { autoRecord: true },
        test: {},
      })
    ).to.equal(true);
    expect(
      resolveAutoRecord({
        config: { autoRecord: true },
        spec: { autoRecord: false },
        test: {},
      })
    ).to.equal(false);
    // Test overrides spec and config.
    expect(
      resolveAutoRecord({
        config: { autoRecord: false },
        spec: { autoRecord: false },
        test: { autoRecord: true },
      })
    ).to.equal(true);
    expect(
      resolveAutoRecord({
        config: { autoRecord: true },
        spec: { autoRecord: true },
        test: { autoRecord: false },
      })
    ).to.equal(false);
  });
});

describe("buildAutoRecordStep", function () {
  // getRunOutputDir() creates the run folder, so give it a temp output to keep
  // artifacts out of the repo CWD.
  let tempOutput;
  let config;
  const spec = { specId: "docs/guide.md" };
  const test = { testId: "docs/guide.md~abc123" };

  beforeEach(function () {
    tempOutput = fs.mkdtempSync(path.join(os.tmpdir(), "dd-auto-record-"));
    config = { logLevel: "silent", output: tempOutput };
  });

  afterEach(function () {
    fs.rmSync(tempOutput, { recursive: true, force: true });
  });

  it("builds a synthetic ffmpeg record step with a deterministic path for a driver context", function () {
    const context = {
      contextId: "windows-chrome",
      steps: [{ goTo: { url: "https://example.com" } }],
    };
    const step = buildAutoRecordStep({ config, spec, test, context });
    expect(step, "expected a synthetic step").to.not.equal(null);
    expect(step.record.engine).to.equal("ffmpeg");
    expect(step.record.overwrite).to.equal("true");
    expect(step.__autoRecord).to.equal(true);
    // Deterministic REST path ending in
    // specs/<spec>/tests/<test>/contexts/<context>/recordings/<context>.mp4.
    const normalized = step.record.path.split(path.sep).join("/");
    expect(normalized).to.match(
      /specs\/.+\/tests\/.+\/contexts\/windows-chrome\/recordings\/windows-chrome\.mp4$/
    );
  });

  it("caps an over-long id to 32 chars and stays collision-resistant", function () {
    // Two distinct specIds that share the same trailing chars must NOT collapse
    // into the same path segment, or one context could overwrite another's
    // artifacts. capPathSegment prepends a deterministic hash of the full id, so
    // the capped segments stay distinct (and stable across runs).
    const sharedTail = "x".repeat(40);
    const context = {
      contextId: "windows-chrome",
      steps: [{ goTo: { url: "https://example.com" } }],
    };
    const specSegmentOf = (specId) => {
      const step = buildAutoRecordStep({ config, spec: { specId }, test, context });
      return step.record.path
        .split(path.sep)
        .join("/")
        .split("/specs/")[1]
        .split("/tests/")[0];
    };
    const a = specSegmentOf(`alpha-prefix${sharedTail}`);
    const b = specSegmentOf(`bravo-prefix${sharedTail}`);
    // Each capped to the 32-char budget…
    expect(a).to.have.lengthOf(32);
    expect(b).to.have.lengthOf(32);
    // …yet distinct despite identical 32-char tails (no artifact collision)…
    expect(a).to.not.equal(b);
    // …and deterministic: the same id maps to the same segment every run.
    expect(specSegmentOf(`alpha-prefix${sharedTail}`)).to.equal(a);
  });

  it("returns null when the context has no driver-required steps", function () {
    const context = {
      contextId: "default",
      steps: [{ httpRequest: { url: "https://api.example.com" } }],
    };
    expect(buildAutoRecordStep({ config, spec, test, context })).to.equal(null);
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
