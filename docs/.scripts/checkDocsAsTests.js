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
// Run with `npm run docs:check-docs-as-tests` after `npm run build`.

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
      (test.steps || []).map((step) => {
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

function dryRun(inputs, configPath) {
  const out = execFileSync(
    process.execPath,
    [path.join(repoRoot, "bin/doc-detective.js"), "run", ...inputs, "--dry-run", "-c", configPath],
    { cwd: repoRoot, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 }
  );
  // Keep only the examples' specs, not beforeAll/afterAll setup specs.
  return JSON.parse(out).specs.filter((spec) => path.resolve(spec.contentPath).startsWith(examplesDir));
}

function main() {
  if (!fs.existsSync(examplesDir)) {
    console.error(`No examples folder at ${examplesDir}`);
    process.exit(1);
  }
  const files = fs
    .readdirSync(examplesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .flatMap((d) => fs.readdirSync(path.join(examplesDir, d.name)).map((f) => path.join(examplesDir, d.name, f)));
  const prose = files.filter((f) => path.basename(f).startsWith("prose."));
  const tested = files.filter((f) => /^(detected|inline|standalone)\./.test(path.basename(f)));

  const specs = [
    ...dryRun(tested, path.join(examplesDir, ".doc-detective.json")),
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

module.exports = { findMismatches, normalizeSteps };
