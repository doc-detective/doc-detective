// Screenshots and recordings by default (ADR 01177), run by
// cli/auto-capture-defaults.spec.json and recording/autorecord-defaults.spec.json.
//
//   node test/core-artifacts/cli/auto-capture.cjs <case>
//
// Each case writes a spec to .tmp/fac/<case>/, outside
// test/core-artifacts/ so it never runs as a fixture itself, runs the real CLI
// there with no auto-capture keys unless the case sets them, and checks the
// results file and the run folder. Exits 1 on any mismatch. The browser cases
// browse the 8092 test server.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const everywhere = ["windows", "mac", "linux"];
const runOn = (name) => [{ platforms: everywhere, browsers: { name, headless: true } }];
const uiSteps = [
  { stepId: "open", goTo: "http://localhost:8092" },
  { stepId: "body", find: { selector: "body", timeout: 5000 } },
];
const uiSpec = (id, browser, keys = {}, testKeys = {}) => ({
  specId: id,
  ...keys,
  tests: [{ testId: `${id}-t`, runOn: runOn(browser), ...testKeys, steps: uiSteps }],
});
const shellSpec = { specId: "shell", tests: [{ testId: "shell-t", steps: [{ runShell: "echo hi" }] }] };

const steps = (report) =>
  report.specs.flatMap((s) => s.tests.flatMap((t) => t.contexts.flatMap((c) => c.steps ?? [])));
// The context that ran: the others target another platform and are SKIPPED.
const contexts = (report) =>
  report.specs.flatMap((s) => s.tests.flatMap((t) => t.contexts)).filter((c) => c.result !== "SKIPPED");
const authored = (report) => steps(report).filter((s) => uiSteps.some((u) => u.stepId === s.stepId));
const autoRecord = (report) => steps(report).find((s) => String(s.stepId).endsWith("~autorecord"));

// Every authored UI step has an image in the run folder, and the first is 01-….
function expectScreenshots(report, check) {
  const shots = authored(report).map((s) => s.autoScreenshot);
  check(shots.length === uiSteps.length && shots.every(Boolean), `every UI step has an autoScreenshot (${JSON.stringify(shots)})`);
  for (const shot of shots.filter(Boolean)) check(fs.existsSync(path.join(report.runDir, shot)), `${shot} exists in the run folder`);
  check(path.basename(String(shots[0])).startsWith("01-"), `the first authored image is 01-… (${shots[0]})`);
}
// A headed context records the screen with ffmpeg where the host can capture
// it. A host that can't adds no recording (or skips a start that fails), and
// the context passes either way.
function expectScreenRecording(report, check, dir, stderr) {
  check(contexts(report).length === 1 && contexts(report)[0].result === "PASS", "the context passed");
  const rec = autoRecord(report);
  if (!rec) {
    check(stderr.includes("Not recording automatically:"), "a host that can't record says why");
    return;
  }
  check(rec.record?.engine === "ffmpeg", `the recording used ffmpeg (${rec.record?.engine})`);
  if (rec.result === "PASS") check(fs.existsSync(rec.record.path), "its MP4 exists");
}
function expectNoScreenshots(report, check) {
  check(steps(report).every((s) => !s.autoScreenshot), "no step has an autoScreenshot");
}

