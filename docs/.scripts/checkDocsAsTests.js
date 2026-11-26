// Checks the docs-as-tests reference examples in
// fern/pages/reference/docs-as-tests/examples/<example>/. Each example shows
// one procedure as prose.*, detected.*, inline.*, and standalone.spec.*.
// The page promises those variants say the same thing, so this resolves
// them with `doc-detective run --dry-run` and compares their steps:
//
// - every inline.* resolves to the same steps as the standalone spec,
// - every detected.* resolves to the same steps as the other detected.*
//   files (detection adds steps, such as a checkLink for a goTo link, that
//   an author wouldn't write by hand, so it isn't compared to standalone),
// - every prose.* resolves to no tests when detection is off.
//
// An example that needs other config, such as custom fileTypes, keeps a
// doc-detective.json in its folder; the rest use examples/.doc-detective.json.
//
// Run with `npm run docs:check-docs-as-tests` after `npm run build`. Add
// `-- --run` to run the detected variants for real instead.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const repoRoot = path.resolve(__dirname, "../..");
const examplesDir = path.resolve(__dirname, "../fern/pages/reference/docs-as-tests/examples");

// Fields that differ between variants of the same step without changing it.
const IGNORED_STEP_KEYS = ["stepId", "description", "location"];

function normalizeSteps(tests) {
  return JSON.stringify(
    tests.map((test) =>
      // A dry run puts each test's steps under its contexts; a parsed spec has them on the test.
      (test.contexts?.[0]?.steps ?? test.steps ?? []).map((step) => {
        const copy = { ...step };
        for (const key of IGNORED_STEP_KEYS) delete copy[key];
        return copy;
      })
    )
  );
}

/** Returns one message per variant that breaks the equivalence rules. */
function findMismatches(specs) {
  const examples = new Map();
  for (const spec of specs) {
    const file = path.basename(spec.contentPath);
    const example = path.basename(path.dirname(spec.contentPath));
    if (!examples.has(example)) examples.set(example, []);
    examples.get(example).push({ file, mode: file.split(".")[0], steps: normalizeSteps(spec.tests || []) });
  }

  const problems = [];
  for (const [example, variants] of examples) {
    const standalone = variants.find((v) => v.mode === "standalone");
    if (!standalone) {
      problems.push(`${example}: no standalone spec`);
      continue;
    }
    const firstDetected = variants.find((v) => v.mode === "detected");
    for (const v of variants) {
      if (v.mode === "prose") {
        problems.push(`${example}/${v.file}: prose resolves to tests`);
      } else if ((v.mode === "inline" || v.mode === "standalone") && v.steps !== standalone.steps) {
        problems.push(`${example}/${v.file}: steps differ from ${standalone.file}`);
      } else if (v.mode === "detected" && v.steps !== firstDetected.steps) {
        problems.push(`${example}/${v.file}: steps differ from ${firstDetected.file}`);
      }
    }
  }
  return problems;
}

/**
 * Groups files by the config they run with: the example's own
 * `doc-detective.json` when it has one, else the shared config.
 */
function groupByConfig(files, sharedConfig, exists = fs.existsSync) {
  const groups = new Map();
  for (const file of files) {
    const own = path.join(path.dirname(file), "doc-detective.json");
    const config = exists(own) ? own : sharedConfig;
    if (!groups.has(config)) groups.set(config, []);
    groups.get(config).push(file);
  }
  return groups;
}

function runCli(inputs, configPath, extraArgs, options = {}) {
  return execFileSync(
    process.execPath,
    [path.join(repoRoot, "bin/doc-detective.js"), "run", ...inputs, ...extraArgs, "-c", configPath],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, ...options }
  );
}

// Windows caps a command line at 32K characters, so long input lists run in batches.
const BATCH = 60;
function batches(inputs) {
  const out = [];
  for (let i = 0; i < inputs.length; i += BATCH) out.push(inputs.slice(i, i + BATCH));
  return out;
}

function dryRun(inputs, configPath) {
  return batches(inputs).flatMap((batch) =>
    // Keep only the examples' specs, not beforeAll/afterAll setup specs.
    JSON.parse(runCli(batch, configPath, ["--dry-run"])).specs.filter((spec) =>
      path.resolve(spec.contentPath).startsWith(examplesDir)
    )
  );
}

/** Every file in the named example folders, or in all of them when `only` is empty. */
function listExampleFiles(only = []) {
  return fs
    .readdirSync(examplesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && (!only.length || only.includes(d.name)))
    .flatMap((d) => fs.readdirSync(path.join(examplesDir, d.name)).map((f) => path.join(examplesDir, d.name, f)));
}

function main() {
  if (!fs.existsSync(examplesDir)) {
    console.error(`No examples folder at ${examplesDir}`);
    process.exit(1);
  }
  // Bare arguments name the examples to check; none means all of them.
  const only = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));
  const files = listExampleFiles(only);
  if (!files.length) {
    console.error(`Couldn't find examples to check in ${examplesDir}.`);
    process.exit(1);
  }
  const prose = files.filter((f) => path.basename(f).startsWith("prose."));
  const tested = files.filter((f) => /^(detected|inline|standalone)\./.test(path.basename(f)));

  const sharedConfig = path.join(examplesDir, ".doc-detective.json");
  if (process.argv.includes("--run")) {
    // Run the detected variants for real. The docs run covers inline and
    // standalone with the site config, which turns detection off and has no
    // file type for plain text, so `inline.txt` runs here too.
    const detected = tested.filter((f) => /^(detected\.|inline\.txt$)/.test(path.basename(f)));
    let failed = false;
    for (const [config, inputs] of groupByConfig(detected, sharedConfig)) {
      for (const batch of batches(inputs)) {
        try {
          runCli(batch, config, [], { stdio: "inherit" });
        } catch {
          failed = true;
        }
      }
    }
    process.exit(failed ? 1 : 0);
  }

  const specs = [
    ...[...groupByConfig(tested, sharedConfig)].flatMap(([config, inputs]) => dryRun(inputs, config)),
    // The docs site's own config turns detection off, so prose must resolve to nothing.
    ...dryRun(prose, path.resolve(__dirname, "../.doc-detective.json")),
  ];
  // A variant that resolves to no tests drops out of the dry run, so it would never be compared.
  const resolved = new Set(specs.map((spec) => path.resolve(spec.contentPath)));
  const problems = [
    ...tested.filter((f) => !resolved.has(path.resolve(f))).map((f) => `${path.relative(examplesDir, f)}: resolves to no tests`),
    ...findMismatches(specs),
  ];
  for (const problem of problems) console.error(problem);
  const checked = [...prose, ...tested];
  console.log(`Checked ${checked.length} files in ${new Set(checked.map(path.dirname)).size} examples: ${problems.length} problems.`);
  process.exit(problems.length ? 1 : 0);
}

if (require.main === module) main();

module.exports = { findMismatches, normalizeSteps, groupByConfig, dryRun, listExampleFiles, examplesDir };
