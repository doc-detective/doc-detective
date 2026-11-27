// Runs a DITA task through the real CLI with step detection on (ADR 01227),
// and checks that `Type <userinput>…</userinput> into the <uicontrol>…</uicontrol>`
// types into the field the <uicontrol> labels.
//
//   node test/core-artifacts/interactions/dita-type-into-uicontrol.cjs
//
// The fixture jobs run with detectSteps off, so the document lives under
// .tmp/fixture-dita-type/, where the job's own run doesn't pick it up, and
// this script runs it with a config that turns detection on.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const root = path.resolve(__dirname, "..", "..", "..");
const dir = path.join(root, ".tmp", "fixture-dita-type");
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });

// The last step checks #echo, which the page fills on every keystroke, so a
// type step that found the wrong element or none fails the run.
fs.writeFileSync(
  path.join(dir, "type-into-field.dita"),
  `<?xml version="1.0" encoding="UTF-8"?>
<task id="type-into-field">
  <title>Type into a field</title>
  <taskbody>
    <steps>
      <step><cmd>Go to <xref href="http://localhost:8092/type-echo.html" scope="external">the page</xref>.</cmd></step>
      <step><cmd>Type <userinput>Hello, DITA</userinput> into the <uicontrol>Type here:</uicontrol> field.</cmd></step>
    </steps>
  </taskbody>
  <!-- step {"find": {"selector": "#echo", "elementText": "Hello, DITA"}} -->
</task>
`
);
fs.writeFileSync(
  path.join(dir, "config.json"),
  JSON.stringify({
    detectSteps: true,
    telemetry: { send: false },
    runOn: [{ platforms: ["windows", "mac", "linux"], browsers: [{ name: "firefox", headless: true }] }],
  })
);

// Its own temp folder, so this run doesn't clear the job's.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "dddita-"));
const env = { ...process.env, TMPDIR: tmp, TEMP: tmp, TMP: tmp, DOC_DETECTIVE_SKIP_AUTO_UPDATE: "1" };
delete env.DOC_DETECTIVE_CONFIG;
const run = spawnSync(
  process.execPath,
  [path.join(root, "bin", "doc-detective.js"), "-c", "config.json", "-i", "type-into-field.dita", "-o", "results.json"],
  { cwd: dir, env, encoding: "utf8", timeout: 280_000 }
);
try {
  fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 500 });
} catch {}

const failures = [];
if (run.error) failures.push(`Couldn't finish the CLI run: ${run.error.message}.`);
if (run.status !== 0) failures.push(`the run exited 0 (got ${run.status})`);
let steps = [];
try {
  const report = JSON.parse(fs.readFileSync(path.join(dir, "results.json"), "utf8"));
  steps = report.specs.flatMap((s) => s.tests.flatMap((t) => t.contexts.flatMap((c) => c.steps)));
} catch (error) {
  failures.push(`results.json is readable (${error.message})`);
}
const type = steps.find((s) => s.type);
if (!type) failures.push("a type step was detected");
else {
  if (type.type.elementAria !== "Type here:") failures.push(`the type step names the field by elementAria (got ${JSON.stringify(type.type)})`);
  if ("selector" in type.type) failures.push(`the type step has no CSS selector (got ${JSON.stringify(type.type)})`);
}
for (const s of steps) if (s.result !== "PASS") failures.push(`step ${JSON.stringify(s)} passed`);
if (failures.length > 0) {
  console.error(`Couldn't verify DITA typing:\n- ${failures.join("\n- ")}`);
  console.error(`stderr: ${String(run.stderr).slice(-3000)}`);
  process.exit(1);
}
console.log(`Typed into the <uicontrol> field: ${steps.length} steps passed.`);
