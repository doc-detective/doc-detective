// Run comparison permutations (ADR 01216), run by compare-runs.spec.json in
// this directory.
//
//   node test/core-artifacts/cli/compare-runs.cjs <case>
//
// Each case sets up .tmp/fixture-compare-runs/<case>/, outside
// test/core-artifacts/ so its files never run as fixtures themselves. It then
// runs the real CLI there once per entry in `runs`, in order, and checks each
// run's exit code, stdout, stderr, results JSON, and testResults.md. Exits 1
// on any mismatch.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// A spec whose test `a` passes or fails, with fixed IDs so runs match.
const spec = (result) => ({
  specId: "compare",
  tests: [{ testId: "a", steps: [{ runShell: result === "FAIL" ? "exit 1" : "exit 0" }] }],
});
const FAIL = { "s.spec.json": spec("FAIL") };
const PASS = { "s.spec.json": spec("PASS") };
const run = (files, args = [], checks = {}) => ({ files, args: ["-i", "s.spec.json", "-o", "results.json", ...args], ...checks });
const NOT_COMPARED = { compared: false, stderrExcludes: "Couldn't compare" };
const warning = (text) => ({ exit: 1, compared: false, stderr: [`Warning: Couldn't compare with an earlier run: ${text}`] });
const usage = (args, line) => ({ files: FAIL, args: ["-i", "s.spec.json", ...args], exit: 2, stderrEquals: `Error: ${line}\n` });
const v4 = { environment: { docDetectiveVersion: "4.9.0" }, specs: [] };

const cases = {
  "default-no-earlier-run": [run(FAIL, [], { exit: 1, ...NOT_COMPARED })],
  // The terminal summary (stdout) and the run folder's testResults.md show the
  // marks; stderr doesn't repeat the counts.
  "default-existing": [
    run(FAIL, [], { exit: 1 }),
    run(FAIL, [], {
      exit: 1,
      status: "existing",
      summary: [0, 1, 0],
      stdout: ["1. [already failing] compare › a › ", "Compared with run `", "`: 0 new, 1 already failing, 0 fixed."],
      stderrExcludes: "Compared with run",
      markdown: ["| [already failing] `compare › a › ", "Compared with run `"],
    }),
  ],
  "default-new": [
    run(PASS),
    run(FAIL, [], { exit: 1, status: "new", summary: [1, 0, 0], stdout: ["1. [new] compare › a › "], markdown: ["| [new] `compare › a › "] }),
  ],
  "default-fixed": [
    run(FAIL, [], { exit: 1 }),
    run(PASS, [], {
      status: "fixed",
      summary: [0, 0, 1],
      stdout: ["Fixed (1):", "1. compare › a › ", "0 new, 0 already failing, 1 fixed."],
      markdown: ["## Fixed", "- `compare › a › "],
    }),
  ],
  "explicit-file": [
    run(FAIL, ["--output-dir", "first", "-o", "base.json"], { exit: 1 }),
    run(FAIL, ["--output-dir", "second", "--compare-to", "base.json"], { exit: 1, status: "existing", summary: [0, 1, 0] }),
  ],
  "explicit-run-folder": [
    run(FAIL, ["--output-dir", "first"], { exit: 1 }),
    run(FAIL, ["--output-dir", "second", "--compare-to", "{runFolder:first}"], { exit: 1, status: "existing", summary: [0, 1, 0] }),
  ],
  "explicit-previous-none": [run(FAIL, ["--compare-to", "previous"], warning("no earlier run in"))],
  "config-previous-none": [
    { ...run({ ...FAIL, "dd.json": { compareTo: "previous" } }, ["-c", "dd.json"]), ...warning("no earlier run in") },
  ],
  "no-compare-to": [run(FAIL, [], { exit: 1 }), run(FAIL, ["--no-compare-to"], { exit: 1, ...NOT_COMPARED })],
  "config-false": [
    run({ ...FAIL, "dd.json": { compareTo: false } }, ["-c", "dd.json"], { exit: 1 }),
    run(FAIL, ["-c", "dd.json"], { exit: 1, ...NOT_COMPARED }),
  ],
  "flag-beats-config": [
    run({ ...FAIL, "dd.json": { compareTo: false } }, ["-c", "dd.json"], { exit: 1 }),
    run(FAIL, ["-c", "dd.json", "--compare-to", "previous"], { exit: 1, status: "existing", summary: [0, 1, 0] }),
  ],
  "missing-path": [run(FAIL, ["--compare-to", "nope.json"], warning("`{dir}/nope.json` doesn't exist."))],
  "folder-without-results": [
    run({ ...FAIL, "empty/readme.txt": "x" }, ["--compare-to", "empty"], warning("`{dir}/empty` has no `testResults.json`.")),
  ],
  "not-json": [run({ ...FAIL, "bad.json": "{nope" }, ["--compare-to", "bad.json"], warning("`{dir}/bad.json` isn't valid JSON."))],
  "no-specs": [
    run({ ...FAIL, "other.json": {} }, ["--compare-to", "other.json"], warning("`{dir}/other.json` has no `specs` list, so it isn't Doc Detective results.")),
  ],
  "other-major": [
    run({ ...FAIL, "v4.json": v4 }, ["--compare-to", "v4.json"], warning("`{dir}/v4.json` is from Doc Detective 4.9.0, and test IDs match only within version ")),
  ],
  "usage-blank": [usage(["--compare-to", ""], "`--compare-to` needs a path or `previous`.")],
  "usage-both": [usage(["--compare-to", "x", "--no-compare-to"], "set `--compare-to` or `--no-compare-to`, not both.")],
  "usage-dry-run": [usage(["--dry-run", "--compare-to", "x"], "set `--dry-run` or `--compare-to`, not both.")],
};

