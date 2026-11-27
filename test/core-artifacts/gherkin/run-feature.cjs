// Gherkin permutations (ADR 01227), run by gherkin.spec.json.
//
//   node test/core-artifacts/gherkin/run-feature.cjs <case>
//
// The fixture job's config turns step detection off, so each case copies this
// folder to .tmp/fixture-gherkin/<case>/, writes a config with detection on,
// and runs the real CLI on one .feature file there. Relative screenshot,
// recording, and state paths then land in .tmp. It checks each test's result,
// that no other test ran, and the warnings on stderr. Exits 1 on any mismatch.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const unmapped = (step, line) =>
  `Couldn't map step \`${step}\` in \`${path.join("{dir}", "warnings.feature")}:${line}\` to an action. Add a \`step\` statement or a \`markup\` entry.`;

const cases = {
  phrases: {
    file: "phrases.feature",
    // `I run:` is a runCode step, which is unsafe.
    config: { allowUnsafeSteps: true },
    results: {
      "Navigate, find, and click": "PASS",
      "Type and press keys": "PASS",
      "Drag and drop": "PASS",
      Screenshots: "PASS",
      "Shell, code, waits, and variables": "PASS",
      "HTTP requests": "PASS",
      "Mock requests": "PASS",
      "Recording and sessions": "PASS",
    },
    quiet: true,
    check: (json) => {
      const notRun = json.specs[0].tests.flatMap((t) => t.contexts.flatMap((c) => c.steps)).filter((s) => s.result !== "PASS");
      return notRun.length ? `steps didn't pass: ${JSON.stringify(notRun.map((s) => s.resultDescription))}` : undefined;
    },
  },
  structure: {
    file: "structure.feature",
    results: {
      "Background runs first": "PASS",
      "merged-comment": "PASS",
      "by-tag": "PASS",
      "Data tables": "PASS",
      "Inline statements": "PASS",
      "Visit <page> [row 1]": "PASS",
      "Visit <page> [row 2]": "PASS",
      "The Rule Background runs after the Feature Background": "PASS",
    },
    quiet: true,
  },
  "structure-detect-off": {
    file: "structure.feature",
    config: { detectSteps: false },
    // Only the scenario with an inline step has a step left.
    results: { "Inline statements": "PASS" },
  },
  tags: {
    file: "tags.feature",
    results: {
      "Skipped with skip": "SKIPPED",
      "Skipped with wip": "SKIPPED",
      "Recorded automatically": "PASS",
      Firefox: "PASS",
      "Linux only": process.platform === "linux" ? "PASS" : "SKIPPED",
      "Windows and macOS only": process.platform === "linux" ? "SKIPPED" : "PASS",
      "Safari on macOS": process.platform === "darwin" ? "PASS" : "SKIPPED",
    },
    check: (json) => {
      const test = json.specs[0].tests.find((t) => t.testId === "Recorded automatically");
      return test.contexts.some((c) => c.autoRecording) ? undefined : "`@record` didn't record the test.";
    },
  },
  emulation: {
    file: "emulation.feature",
    results: {
      "An untagged scenario emulates in Chrome": "PASS",
      "Light mode in Firefox": "PASS",
      "Firefox can't set a timezone": "SKIPPED",
    },
    quiet: true,
  },
  warnings: {
    file: "warnings.feature",
    results: { "An unmapped step warns": "PASS" },
    stderr: [
      unmapped("And I frobnicate the widget", 8),
      `Couldn't expand \`Scenario Outline: No examples\` in \`${path.join("{dir}", "warnings.feature")}:11\`: it has no \`Examples\`.`,
    ],
  },
  "detect-off": {
    file: "detect-off.feature",
    results: { "Only inline steps run": "PASS" },
    quiet: true,
    check: (json) => {
      const steps = json.specs[0].tests[0].contexts.flatMap((c) => c.steps);
      return steps.length === 1 && steps[0].runShell ? undefined : `ran ${JSON.stringify(steps.map((s) => Object.keys(s)))}`;
    },
  },
};

const name = process.argv[2];
const c = cases[name];
if (!c) {
  console.error(`Unknown case "${name}". Cases: ${Object.keys(cases).join(", ")}`);
  process.exit(2);
}
const root = path.resolve(__dirname, "../../..");
const dir = path.join(root, ".tmp", "fixture-gherkin", name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
for (const file of fs.readdirSync(__dirname)) {
  if (/\.(feature|env|txt)$/.test(file)) fs.copyFileSync(path.join(__dirname, file), path.join(dir, file));
}
// Outside the case folder, so the run reads only the feature file.
const cfg = `${dir}.config.json`;
fs.writeFileSync(
  cfg,
  JSON.stringify({
    telemetry: { send: false },
    detectSteps: true,
    autoRecord: false,
    logLevel: "warning",
    outputDir: dir,
    runOn: [{ platforms: ["windows", "mac", "linux"], browsers: [{ name: "firefox", headless: true }] }],
    ...c.config,
  })
);

const results = path.join(dir, "results.json");
const run = spawnSync(
  process.execPath,
  [path.join(root, "bin", "doc-detective.js"), "run", path.join(dir, c.file), "--config", cfg, "--output", results, "--no-env-file"],
  { cwd: dir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 300_000 }
);
const fail = (message) => {
  console.error(`Case ${name}: ${message}`);
  console.error(`stderr: ${run.stderr}`);
  process.exit(1);
};
if (run.error) fail(`didn't finish: ${run.error.message}`);
if (run.status !== 0) fail(`exited ${run.status}, expected 0.`);
const json = JSON.parse(fs.readFileSync(results, "utf8"));
const actual = Object.fromEntries(json.specs.flatMap((s) => s.tests.map((t) => [t.testId, t.result])));
if (JSON.stringify(actual) !== JSON.stringify(c.results)) {
  fail(`results differ.\nexpected: ${JSON.stringify(c.results)}\nactual:   ${JSON.stringify(actual)}`);
}
for (const line of (c.stderr ?? []).map((s) => s.replace("{dir}", dir))) {
  if (!run.stderr.includes(line)) fail(`stderr doesn't include ${JSON.stringify(line)}.`);
}
if (c.quiet && run.stderr.includes("Couldn't map step")) fail("an unexpected step warning.");
const problem = c.check?.(json);
if (problem) fail(problem);
console.log(`Case ${name}: passed.`);
