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
const os = require("os");
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
// The automatic recording is the context's field, not a step (ADR 01179).
const autoRecording = (report) => contexts(report)[0]?.autoRecording;
const savedRecording = (report, rec) =>
  /\.mp4$/i.test(rec?.recordingPath ?? "") && fs.existsSync(path.join(report.runDir, rec.recordingPath));

// Every authored UI step has an image in the run folder, and the first is 01-….
// The step's field is autoScreenshotPath; the pre-5.0 name is gone (ADR 01184).
function expectScreenshots(report, check) {
  const shots = authored(report).map((s) => s.autoScreenshotPath);
  check(shots.length === uiSteps.length && shots.every(Boolean), `every UI step has an autoScreenshotPath (${JSON.stringify(shots)})`);
  check(steps(report).every((s) => !("autoScreenshot" in s)), "no step has the old autoScreenshot field");
  for (const shot of shots.filter(Boolean)) check(fs.existsSync(path.join(report.runDir, shot)), `${shot} exists in the run folder`);
  check(path.basename(String(shots[0])).startsWith("01-"), `the first authored image is 01-… (${shots[0]})`);
}
// A folder of links to everything on PATH except `binary`, to use as PATH.
function pathWithout(binary, dir) {
  const links = path.join(dir, "path");
  fs.mkdirSync(links);
  const seen = new Set([binary]);
  for (const folder of process.env.PATH.split(path.delimiter)) {
    for (const name of fs.existsSync(folder) ? fs.readdirSync(folder) : []) {
      if (seen.has(name)) continue;
      seen.add(name);
      fs.symlinkSync(path.join(folder, name), path.join(links, name));
    }
  }
  return links;
}
// A headed context records the screen with ffmpeg where the host can capture
// it. A host that can't adds no recording (or skips a start that fails), and
// the context passes either way.
function expectScreenRecording(report, check, dir, stderr) {
  check(contexts(report).length === 1 && contexts(report)[0].result === "PASS", "the context passed");
  const rec = autoRecording(report);
  if (!rec) {
    check(stderr.includes("Not recording automatically:"), "a host that can't record says why");
    return;
  }
  if (rec.result === "PASS") check(savedRecording(report, rec), "its MP4 exists under runDir");
}
function expectNoScreenshots(report, check) {
  check(steps(report).every((s) => !s.autoScreenshotPath && !s.autoScreenshot), "no step has an autoScreenshotPath");
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
      const rec = autoRecording(report);
      check(rec?.result === "PASS", `the context's autoRecording passed (${rec?.result})`);
      check(savedRecording(report, rec), "its MP4 exists under runDir");
      check(rec?.format === "mp4", `its format is mp4 (${rec?.format})`);
      // The report has no synthetic step, marker, or count for it.
      check(!/__autoRecord|~autorecord/.test(JSON.stringify(report)), "the report has no synthetic step or marker");
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
      const rec = autoRecording(report);
      const browser = contexts(report)[0].browser ?? {};
      if (rec) {
        check(browser.headless === false, "a recorded headless Firefox context ran headed");
        check(savedRecording(report, rec), "its MP4 exists under runDir");
      } else {
        check(browser.headless !== false, "an unrecorded headless Firefox context stayed headless");
      }
    },
  },
  // Both HTML copies show the automatic media: the run folder's
  // testResults.html and the html reporter's copy in outputDir each point at
  // every automatic screenshot and the context's MP4 through the hrefs in their
  // dd-report-view.
  "html-media": {
    spec: uiSpec("hm", "chrome"),
    args: ["-r", "html"],
    check(report, check, dir) {
      const flat = fs.readdirSync(dir).find((f) => /^testResults-.*\.html$/.test(f));
      check(flat, "the html reporter wrote its copy");
      const copies = [path.join(report.runDir, "testResults.html"), flat && path.join(dir, flat)].filter(Boolean);
      const media = [
        ...authored(report).map((s) => s.autoScreenshotPath).filter(Boolean),
        autoRecording(report)?.recordingPath,
      ];
      check(media.length === uiSteps.length + 1 && media.every(Boolean), "there are automatic screenshots and a recording");
      for (const file of copies) {
        const html = fs.readFileSync(file, "utf8");
        const hrefs = JSON.parse(/<script id="dd-report-view" type="application\/json">(.*?)<\/script>/s.exec(html)?.[1] ?? "{}").hrefs ?? {};
        for (const rel of media.filter(Boolean)) {
          const resolved = path.join(path.dirname(file), decodeURIComponent(hrefs[rel] ?? ""));
          check(hrefs[rel] && fs.existsSync(resolved), `${path.basename(file)} resolves ${rel}`);
        }
      }
    },
  },
  // autoRecord: true where the start fails stops the context (ADR 01179, DR2).
  // A path with an unset variable fails the start on every host.
  "strict-start-fails": {
    spec: uiSpec("ssf", "chrome", { autoRecord: true }, { testId: "ssf$DD_FAC_UNSET" }),
    status: 1,
    check(report, check) {
      const context = contexts(report)[0];
      check(context?.result === "FAIL", `the context failed (${context?.result})`);
      check(context?.autoRecording?.result === "FAIL", `autoRecording failed (${context?.autoRecording?.result})`);
      check(
        /^Couldn't start the recording\./.test(context?.autoRecording?.resultDescription ?? ""),
        `it says why (${context?.autoRecording?.resultDescription})`
      );
      check(!context?.autoRecording?.recordingPath, "it has no recordingPath");
      const results = authored(report).map((s) => s.result);
      check(results.length === uiSteps.length && results.every((r) => r === "SKIPPED"), `the steps were SKIPPED (${results})`);
    },
  },
  // autoRecord: true where the preflight can't capture: SKIPPED with the fix
  // (ADR 01179, DR3). Hides every display from the nested run, so this is
  // Linux only.
  "strict-no-display": {
    spec: uiSpec("snd", "firefox", { autoRecord: true }),
    env(env, dir) {
      delete env.DISPLAY;
      env.PATH = pathWithout("Xvfb", dir);
    },
    check(report, check) {
      const context = contexts(report)[0];
      check(context?.result === "PASS", `the context passed (${context?.result})`);
      check(context?.browser?.headless !== false, "it stayed headless");
      check(context?.autoRecording?.result === "SKIPPED", `autoRecording was SKIPPED (${context?.autoRecording?.result})`);
      check(
        context?.autoRecording?.resultDescription ===
          "Skipped: there's no display to capture. To record, install Xvfb or set DISPLAY, and rerun.",
        `it names the fix (${context?.autoRecording?.resultDescription})`
      );
    },
  },
  "spec-false": {
    spec: uiSpec("sf", "chrome", { autoScreenshot: false, autoRecord: false }),
    check(report, check) {
      expectNoScreenshots(report, check);
      check(!autoRecording(report), "there's no autoRecording");
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
      check(!autoRecording(report), "there's no autoRecording");
      check(fs.existsSync(path.join(dir, "authored.mp4")), "the authored recording exists");
    },
  },
  "autorecord-false": {
    spec: uiSpec("arf", "chrome", { autoRecord: false }),
    check(report, check) {
      check(contexts(report).length === 1 && contexts(report)[0].result === "PASS", "the context passed");
      check(!autoRecording(report), "there's no autoRecording");
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

// Each run clears its temp folder as it starts (cleanTemp), and this nested
// run shares a host with the fixture job's own recordings and the other
// cases. A temp folder of its own keeps it from deleting their in-progress
// recordings. It's short and under the system temp folder: Chrome on Linux
// puts a socket there, and socket paths can't pass about 108 characters.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ddfac-"));
const env = {
  ...process.env,
  TMPDIR: tmp,
  TEMP: tmp,
  TMP: tmp,
  DOC_DETECTIVE_CONFIG: JSON.stringify({ telemetry: { send: false }, autoUpdate: false }),
  DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
};
delete env.DOC_DETECTIVE;
c.env?.(env, dir);
const run = spawnSync(
  process.execPath,
  [path.join(root, "bin", "doc-detective.js"), "-i", "case.spec.json", "-o", "results.json", ...(c.args ?? [])],
  { cwd: dir, env, encoding: "utf8", timeout: 280_000 }
);
// A browser the run left behind can hold this folder for a moment on Windows.
// Cleaning up isn't what a case checks, so a leftover folder doesn't fail it.
try {
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
} catch {}
const failures = [];
const check = (ok, what) => {
  if (!ok) failures.push(what);
};
if (run.error) failures.push(`the run finished (${run.error.message})`);
check(run.status === (c.status ?? 0), `the run exited ${c.status ?? 0} (got ${run.status})`);
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