// cli/auto-capture-defaults.spec.json runs the cases through junit-run-folder,
// plus junit-both-false. recording/autorecord-defaults.spec.json runs
// headless-firefox and the cases from headed-chrome-record to autorecord-false.
const cases = {
  // Headless Chrome with no keys: a screenshot per step, and a tab recording.
  "headless-chrome": {
    spec: uiSpec("hc", "chrome"),
    check(report, check) {
      check(contexts(report).length === 1 && contexts(report)[0].result === "PASS", "the context passed");
      expectScreenshots(report, check);
      const rec = autoRecord(report);
      check(rec?.result === "PASS", `there's a passing ~autorecord step (${rec?.result})`);
      check(/\.mp4$/i.test(rec?.record?.path ?? "") && fs.existsSync(rec.record.path), "its MP4 exists");
      check(rec?.record?.engine === "browser", `it used the browser engine (${rec?.record?.engine})`);
      // The synthetic start and stop stay out of the step counts.
      const counted = report.summary.steps;
      check(
        counted.pass === uiSteps.length && counted.fail + counted.warning + counted.skipped === 0,
        `the summary counts only the authored steps (${JSON.stringify(counted)})`
      );
    },
  },
  // Headless Firefox with no keys: screenshots; recorded headed only where the
  // host can capture the screen (DA1a), otherwise left headless and unrecorded.
  "headless-firefox": {
    spec: uiSpec("hf", "firefox"),
    check(report, check) {
      check(contexts(report).length === 1 && contexts(report)[0].result === "PASS", "the context passed");
      expectScreenshots(report, check);
      const rec = autoRecord(report);
      const browser = contexts(report)[0].browser ?? {};
      if (rec) {
        check(browser.headless === false, "a recorded headless Firefox context ran headed");
        check(fs.existsSync(rec.record.path), "its MP4 exists");
      } else {
        check(browser.headless !== false, "an unrecorded headless Firefox context stayed headless");
      }
    },
  },
  "spec-false": {
    spec: uiSpec("sf", "chrome", { autoScreenshot: false, autoRecord: false }),
    check(report, check) {
      expectNoScreenshots(report, check);
      check(!autoRecord(report), "there's no ~autorecord step");
    },
  },
  "test-false-under-spec-true": {
    spec: uiSpec("tf", "chrome", { autoScreenshot: true, autoRecord: false }, { autoScreenshot: false }),
    check: expectNoScreenshots,
  },
  // `-r junit` leaves out runFolder, but the run folder still runs (DA6).
  "junit-run-folder": {
    spec: shellSpec,
    args: ["-r", "junit"],
    check(report, check, dir) {
      check(fs.existsSync(path.join(report.runDir, "testResults.json")), "the run folder holds testResults.json");
      check(fs.readdirSync(dir).some((f) => f.endsWith(".xml")), "the junit report exists");
    },
  },
  // The recording default per context (recording/autorecord-defaults.spec.json).
  // A headed browser records the screen with ffmpeg where the host can
  // capture it; a host that can't adds no step, warns, and still passes.
  "headed-chrome-record": {
    spec: uiSpec("hcr", "chrome", {}, { runOn: [{ platforms: everywhere, browsers: { name: "chrome", headless: false } }] }),
    check: expectScreenRecording,
  },
  "headed-firefox-record": {
    spec: uiSpec("hfr", "firefox", {}, { runOn: [{ platforms: everywhere, browsers: { name: "firefox", headless: false } }] }),
    check: expectScreenRecording,
  },
  // Headless Chrome with an authored record: the author's recording wins.
  "headless-chrome-authored-record": {
    spec: {
      specId: "har",
      tests: [
        {
          testId: "har-t",
          runOn: runOn("chrome"),
          steps: [
            { stepId: "open", goTo: "http://localhost:8092" },
            { stepId: "rec", record: { path: "authored.mp4", overwrite: "true" } },
            { stepId: "body", find: { selector: "body", timeout: 5000 } },
            { stepId: "stop", stopRecord: true },
          ],
        },
      ],
    },
    check(report, check, dir) {
      check(contexts(report).length === 1 && contexts(report)[0].result === "PASS", "the context passed");
      check(!autoRecord(report), "there's no ~autorecord step");
      check(fs.existsSync(path.join(dir, "authored.mp4")), "the authored recording exists");
    },
  },
  "autorecord-false": {
    spec: uiSpec("arf", "chrome", { autoRecord: false }),
    check(report, check) {
      check(contexts(report).length === 1 && contexts(report)[0].result === "PASS", "the context passed");
      check(!autoRecord(report), "there's no ~autorecord step");
    },
  },
  "junit-both-false": {
    spec: shellSpec,
    args: ["-r", "junit", "--no-auto-screenshot", "--no-auto-record"],
    check(report, check, dir) {
      check(!fs.existsSync(path.join(dir, ".doc-detective")), "there's no run folder");
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
// A short folder: the run folder nests deep, and the bundled ffmpeg can't
// write past Windows' 260-character path limit.
const dir = path.join(root, ".tmp", "fac", name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "case.spec.json"), JSON.stringify(c.spec, null, 2));

const env = {
  ...process.env,
  DOC_DETECTIVE_CONFIG: JSON.stringify({ telemetry: { send: false }, autoUpdate: false }),
  DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
};
delete env.DOC_DETECTIVE;
const run = spawnSync(
  process.execPath,
  [path.join(root, "bin", "doc-detective.js"), "-i", "case.spec.json", "-o", "results.json", ...(c.args ?? [])],
  { cwd: dir, env, encoding: "utf8", timeout: 280_000 }
);
const failures = [];
const check = (ok, what) => {
  if (!ok) failures.push(what);
};
if (run.error) failures.push(`the run finished (${run.error.message})`);
check(run.status === 0, `the run exited 0 (got ${run.status})`);
let report;
try {
  report = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
} catch (error) {
  failures.push(`results.json is readable (${error.message})`);
}
if (report) c.check(report, check, dir, String(run.stderr));
if (failures.length > 0) {
  console.error(`Case ${name} failed:\n- ${failures.join("\n- ")}`);
  console.error(`stderr: ${String(run.stderr).slice(-3000)}`);
  process.exit(1);
}
console.log(`Case ${name}: passed.`);
