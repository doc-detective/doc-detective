// Every reporter names the same items (ADR 01180), run by
// reporters/reporter-parity.spec.json.
//
//   node test/core-artifacts/reporters/reporter-parity.cjs <case>
//
// Each case writes a spec to .tmp/frp/<case>/, outside test/core-artifacts/ so it
// never runs as a fixture itself, runs the real CLI there, and checks what each
// reporter wrote. Exits 1 on any mismatch. The mixed case browses the 8092 test
// server in headless Chrome.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { XMLParser } = require("fast-xml-parser");

const here = { win32: "windows", darwin: "mac" }[process.platform] ?? "linux";
const elsewhere = here === "windows" ? "linux" : "windows";
const headlessChrome = [{ platforms: [here], browsers: { name: "chrome", headless: true } }];
const mixedSpec = {
  specId: "mixed",
  tests: [
    {
      testId: "passes",
      description: "Passes",
      runOn: headlessChrome,
      steps: [{ stepId: "open", goTo: "http://localhost:8092" }],
    },
    {
      testId: "fails",
      description: "Fails",
      runOn: headlessChrome,
      steps: [
        { stepId: "open", goTo: "http://localhost:8092" },
        { stepId: "missing", description: "Find what isn't there", find: { selector: "#not-on-this-page", timeout: 1000 } },
        { stepId: "after", runShell: "echo never" },
      ],
    },
    {
      testId: "skips",
      description: "Skips",
      runOn: [{ platforms: [elsewhere] }],
      steps: [{ stepId: "there", runShell: "echo elsewhere" }],
    },
  ],
};
const shellSpec = (command) => ({ specId: "shell", tests: [{ testId: "shell-t", steps: [{ stepId: "run", runShell: command }] }] });

const read = (dir, file) => fs.readFileSync(path.join(dir, file), "utf8");
const lines = (text) => text.split(/\r?\n/);
const view = (html) => JSON.parse(/<script id="dd-report-view" type="application\/json">(.*?)<\/script>/s.exec(html)[1]);
const list = (value) => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
const parseJunit = (xml) => new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" }).parse(xml).testsuites;