const name = process.argv[2];
const runs = cases[name];
if (!runs) {
  console.error(`Unknown case "${name}". Cases: ${Object.keys(cases).join(", ")}`);
  process.exit(2);
}
const root = path.resolve(__dirname, "../../..");
const dir = path.join(root, ".tmp", "fixture-compare-runs", name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const env = {
  ...process.env,
  DOC_DETECTIVE_CONFIG: JSON.stringify({ telemetry: { send: false }, autoUpdate: false }),
  DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
};
for (const key of ["DOC_DETECTIVE", "DOC_DETECTIVE_DEBUG", "DEBUG"]) delete env[key];

// `{runFolder:<outputDir>}` is the one run folder under that output folder.
const expand = (arg) =>
  arg.replace(/^\{runFolder:(.+)\}$/, (_, out) => {
    const runs = path.join(dir, out, ".doc-detective", "runs");
    return path.join(runs, fs.readdirSync(runs)[0]);
  });

runs.forEach((c, index) => {
  for (const [file, content] of Object.entries(c.files)) {
    fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
    fs.writeFileSync(path.join(dir, file), typeof content === "string" ? content : JSON.stringify(content));
  }
  fs.rmSync(path.join(dir, "results.json"), { force: true });
  const result = spawnSync(process.execPath, [path.join(root, "bin", "doc-detective.js"), ...c.args.map(expand)], {
    cwd: dir,
    env,
    encoding: "utf8",
    timeout: 120_000,
  });
  const fail = (message) => {
    console.error(`Case ${name}, run ${index + 1}: ${message}`);
    console.error(`stderr: ${result.stderr}`);
    process.exit(1);
  };
  const text = (value) => value.replace(/\{dir\}\/([^`]+)/,(_, file) => path.join(dir, file));
  if (result.error) fail(`didn't finish: ${result.error.message}`);
  if (result.status !== (c.exit ?? 0)) fail(`exited ${result.status}, expected ${c.exit ?? 0}.`);
  if (c.stderrEquals !== undefined && result.stderr !== c.stderrEquals) fail(`stderr isn't ${JSON.stringify(c.stderrEquals)}.`);
  for (const value of c.stderr ?? []) if (!result.stderr.includes(text(value))) fail(`stderr doesn't include ${JSON.stringify(text(value))}.`);
  if (c.stderrExcludes && result.stderr.includes(c.stderrExcludes)) fail(`stderr includes ${JSON.stringify(c.stderrExcludes)}.`);
  for (const value of c.stdout ?? []) if (!result.stdout.includes(value)) fail(`stdout doesn't include ${JSON.stringify(value)}. stdout: ${result.stdout}`);
  if (c.markdown) {
    // The newest run folder's summary.
    const runsDir = path.join(dir, ".doc-detective", "runs");
    const newest = fs.readdirSync(runsDir).sort().pop();
    const md = fs.readFileSync(path.join(runsDir, newest, "testResults.md"), "utf8");
    for (const value of c.markdown) if (!md.includes(value)) fail(`testResults.md doesn't include ${JSON.stringify(value)}:\n${md}`);
  }
  if (c.compared === undefined && c.status === undefined) return;
  const report = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
  const context = report.specs[0].tests[0].contexts.find(Boolean);
  if (c.compared === false) {
    if (report.comparison) fail("results have a `comparison`.");
    if (context.failureStatus) fail("a context has a `failureStatus`.");
    return;
  }
  if (!report.comparison) fail("results have no `comparison`.");
  const [n, existing, fixed] = c.summary;
  const summary = report.comparison.summary;
  if (summary.new !== n || summary.existing !== existing || summary.fixed !== fixed) {
    fail(`comparison summary is ${JSON.stringify(summary)}.`);
  }
  if (context.failureStatus !== c.status) fail(`failureStatus is ${context.failureStatus}, expected ${c.status}.`);
  if (!path.isAbsolute(report.comparison.previous.path)) fail("comparison.previous.path isn't absolute.");
});
console.log(`Case ${name}: passed.`);