const cases = {
  // One pass, one failing `find`, and one `runOn` skip, through every reporter.
  "parity-mixed-results": {
    spec: mixedSpec,
    args: ["-r", "terminal,junit,markdown,html"],
    status: 1,
    check(report, check, dir, stderr, stdout) {
      const contextOf = (testId) => report.specs[0].tests.find((t) => t.testId === testId).contexts[0];
      const failing = `mixed › fails › ${contextOf("fails").contextId} › missing`;
      const skipping = `mixed › skips › ${contextOf("skips").contextId}`;
      const reason = contextOf("fails").steps[1].resultDescription;
      const verdict = "1 of 3 tests failed (1 skipped).";
      check(contextOf("skips").result === "SKIPPED", `the runOn test skipped (${contextOf("skips").result})`);
      const skipReason = contextOf("skips").resultDescription;
      check(/^Skipped: .+\.$/.test(skipReason), `the skip reads \`Skipped: <reason>.\` (${skipReason})`);

      // Terminal.
      const out = lines(stdout);
      check(out.includes("Failed (1):"), "the terminal lists one failure");
      check(out.includes("Skipped (1):"), "the terminal lists one skip");
      check(out.includes(`1. ${failing} — Find what isn't there`), `the terminal names ${failing}`);
      check(out.includes(`1. ${skipping} — Skips`), `the terminal names ${skipping}`);
      check(out.includes(`   ${reason}`), "the terminal gives the reason");
      check(out.includes(`   ${skipReason}`), "the terminal gives the skip reason");
      check(out.includes("   1 more step skipped after the failure."), "the terminal gives the fold count");
      check(out.at(-2) === verdict, `the terminal ends with the verdict (${out.at(-2)})`);
      const screenshot = out.find((line) => line.startsWith("   Screenshot: "))?.slice("   Screenshot: ".length);
      check(screenshot && path.isAbsolute(screenshot) && fs.existsSync(screenshot), `the terminal's screenshot is absolute and exists (${screenshot})`);

      // JUnit.
      const xml = read(dir, "junit.xml");
      const suite = list(parseJunit(xml).testsuite)[0];
      const testcases = list(suite.testcase);
      const failed = testcases.find((c) => c.failure);
      check(suite["@_timestamp"] === report.startedAt, "JUnit has the suite timestamp");
      check(list(suite.properties?.property).some((p) => p["@_name"] === "runId" && p["@_value"] === report.runId), "JUnit has the runId property");
      check(failed?.["@_classname"] === "mixed", "JUnit's classname is the spec ID");
      check(String(failed?.["@_name"]).startsWith(`fails › ${contextOf("fails").contextId}`), `JUnit names the failing case (${failed?.["@_name"]})`);
      check(String(failed?.failure?.["#text"]).includes(failing), "JUnit names the failing ID path");
      check(failed?.failure?.["@_message"] === reason, "JUnit gives the reason");
      check(String(failed?.failure?.["#text"]).includes("1 more step skipped after the failure."), "JUnit gives the fold count");
      const skipped = testcases.find((c) => c.skipped);
      check(String(skipped?.["@_name"]).startsWith(`skips › ${contextOf("skips").contextId}`), `JUnit names the skipped case (${skipped?.["@_name"]})`);
      const attachment = /\[\[ATTACHMENT\|(.*?)\]\]/.exec(xml)?.[1];
      check(attachment && fs.existsSync(path.join(dir, attachment)), `JUnit's first attachment exists relative to junit.xml (${attachment})`);

      // Markdown.
      const md = read(dir, "doc-detective-summary.md");
      check(md.includes(`**Failed** — ${verdict}`), "Markdown gives the verdict");
      check(md.includes(`\`${failing}\``), `Markdown names ${failing}`);
      check(md.includes(`\`${skipping}\``), `Markdown names ${skipping}`);
      check(md.includes("1 more step skipped after the failure."), "Markdown gives the fold count");
      const shot = /Screenshot: `(.*?)`/.exec(md)?.[1];
      check(shot && fs.existsSync(path.join(dir, shot)), `Markdown's screenshot exists relative to the summary (${shot})`);
      check(/Run artifacts: `\.doc-detective\/runs\//.test(md), "Markdown points at the run folder");

      // Both HTML copies.
      const flat = `testResults-${report.runId}.html`;
      const copies = [path.join(dir, flat), path.join(report.runDir, "testResults.html")];
      const views = copies.map((file) => view(fs.readFileSync(file, "utf8")));
      views.forEach((pageView, i) => {
        const name = path.basename(copies[i]);
        check(pageView.verdict?.text === verdict, `${name} gives the verdict`);
        const hrefs = Object.values(pageView.hrefs);
        check(hrefs.length > 0, `${name} has hrefs`);
        for (const href of hrefs) {
          check(fs.existsSync(path.join(path.dirname(copies[i]), decodeURIComponent(href))), `${name} resolves ${href}`);
        }
      });
      for (const announced of [`HTML report: ${path.join(fs.realpathSync(dir), flat)}`, "JUnit report: ", "Markdown summary: ", "Run report: ", "Run results: "]) {
        check(stderr.includes(announced), `stderr announces ${announced}`);
      }
    },
  },
  // `--json` stdout is only JSON, and the announcements are on stderr.
  "parity-json-stdout": {
    spec: shellSpec("echo hi"),
    args: ["--json", "-r", "junit,markdown,html"],
    check(report, check, dir, stderr, stdout) {
      let parsed;
      try {
        parsed = JSON.parse(stdout);
      } catch (error) {
        check(false, `stdout parses as JSON (${error.message})`);
      }
      check(parsed?.summary?.tests?.pass === 1, "stdout is the results");
      for (const kind of ["JUnit report: ", "Markdown summary: ", "HTML report: "]) {
        check(stderr.includes(kind), `stderr announces ${kind}`);
      }
    },
  },
  // With no run folder, nothing points at one.
  "parity-no-run-folder": {
    spec: shellSpec("exit 3"),
    args: ["--no-auto-screenshot", "--no-auto-record", "-r", "junit,markdown"],
    status: 1,
    check(report, check, dir) {
      check(!fs.existsSync(path.join(dir, ".doc-detective")), "there's no run folder");
      check(!read(dir, "junit.xml").includes("[[ATTACHMENT|"), "JUnit has no attachments");
      check(!read(dir, "doc-detective-summary.md").includes("Run artifacts"), "Markdown has no Run artifacts line");
    },
  },
  // Announcements are info level.
  "parity-quiet": {
    spec: shellSpec("echo hi"),
    args: ["-l", "warning", "-r", "junit"],
    check(report, check, dir, stderr) {
      check(!stderr.includes("JUnit report:"), "there's no JUnit report line at -l warning");
      check(fs.existsSync(path.join(dir, "junit.xml")), "junit.xml exists");
    },
  },
};

const name = process.argv[2];
const c = cases[name];
if (!c) {
  console.error(`Couldn't find case \`${name}\`. Cases: ${Object.keys(cases).join(", ")}.`);
  process.exit(1);
}
const root = path.resolve(__dirname, "../../..");
// A short folder: the run folder nests deep, and Windows has a 260-character path
// limit. A temp folder of its own keeps this run from clearing the job's recordings,
// and short because Chrome on Linux puts a socket there (see cli/auto-capture.cjs).
const dir = path.join(root, ".tmp", "frp", name);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, "case.spec.json"), JSON.stringify(c.spec, null, 2));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ddfrp-"));
const env = {
  ...process.env,
  TMPDIR: tmp,
  TEMP: tmp,
  TMP: tmp,
  DOC_DETECTIVE_CONFIG: JSON.stringify({ telemetry: { send: false }, autoUpdate: false }),
  DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1",
  NO_COLOR: "1",
};
delete env.DOC_DETECTIVE;
delete env.FORCE_COLOR;
const run = spawnSync(
  process.execPath,
  [path.join(root, "bin", "doc-detective.js"), "-i", "case.spec.json", "-o", "results.json", ...c.args],
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
  report = JSON.parse(read(dir, "results.json"));
} catch (error) {
  failures.push(`results.json is readable (${error.message})`);
}
if (report) c.check(report, check, dir, String(run.stderr), String(run.stdout));
if (failures.length > 0) {
  console.error(`Case ${name} failed:\n- ${failures.join("\n- ")}`);
  console.error(`stderr: ${String(run.stderr).slice(-3000)}`);
  console.error(`stdout: ${String(run.stdout).slice(-3000)}`);
  process.exit(1);
}
console.log(`Case ${name}: passed.`);
